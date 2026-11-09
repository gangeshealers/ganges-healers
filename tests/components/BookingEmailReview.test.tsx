import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BookingEmailReviewForm } from '@/components/admin/booking-email-review-form'
import type { BookingEmailDecisionResult, BookingEmailReviewRecord } from '@/lib/admin/booking-emails'
import { useSession } from 'next-auth/react'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const session = jest.mocked(useSession)
const record: BookingEmailReviewRecord = { id: 'event', status: 'REVIEW', version: 'a'.repeat(64), canAccept: true, canStop: true, providerMessageId: null, sentAt: null, leaseUntil: null }
let save: jest.Mock
let reload: jest.Mock
const view = (row = record) => <BookingEmailReviewForm actorId="admin" record={row} onSave={save} onReload={reload} />
beforeEach(() => {
  jest.clearAllMocks()
  session.mockReturnValue({ data: { user: { id: 'admin', role: 'ADMIN', vip: false, freeSessionCredits: 0 }, expires: '2099-01-01' }, status: 'authenticated', update: jest.fn() })
  save = jest.fn().mockResolvedValue({ success: true, record: { ...record, status: 'SENT', canAccept: false, canStop: false, providerMessageId: 'verified-provider-id' } })
  reload = jest.fn().mockResolvedValue({ success: true, record: { ...record, version: 'b'.repeat(64) } })
})

test('acceptance requires a reason and safe verified provider reference before review', () => {
  render(view())
  fireEvent.click(screen.getByRole('button', { name: 'Record provider acceptance' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a reason')
  fireEvent.change(screen.getByLabelText('Reason for decision'), { target: { value: 'Matched external provider records' } })
  fireEvent.change(screen.getByLabelText('Verified provider message ID'), { target: { value: 'private@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record provider acceptance' }))
  expect(screen.getByRole('alert')).toHaveTextContent('message ID verified')
  expect(save).not.toHaveBeenCalled()
})

test('a reviewed acceptance saves once with the displayed identity, version and reason', async () => {
  let finish!: (result: BookingEmailDecisionResult) => void
  save.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  render(view())
  fireEvent.change(screen.getByLabelText('Reason for decision'), { target: { value: ' Verified external acceptance ' } })
  fireEvent.change(screen.getByLabelText('Verified provider message ID'), { target: { value: 'verified-provider-id' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record provider acceptance' }))
  const dialog = screen.getByRole('dialog', { name: 'Record verified acceptance?' })
  expect(within(dialog).getByText('Verified external acceptance')).toBeVisible()
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm acceptance' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Saving…' }))
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith({ ownerId: 'admin', id: record.id, version: record.version, reason: 'Verified external acceptance', decision: 'accepted', providerMessageId: 'verified-provider-id' })
  await act(async () => { finish({ success: true, record: { ...record, status: 'SENT', canAccept: false, canStop: false, providerMessageId: 'verified-provider-id' } }) })
  expect(await screen.findByRole('status')).toHaveTextContent('Provider acceptance recorded')
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('stopping an unattempted intent needs no provider reference and has a separate reviewed decision', async () => {
  save.mockResolvedValue({ success: true, record: { ...record, status: 'SKIPPED', canAccept: false, canStop: false } })
  render(view({ ...record, canAccept: false }))
  fireEvent.change(screen.getByLabelText('Reason for decision'), { target: { value: 'Customer requested no message' } })
  fireEvent.click(screen.getByRole('button', { name: 'Stop automatic retries' }))
  const dialog = screen.getByRole('dialog', { name: 'Stop automatic retries?' })
  expect(within(dialog).getByText(/request already in flight/)).toBeVisible()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm stop' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith({ ownerId: 'admin', id: 'event', version: record.version, reason: 'Customer requested no message', decision: 'stopped' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Automatic retries stopped')
})

test.each(['EMAIL_CHANGED', 'REVIEW_FAILED'])('%s retains the reason and requires reload', async code => {
  save.mockResolvedValue({ success: false, code, error: 'Reload the latest delivery state.' })
  render(view())
  fireEvent.change(screen.getByLabelText('Reason for decision'), { target: { value: 'Keep this reviewed reason' } })
  fireEvent.click(screen.getByRole('button', { name: 'Stop automatic retries' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm stop' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Reload the latest')
  expect(screen.getByLabelText('Reason for decision')).toHaveValue('Keep this reviewed reason')
  expect(screen.getByRole('button', { name: 'Stop automatic retries' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Reload message' }))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(reload).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Reason for decision')).toHaveValue('')
})

test('account changes hide drafts and discard a late save response', async () => {
  let finish!: (result: BookingEmailDecisionResult) => void
  save.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const rendered = render(view())
  fireEvent.change(screen.getByLabelText('Reason for decision'), { target: { value: 'Private staff draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Stop automatic retries' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm stop' }))
  session.mockReturnValue({ data: { user: { id: 'another', role: 'ADMIN', vip: false, freeSessionCredits: 0 }, expires: '2099-01-01' }, status: 'authenticated', update: jest.fn() })
  rendered.rerender(view())
  expect(screen.queryByDisplayValue('Private staff draft')).not.toBeInTheDocument()
  await act(async () => { finish({ success: true, record }) })
  expect(refresh).not.toHaveBeenCalled()
  expect(screen.queryByText('Automatic retries stopped.')).not.toBeInTheDocument()
})

test('an active lease exposes no action controls', () => {
  render(view({ ...record, canAccept: false, canStop: false, leaseUntil: '2099-01-01T00:00:00Z' }))
  expect(screen.getByRole('status')).toHaveTextContent('delivery attempt is active')
  expect(screen.queryByRole('button', { name: 'Record provider acceptance' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Stop automatic retries' })).not.toBeInTheDocument()
})

test('a background server refresh does not erase an open review dialog or draft', () => {
  const rendered = render(view())
  fireEvent.change(screen.getByLabelText('Reason for decision'), { target: { value: 'Keep this review open' } })
  fireEvent.click(screen.getByRole('button', { name: 'Stop automatic retries' }))
  rendered.rerender(view({ ...record, version: 'b'.repeat(64) }))
  const dialog = screen.getByRole('dialog', { name: 'Stop automatic retries?' })
  expect(dialog).toBeVisible()
  expect(within(dialog).getByText('Keep this review open')).toBeVisible()
  expect(save).not.toHaveBeenCalled()
})
