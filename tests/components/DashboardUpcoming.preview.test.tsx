import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import DashboardClient from '@/app/dashboard/DashboardClient'

jest.mock('@/components/dashboard/BookingActions', () => ({
  __esModule: true,
  default: () => <div>Manage booking controls</div>,
}))

test('the dashboard keeps a route to all bookings and encourages new appointments when nothing is upcoming', () => {
  render(<DashboardClient bookings={[]} recentPosts={[]} courseEnrollments={[]} />)
  expect(screen.getByRole('heading', { name: 'Upcoming appointments' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View all bookings' })).toHaveAttribute('href', '/dashboard/bookings')
  expect(screen.getByText(/previous sessions are available in booking history/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Browse services' })).toHaveAttribute('href', '/services')
})

test('shows the session time in India rather than relying on the browser timezone', () => {
  render(<DashboardClient bookings={[{
    id: 'booking_123',
    status: 'CONFIRMED',
    scheduledAt: new Date('2026-11-30T21:00:00.000Z'),
    service: { name: 'Reiki Consultation' },
    healer: { user: { name: 'Practitioner' } },
    payment: null,
  }]} recentPosts={[]} courseEnrollments={[]} />)
  expect(screen.getByText('Reiki Consultation')).toBeInTheDocument()
  expect(screen.getByText(/1 Dec 2026/)).toHaveTextContent('IST · with Practitioner')
  expect(screen.getByText('Manage booking controls')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View all bookings' })).toHaveAttribute('href', '/dashboard/bookings')
})
