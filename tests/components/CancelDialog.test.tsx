import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CancelDialog from '@/components/bookings/CancelDialog'
import type { NormalizedBooking } from '@/app/dashboard/bookings/page'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/analytics/client', () => ({ track: jest.fn() }))
const session = jest.requireMock<{ useSession: jest.Mock }>('next-auth/react').useSession
const booking: NormalizedBooking = { id: 'cancel-booking', reviewVersion: 'a'.repeat(64), serviceSlug: 'yoga', serviceName: 'Yoga', healerName: 'Practitioner', healerId: 'healer', serviceId: 'service', startIso: new Date(Date.now() + 5 * 86400000).toISOString(), status: 'CONFIRMED', isCancelable: true, isReschedulable: true, amountPaise: 10000 }
let originalFetch: typeof global.fetch
beforeAll(() => { originalFetch = global.fetch })
afterAll(() => { global.fetch = originalFetch })
beforeEach(() => { session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'owner' } } }) })
function props() { return { open: true, ownerId: 'owner', booking, onSuccess: jest.fn(), onReload: jest.fn(), onOpenChange: jest.fn() } }
function saved(status = 'NOT_REQUIRED', id = booking.id) { return { success: true, data: { id, status: 'CANCELLED' }, refund: { band: 'FULL', refundPaise: status === 'NOT_REQUIRED' ? 0 : 10000, status, message: 'Saved cancellation outcome' } } }

test.each(['NOT_REQUIRED', 'SUCCESS', 'PENDING', 'UNKNOWN', 'FAILED', 'UNAVAILABLE'])('a validated %s cancellation preserves the recorded refund outcome', async status => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify(saved(status)), { status: 200 }))
  const p = props()
  render(<CancelDialog {...p} />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm cancel' }))
  expect(p.onSuccess).toHaveBeenCalledWith(saved(status).refund)
  expect(global.fetch).toHaveBeenCalledWith('/api/bookings/cancel-booking', expect.objectContaining({ method: 'DELETE', headers: { 'If-Match': '"' + booking.reviewVersion + '"' } }))
})

test.each(['network', 'wrong-booking', 'stale'] as const)('%s requires an explicit read rather than another cancellation', async kind => {
  global.fetch = jest.fn(async () => {
    if (kind === 'network') throw new TypeError('Connection lost')
    return new Response(JSON.stringify(kind === 'stale' ? { error: 'Booking changed. Reload your bookings.' } : saved('SUCCESS', 'other-booking')), { status: kind === 'stale' ? 409 : 200 })
  })
  const p = props()
  render(<CancelDialog {...p} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Confirm cancel' }))
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Confirm cancel' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Reload bookings' }))
  expect(p.onReload).toHaveBeenCalledTimes(1)
  expect(global.fetch).toHaveBeenCalledTimes(1)
  expect(p.onSuccess).not.toHaveBeenCalled()
})

test('an in-flight cancellation cannot double submit and its late reply cannot update a different account', async () => {
  let complete!: (response: Response) => void
  global.fetch = jest.fn(() => new Promise<Response>(resolve => { complete = resolve }))
  const p = props(), view = render(<CancelDialog {...p} />)
  const button = screen.getByRole('button', { name: 'Confirm cancel' })
  fireEvent.click(button); fireEvent.click(button)
  expect(global.fetch).toHaveBeenCalledTimes(1)
  session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'other-owner' } } })
  view.rerender(<CancelDialog {...p} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(async () => complete(new Response(JSON.stringify(saved()), { status: 200 })))
  expect(p.onSuccess).not.toHaveBeenCalled()
  expect(p.onOpenChange).not.toHaveBeenCalled()
})

test('a background refresh keeps the reviewed version, while missing versions require reload', async () => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify(saved()), { status: 200 }))
  const p = props(), view = render(<CancelDialog {...p} />)
  view.rerender(<CancelDialog {...p} booking={{ ...booking, reviewVersion: 'b'.repeat(64) }} />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm cancel' }))
  expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: { 'If-Match': '"' + booking.reviewVersion + '"' } }))
  view.rerender(<CancelDialog {...p} booking={{ ...booking, id: 'unreviewed', reviewVersion: undefined }} />)
  expect(screen.getByRole('button', { name: 'Confirm cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Reload bookings' })).toBeEnabled()
})

test('a cancellation window that closes while the dialog is open requires reload without a request', async () => {
  global.fetch = jest.fn()
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(booking.startIso) - 24 * 3600000 + 1)
  try {
    render(<CancelDialog {...props()} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm cancel' }))
    expect(screen.getByRole('alert')).toHaveTextContent('cancellation window changed')
    expect(global.fetch).not.toHaveBeenCalled()
  } finally { clock.mockRestore() }
})
