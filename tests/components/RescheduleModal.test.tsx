import React from 'react'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RescheduleModal from '@/components/bookings/RescheduleModal'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'
import type { NormalizedBooking } from '@/app/dashboard/bookings/page'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
const session = jest.requireMock<{ useSession: jest.Mock }>('next-auth/react').useSession
beforeEach(() => { session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'owner' } } }) })

jest.mock('@/lib/analytics/client', () => ({ track: jest.fn() }))

const booking: NormalizedBooking = {
  reviewVersion: 'a'.repeat(64), id: 'booking-1', healerId: 'healer-1', serviceId: 'service-1', serviceSlug: 'reiki',
  serviceName: 'Reiki', healerName: 'Healer', startIso: new Date(Date.now() + 5 * 86400000).toISOString(),
  status: 'CONFIRMED', isCancelable: true, isReschedulable: true, amountPaise: 5000,
}
let originalFetch: typeof global.fetch
beforeAll(() => { originalFetch = global.fetch })
afterAll(() => { global.fetch = originalFetch })

test('loads owned availability and submits the chosen India-time instant', async () => {
  const user = userEvent.setup()
  const date = clinicDate(new Date(Date.now() + 8 * 86400000))
  const expected = clinicSlotInstant(date, '10:00').toISOString()
  const onSuccess = jest.fn()
  const onOpenChange = jest.fn()
  const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).startsWith('/api/availability?')) {
      return new Response(JSON.stringify({ data: { slots: [
        { time: '10:00', available: true }, { time: '10:30', available: false },
      ] } }), { status: 200 })
    }
    if (String(url) === '/api/bookings/booking-1' && init?.method === 'PUT') {
      return new Response(JSON.stringify({ success: true, data: { id: booking.id, status: 'RESCHEDULED', reviewVersion: 'b'.repeat(64), scheduledAt: expected, meetingLink: null, needsConfirmation: true } }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  })
  global.fetch = fetchMock as typeof fetch
  render(<RescheduleModal open ownerId="owner" onReload={jest.fn()} onOpenChange={onOpenChange} booking={booking} onSuccess={onSuccess} />)
  await user.type(screen.getByLabelText('Select date'), date)
  const slot = await screen.findByRole('button', { name: '10:00 AM' })
  expect(screen.queryByRole('button', { name: '10:30 AM' })).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/availability?healerId=healer-1&date=' + date + '&bookingId=booking-1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  await user.click(slot)
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ startIso: expected, status: 'RESCHEDULED', meetingLink: null, needsConfirmation: true })))
  expect(fetchMock).toHaveBeenCalledWith('/api/bookings/booking-1', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ scheduledAt: expected }) }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('shows an availability error and does not offer invented times', async () => {
  const user = userEvent.setup()
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: 'Booking not found' }), { status: 404 })) as typeof fetch
  render(<RescheduleModal open ownerId="owner" onReload={jest.fn()} onOpenChange={jest.fn()} booking={booking} onSuccess={jest.fn()} />)
  await user.type(screen.getByLabelText('Select date'), clinicDate(new Date(Date.now() + 8 * 86400000)))
  expect(await screen.findByText('Booking not found')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
})


function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
async function chooseTime() {
  const user = userEvent.setup()
  const date = clinicDate(new Date(Date.now() + 8 * 86400000))
  await user.type(screen.getByLabelText('Select date'), date)
  await user.click(await screen.findByRole('button', { name: '10:00 AM' }))
  return { user, date, instant: clinicSlotInstant(date, '10:00').toISOString() }
}
function slotResponse() { return new Response(JSON.stringify({ data: { slots: [{ time: '10:00', available: true }] } }), { status: 200 }) }

test('a background refresh preserves the reviewed appointment and If-Match version', async () => {
  global.fetch = jest.fn(async (_url, init) => init?.method === 'PUT' ? new Response(JSON.stringify({ error: 'Booking changed. Reload your bookings.' }), { status: 409 }) : slotResponse())
  const onReload = jest.fn()
  const props = { open: true, ownerId: 'owner', onOpenChange: jest.fn(), booking, onSuccess: jest.fn(), onReload }
  const view = render(<RescheduleModal {...props} />)
  const { user } = await chooseTime()
  view.rerender(<RescheduleModal {...props} booking={{ ...booking, reviewVersion: 'c'.repeat(64), startIso: new Date(Date.now() + 20 * 86400000).toISOString() }} />)
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Booking changed')
  expect(global.fetch).toHaveBeenLastCalledWith('/api/bookings/booking-1', expect.objectContaining({ headers: expect.objectContaining({ 'If-Match': '"' + booking.reviewVersion + '"' }) }))
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Reload bookings' }))
  expect(onReload).toHaveBeenCalledTimes(1)
})

test.each(['network', 'malformed'] as const)('%s write result requires reload and cannot be blindly repeated', async failure => {
  global.fetch = jest.fn(async (_url, init) => {
    if (init?.method !== 'PUT') return slotResponse()
    if (failure === 'network') throw new TypeError('Network lost')
    return new Response(JSON.stringify({ success: true, data: { id: 'another-booking' } }), { status: 200 })
  })
  const onSuccess = jest.fn()
  render(<RescheduleModal open ownerId="owner" booking={booking} onSuccess={onSuccess} onReload={jest.fn()} onOpenChange={jest.fn()} />)
  const { user } = await chooseTime()
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/could not be confirmed/)
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  expect(onSuccess).not.toHaveBeenCalled()
  expect(jest.mocked(global.fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
})

test('double clicks send one change and an account switch discards its late response', async () => {
  const reply = deferred<Response>()
  global.fetch = jest.fn(async (_url, init) => init?.method === 'PUT' ? reply.promise : slotResponse())
  const props = { open: true, ownerId: 'owner', booking, onSuccess: jest.fn(), onReload: jest.fn(), onOpenChange: jest.fn() }
  const view = render(<RescheduleModal {...props} />)
  const { instant } = await chooseTime()
  const confirm = screen.getByRole('button', { name: 'Confirm' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  expect(jest.mocked(global.fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
  session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'another-owner' } } })
  view.rerender(<RescheduleModal {...props} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(async () => reply.resolve(new Response(JSON.stringify({ success: true, data: { id: booking.id, status: 'RESCHEDULED', reviewVersion: 'b'.repeat(64), scheduledAt: instant } }), { status: 200 })))
  expect(props.onSuccess).not.toHaveBeenCalled()
  expect(props.onOpenChange).not.toHaveBeenCalled()
})

test('malformed availability offers no invented slot and an unreviewed booking cannot submit', async () => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ data: { slots: [{ time: '25:99', available: true }] } }), { status: 200 }))
  const view = render(<RescheduleModal open ownerId="owner" booking={booking} onSuccess={jest.fn()} onReload={jest.fn()} onOpenChange={jest.fn()} />)
  await userEvent.setup().type(screen.getByLabelText('Select date'), clinicDate(new Date(Date.now() + 8 * 86400000)))
  expect(await screen.findByRole('alert')).toHaveTextContent('Available times could not be confirmed')
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  view.rerender(<RescheduleModal open ownerId="owner" booking={{ ...booking, id: 'unreviewed', reviewVersion: undefined }} onSuccess={jest.fn()} onReload={jest.fn()} onOpenChange={jest.fn()} />)
  expect(screen.getByLabelText('Select date')).toBeDisabled()
})

test('a rescheduling window that closes after choosing a slot requires a fresh review', async () => {
  global.fetch = jest.fn(async () => slotResponse())
  render(<RescheduleModal open ownerId="owner" booking={booking} onSuccess={jest.fn()} onReload={jest.fn()} onOpenChange={jest.fn()} />)
  const { user } = await chooseTime()
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(booking.startIso) - 24 * 3600000 + 1)
  try {
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByRole('alert')).toHaveTextContent('rescheduling window changed')
    expect(jest.mocked(global.fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
  } finally { clock.mockRestore() }
})
