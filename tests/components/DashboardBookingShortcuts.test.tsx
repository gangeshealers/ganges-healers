import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import BookingActions from '@/components/dashboard/BookingActions'
import MyBookingsPage from '@/app/dashboard/bookings/page'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'owned-member' } }, status: 'authenticated' }),
}))
jest.mock('@/lib/analytics/client', () => ({ track: jest.fn() }))

const originalFetch = global.fetch
const fixture = {
  id: 'booking-owned', userId: 'owned-member', healerId: 'healer', serviceId: 'service',
  scheduledAt: new Date(Date.now() + 7 * 86400000).toISOString(), status: 'CONFIRMED',
  reviewVersion: 'a'.repeat(64), pricePaise: 25000, durationMin: 60,
  healer: { user: { name: 'Practitioner' } },
  service: { name: 'Healing session', slug: 'healing' },
  payment: { amountPaise: 25000, status: 'success' },
}
beforeEach(() => {
  window.history.replaceState({}, '', '/dashboard/bookings')
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/api/bookings') {
      return new Response(JSON.stringify({ success: true, data: [fixture] }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
})
afterEach(() => {
  global.fetch = originalFetch
  window.history.replaceState({}, '', '/dashboard/bookings')
})

test('dashboard action links are non-mutating and preserve encoded owned booking IDs', () => {
  render(<BookingActions bookingId="book/with?reserved" />)
  expect(screen.getByRole('link', { name: 'Reschedule' }))
    .toHaveAttribute('href', '/dashboard/bookings?reschedule=book%2Fwith%3Freserved')
  expect(screen.getByRole('link', { name: 'Review cancellation' }))
    .toHaveAttribute('href', '/dashboard/bookings?cancel=book%2Fwith%3Freserved')
  expect(global.fetch).not.toHaveBeenCalled()
})

test('owned reschedule shortcut opens the availability-checked dialog, not a guessed mutation', async () => {
  window.history.replaceState({}, '', '/dashboard/bookings?reschedule=booking-owned')
  render(<MyBookingsPage />)
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('Reschedule booking')
  expect(window.location.search).toBe('')
  expect(jest.mocked(global.fetch).mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(0)
})

test('owned cancellation shortcut requires a second confirmation before calling DELETE', async () => {
  window.history.replaceState({}, '', '/dashboard/bookings?cancel=booking-owned')
  render(<MyBookingsPage />)
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('Cancel booking')
  expect(dialog).toHaveTextContent('Refund eligibility')
  expect(window.location.search).toBe('')
  expect(jest.mocked(global.fetch).mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(0)
})

test('unknown or stale booking IDs cannot open an action dialog or trigger a write', async () => {
  window.history.replaceState({}, '', '/dashboard/bookings?cancel=another-account-booking')
  render(<MyBookingsPage />)
  expect(await screen.findByRole('status')).toHaveTextContent('cannot be changed from the shortcut')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(window.location.search).toBe('')
  expect(jest.mocked(global.fetch).mock.calls.filter(([, options]) => ['PUT', 'DELETE'].includes(options?.method ?? ''))).toHaveLength(0)
})

test('ambiguous deep links are discarded without choosing either destructive action', async () => {
  window.history.replaceState({}, '', '/dashboard/bookings?cancel=booking-owned&reschedule=booking-owned')
  render(<MyBookingsPage />)
  expect(await screen.findByRole('status')).toHaveTextContent('cannot be changed from the shortcut')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(window.location.search).toBe('')
})
