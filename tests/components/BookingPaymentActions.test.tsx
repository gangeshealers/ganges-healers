import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BookingCard from '@/components/bookings/BookingCard'
import type { NormalizedBooking } from '@/app/dashboard/bookings/page'
import { openRazorpayCheckout } from '@/lib/payments/openRazorpayCheckout'
import { useSession } from 'next-auth/react'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/payments/openRazorpayCheckout', () => ({ openRazorpayCheckout: jest.fn() }))
const sessionMock = jest.mocked(useSession)
const gateway = jest.mocked(openRazorpayCheckout)
const saved: NormalizedBooking = { id: 'booking-fixture', serviceId: 'service', serviceSlug: 'yoga', serviceName: 'Yoga', healerId: 'healer', healerName: 'Fixture', startIso: '2099-01-01T10:00:00Z', amountPaise: 10000, status: 'PENDING', needsConfirmation: true, isCancelable: true, isReschedulable: true }
const proof = { razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: 'a'.repeat(64) }
const quote = { orderId: 'order_fixture', amountPaise: 10000, key: 'test_key', currency: 'INR' }
const storageKey = `ganges-booking-confirmation:owner:${saved.id}`
let fetchMock: jest.SpyInstance
let confirmed: jest.Mock
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })
const session = (id = 'owner') => ({ data: { user: { id, role: 'USER', vip: true, freeSessionCredits: 2 }, expires: '2099-01-01' }, status: 'authenticated' as const, update: jest.fn().mockResolvedValue(null) })
function card() { return <BookingCard booking={saved} ownerId="owner" onConfirmed={confirmed} onCancel={jest.fn()} onReschedule={jest.fn()} /> }
beforeEach(() => {
  sessionStorage.clear(); jest.clearAllMocks()
  sessionMock.mockReturnValue(session())
  gateway.mockResolvedValue(proof)
  fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response({ verified: true }) as Response)
  confirmed = jest.fn()
})
afterEach(() => { jest.restoreAllMocks() })

test('credit confirmation uses the owned endpoint and refreshes only on confirmed success', async () => {
  fetchMock.mockResolvedValueOnce(response({ ok: true }) as Response)
  render(card())
  fireEvent.click(screen.getByRole('button', { name: 'Use session credit' }))
  await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1))
  expect(fetchMock).toHaveBeenCalledWith(`/api/bookings/${saved.id}/confirm-with-credits`, { method: 'POST' })
  expect(gateway).not.toHaveBeenCalled()
})

test('a paid proof survives a failed verification and refresh without opening a second charge', async () => {
  fetchMock.mockResolvedValueOnce(response(quote) as Response).mockRejectedValueOnce(new TypeError('lost response'))
  const view = render(card())
  fireEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  await screen.findByRole('button', { name: 'Confirm payment' })
  await screen.findByRole('alert')
  expect(sessionStorage.getItem(storageKey)).toBe(JSON.stringify(proof))
  expect(screen.queryByRole('button', { name: 'Use session credit' })).not.toBeInTheDocument()
  view.unmount()
  render(card())
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm payment' }))
  await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1))
  expect(gateway).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(sessionStorage.getItem(storageKey)).toBeNull()
})

test('an invalid saved quote cannot open the gateway or display confirmation', async () => {
  fetchMock.mockResolvedValueOnce(response({ ...quote, amountPaise: -1 }) as Response)
  render(card())
  fireEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Payment could not be prepared')
  expect(gateway).not.toHaveBeenCalled()
  expect(confirmed).not.toHaveBeenCalled()
})

test('account changes while preparing payment prevent checkout and verification', async () => {
  let finish!: (value: Response) => void
  fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const view = render(card())
  fireEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  sessionMock.mockReturnValue(session('different-owner'))
  view.rerender(card())
  await act(async () => { finish(response(quote) as Response) })
  expect(gateway).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(confirmed).not.toHaveBeenCalled()
})

test('a stale unmounted booking cannot open a payment dialog', async () => {
  let finish!: (value: Response) => void
  fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const view = render(card())
  fireEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  view.unmount()
  await act(async () => { finish(response(quote) as Response) })
  expect(gateway).not.toHaveBeenCalled()
  expect(confirmed).not.toHaveBeenCalled()
})

test('a pending gateway payment does not offer credit replacement', () => {
  render(<BookingCard booking={{ ...saved, hasPaymentInProgress: true }} ownerId="owner" onConfirmed={confirmed} onCancel={jest.fn()} onReschedule={jest.fn()} />)
  expect(screen.getByRole('button', { name: 'Continue payment' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Use session credit' })).not.toBeInTheDocument()
})

test('an unpaid rescheduled appointment offers payment while keeping the pending-only credit rule', () => {
  render(<BookingCard booking={{ ...saved, status: 'RESCHEDULED' }} ownerId="owner" onConfirmed={confirmed} onCancel={jest.fn()} onReschedule={jest.fn()} />)
  expect(screen.getByRole('button', { name: 'Continue payment' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Use session credit' })).not.toBeInTheDocument()
})
