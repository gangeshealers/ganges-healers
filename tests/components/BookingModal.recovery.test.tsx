import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookingModal from '@/components/booking/BookingModal'
import BookingCard from '@/components/bookings/BookingCard'
import { openRazorpayCheckout } from '@/lib/payments/openRazorpayCheckout'
import { bookingPaymentProofKey } from '@/lib/bookings/payment-recovery'
import { clinicDate } from '@/lib/bookings/time'

const mockSession = jest.fn(), mockPush = jest.fn(), mockRefresh = jest.fn()
jest.mock('next-auth/react', () => ({ useSession: () => mockSession() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }))
jest.mock('@/lib/payments/openRazorpayCheckout', () => ({ openRazorpayCheckout: jest.fn() }))
const gateway = jest.mocked(openRazorpayCheckout)
const proof = { razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: 'a'.repeat(64) }
const quote = { orderId: 'order_fixture', amountPaise: 10000, currency: 'INR', key: 'test_key' }
const props = { isOpen: true, onClose: jest.fn(), healer: { id: 'healer', user: { name: 'Practitioner' }, experienceYears: 5, rating: 0 }, serviceId: 'service', serviceName: 'Recovery appointment' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const actor = (id = 'owner', vip = false) => ({ data: { user: { id, role: 'USER', vip, freeSessionCredits: 3 }, expires: '2099-01-01' }, status: 'authenticated', update: jest.fn().mockResolvedValue(null) })
const deferred = <T,>() => { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done }), resolve: (value: T) => resolve(value) } }
let fetchMock: jest.Mock, create: (init?: RequestInit) => Promise<Response>, order: () => Promise<Response>, verify: () => Promise<Response>, credit: () => Promise<Response>
const oldFetch = global.fetch, oldTest = process.env.TEST_MODE, oldPublicTest = process.env.NEXT_PUBLIC_TEST_MODE
beforeEach(() => {
  delete process.env.TEST_MODE; delete process.env.NEXT_PUBLIC_TEST_MODE
  jest.clearAllMocks(); sessionStorage.clear(); mockSession.mockReturnValue(actor())
  gateway.mockResolvedValue(proof)
  create = async init => json({ success: true, data: { id: 'saved-booking', userId: 'owner', status: 'PENDING', pricePaise: 10000, scheduledAt: JSON.parse(String(init?.body)).scheduledAt } }, 201)
  order = async () => json(quote); verify = async () => json({ verified: true }); credit = async () => json({ ok: true })
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/availability?')) return json({ data: { slots: [{ time: '10:00', available: true }] } })
    if (url === '/api/bookings') return create(init)
    if (url === '/api/payments/create-order') return order()
    if (url === '/api/payments/verify') return verify()
    if (url.endsWith('/confirm-with-credits')) return credit()
    throw new Error('Unexpected request')
  }); global.fetch = fetchMock
})
afterEach(() => {
  jest.restoreAllMocks(); global.fetch = oldFetch
  if (oldTest === undefined) delete process.env.TEST_MODE; else process.env.TEST_MODE = oldTest
  if (oldPublicTest === undefined) delete process.env.NEXT_PUBLIC_TEST_MODE; else process.env.NEXT_PUBLIC_TEST_MODE = oldPublicTest
})
async function choose() {
  const view = render(<BookingModal {...props} />)
  fireEvent.change(screen.getByLabelText('Select Date'), { target: { value: clinicDate(new Date(Date.now() + 5 * 86400000)) } })
  await userEvent.click(await screen.findByRole('button', { name: '10:00 AM' }))
  return view
}
const count = (path: string) => fetchMock.mock.calls.filter(([url]) => url === path).length

test('an order failure retries the saved appointment and cannot return to date selection', async () => {
  let failed = false
  order = async () => { if (!failed) { failed = true; return json({ error: 'Temporary quote outage' }, 503) } return json(quote) }
  await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  expect(await screen.findByText('Temporary quote outage')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  expect(await screen.findByText('Booking Confirmed!')).toBeVisible()
  expect(count('/api/bookings')).toBe(1); expect(count('/api/payments/create-order')).toBe(2)
  expect(gateway).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/payments/create-order').every(([, init]) => JSON.parse(init.body).bookingId === 'saved-booking')).toBe(true)
})

test('a dismissed checkout resumes the same booking and order', async () => {
  gateway.mockRejectedValueOnce(new Error('Payment dismissed'))
  await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  await screen.findByText(/Your appointment request is saved; you can continue payment/)
  await userEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  await screen.findByText('Booking Confirmed!')
  expect(count('/api/bookings')).toBe(1); expect(gateway).toHaveBeenCalledTimes(2)
  expect(gateway.mock.calls.every(([input]) => input.orderId === quote.orderId && input.amountPaise === 10000)).toBe(true)
})

test.each(['network', 'malformed', 'unverified'])('a %s verification result retains proof and retries only verification', async failure => {
  let first = true
  verify = async () => { if (first) { first = false; if (failure === 'network') throw new TypeError('lost reply'); return json(failure === 'malformed' ? {} : { verified: false }) } return json({ verified: true }) }
  await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  const confirm = await screen.findByRole('button', { name: 'Confirm payment' })
  expect(sessionStorage.getItem(bookingPaymentProofKey('owner', 'saved-booking'))).toBe(JSON.stringify(proof))
  expect(screen.queryByText('Booking Confirmed!')).not.toBeInTheDocument()
  await userEvent.click(confirm); await screen.findByText('Booking Confirmed!')
  expect(count('/api/bookings')).toBe(1); expect(count('/api/payments/create-order')).toBe(1); expect(count('/api/payments/verify')).toBe(2)
  expect(gateway).toHaveBeenCalledTimes(1)
  expect(sessionStorage.getItem(bookingPaymentProofKey('owner', 'saved-booking'))).toBeNull()
})

test('a submitted public-dialog receipt is recoverable by My Bookings after the modal closes', async () => {
  verify = async () => { throw new TypeError('lost reply') }
  const view = await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  await screen.findByRole('button', { name: 'Confirm payment' }); view.unmount()
  verify = async () => json({ verified: true })
  const confirmed = jest.fn()
  render(<BookingCard booking={{ id: 'saved-booking', serviceName: 'Recovery appointment', serviceSlug: 'recovery', serviceId: 'service', healerId: 'healer', healerName: 'Practitioner', startIso: '2000-01-01T10:00:00Z', amountPaise: 10000, status: 'PENDING', needsConfirmation: true, isCancelable: false, isReschedulable: false }} ownerId="owner" onConfirmed={confirmed} onReschedule={jest.fn()} onCancel={jest.fn()} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm payment' }))
  await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1))
  expect(count('/api/bookings')).toBe(1); expect(count('/api/payments/create-order')).toBe(1); expect(gateway).toHaveBeenCalledTimes(1)
})

test.each(['network', 'server', 'malformed'])('an uncertain %s creation requires an owned booking review instead of another POST', async failure => {
  create = async () => { if (failure === 'network') throw new TypeError('lost'); return json(failure === 'server' ? { error: 'unconfirmed' } : { success: true }, failure === 'server' ? 500 : 201) }
  await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Check My Bookings before requesting another appointment')
  expect(screen.queryByRole('button', { name: 'Confirm & Pay' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'View My Bookings' }))
  expect(mockPush).toHaveBeenCalledWith('/dashboard/bookings'); expect(count('/api/bookings')).toBe(1); expect(gateway).not.toHaveBeenCalled()
})

test('a definitive slot rejection keeps date selection available without starting payment', async () => {
  create = async () => json({ error: 'Time slot is no longer available' }, 409)
  await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Time slot is no longer available')
  expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled(); expect(gateway).not.toHaveBeenCalled()
})

test('an unknown credit result never starts checkout or creates a second appointment', async () => {
  mockSession.mockReturnValue(actor('owner', true)); credit = async () => { throw new TypeError('lost credit reply') }
  await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('session credit result could not be confirmed')
  expect(screen.queryByRole('button', { name: /Continue payment|Confirm & Pay/ })).not.toBeInTheDocument()
  expect(count('/api/bookings')).toBe(1); expect(count('/api/payments/create-order')).toBe(0); expect(gateway).not.toHaveBeenCalled()
})

test.each(['amount', 'currency', 'receipt'])('a mismatched %s requires review without claiming confirmation', async mismatch => {
  if (mismatch === 'amount') order = async () => json({ ...quote, amountPaise: 1 })
  if (mismatch === 'currency') order = async () => json({ ...quote, currency: 'USD' })
  if (mismatch === 'receipt') gateway.mockResolvedValue({ ...proof, razorpay_order_id: 'order_different' })
  await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  await screen.findByRole('button', { name: 'View My Bookings' })
  expect(screen.queryByRole('button', { name: /Continue payment|Confirm payment|Confirm & Pay/ })).not.toBeInTheDocument()
  expect(count('/api/payments/verify')).toBe(0); expect(count('/api/bookings')).toBe(1)
})

test('double clicks create and confirm one appointment', async () => {
  const reply = deferred<Response>(); create = () => reply.promise
  await choose(); const button = screen.getByRole('button', { name: 'Confirm & Pay' })
  fireEvent.click(button); fireEvent.click(button)
  expect(count('/api/bookings')).toBe(1)
  const init = fetchMock.mock.calls.find(([url]) => url === '/api/bookings')[1]
  await act(async () => reply.resolve(json({ data: { id: 'saved-booking', userId: 'owner', status: 'PENDING', pricePaise: 10000, scheduledAt: JSON.parse(init.body).scheduledAt } }, 201)))
  await screen.findByText('Booking Confirmed!'); expect(count('/api/payments/verify')).toBe(1)
})

test('an account switch before a quote returns cannot open checkout', async () => {
  const reply = deferred<Response>(); order = () => reply.promise
  const view = await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  mockSession.mockReturnValue(actor('other')); view.rerender(<BookingModal {...props} />)
  await act(async () => reply.resolve(json(quote)))
  expect(gateway).not.toHaveBeenCalled(); expect(count('/api/payments/verify')).toBe(0)
  expect(screen.getByLabelText('Select Date')).toHaveValue('')
})

test('an unsettled session cannot open checkout when a prior quote returns', async () => {
  const reply = deferred<Response>(); order = () => reply.promise
  const view = await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  mockSession.mockReturnValue({ ...actor(), status: 'loading' }); view.rerender(<BookingModal {...props} />)
  await act(async () => reply.resolve(json(quote)))
  expect(gateway).not.toHaveBeenCalled(); expect(count('/api/payments/verify')).toBe(0)
  expect(screen.getByRole('button', { name: 'Continue payment' })).toBeDisabled()
})

test('a late paid receipt stays with its original owner and is never verified as the next account', async () => {
  const reply = deferred<typeof proof>(); gateway.mockReturnValue(reply.promise)
  const view = await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  await waitFor(() => expect(gateway).toHaveBeenCalledTimes(1))
  mockSession.mockReturnValue(actor('other')); view.rerender(<BookingModal {...props} />)
  await act(async () => reply.resolve(proof))
  expect(sessionStorage.getItem(bookingPaymentProofKey('owner', 'saved-booking'))).toBe(JSON.stringify(proof))
  expect(sessionStorage.getItem(bookingPaymentProofKey('other', 'saved-booking'))).toBeNull()
  expect(count('/api/payments/verify')).toBe(0); expect(screen.queryByText('Booking Confirmed!')).not.toBeInTheDocument()
})

test('blocked browser storage keeps the submitted receipt available for in-memory verification', async () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
  let first = true; verify = async () => { if (first) { first = false; throw new TypeError('lost') } return json({ verified: true }) }
  await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  expect(await screen.findByText(/Keep this window open while confirming payment/)).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm payment' })); await screen.findByText('Booking Confirmed!')
  expect(gateway).toHaveBeenCalledTimes(1)
})

test('a quote arriving after the appointment cutoff cannot open checkout or start another order', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
  order = async () => { const init = fetchMock.mock.calls.find(([url]) => url === '/api/bookings')[1]; clock.mockReturnValue(Date.parse(JSON.parse(init.body).scheduledAt)); return json(quote) }
  await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('appointment start time has passed')
  await userEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  expect(gateway).not.toHaveBeenCalled(); expect(count('/api/payments/create-order')).toBe(1); expect(count('/api/bookings')).toBe(1)
})

test('a retained public-dialog receipt remains verifiable after the appointment starts', async () => {
  let first = true; verify = async () => { if (first) { first = false; throw new TypeError('lost') } return json({ verified: true }) }
  await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  const confirm = await screen.findByRole('button', { name: 'Confirm payment' })
  const init = fetchMock.mock.calls.find(([url]) => url === '/api/bookings')[1]
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(JSON.parse(init.body).scheduledAt) + 60000)
  await userEvent.click(confirm); await screen.findByText('Booking Confirmed!')
  expect(count('/api/payments/verify')).toBe(2); expect(gateway).toHaveBeenCalledTimes(1)
})

test('stale availability cannot replace the currently selected date', async () => {
  const first = deferred<Response>()
  const implementation = fetchMock.getMockImplementation()!
  let waiting = true
  fetchMock.mockImplementation((url, init) => { if (waiting && url.startsWith('/api/availability?')) { waiting = false; return first.promise } return implementation(url, init) })
  render(<BookingModal {...props} />)
  fireEvent.change(screen.getByLabelText('Select Date'), { target: { value: clinicDate(new Date(Date.now() + 4 * 86400000)) } })
  await userEvent.click(screen.getByRole('button', { name: 'Change Date' }))
  fireEvent.change(screen.getByLabelText('Select Date'), { target: { value: clinicDate(new Date(Date.now() + 5 * 86400000)) } })
  await screen.findByRole('button', { name: '10:00 AM' })
  await act(async () => first.resolve(json({ data: { slots: [{ time: '11:00', available: true }] } })))
  expect(screen.queryByRole('button', { name: '11:00 AM' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '10:00 AM' })).toBeVisible()
})

test('initial session loading waits before showing a date that would be reset by identity arrival', async () => {
  mockSession.mockReturnValue({ data: null, status: 'loading' })
  const view = render(<BookingModal {...props} />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your account')
  expect(screen.queryByLabelText('Select Date')).not.toBeInTheDocument()
  mockSession.mockReturnValue(actor()); view.rerender(<BookingModal {...props} />)
  expect(screen.getByLabelText('Select Date')).toBeVisible()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('anonymous test-mode convenience remains gated and does not reset its acknowledged result', async () => {
  process.env.TEST_MODE = '1'
  const update = jest.fn().mockResolvedValue(null)
  mockSession.mockReturnValue({ data: null, status: 'unauthenticated', update })
  const implementation = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((url, init) => url.startsWith('/api/test/login?') ? Promise.resolve(json({ ok: true })) : implementation(url, init))
  await choose(); await userEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  await screen.findByText('Booking Confirmed!')
  expect(count('/api/bookings/saved-booking/confirm-with-credits')).toBe(1)
  expect(gateway).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(mockRefresh).not.toHaveBeenCalled()
})
