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
  expect(screen.getByText(/1 Dec,? 2026/)).toHaveTextContent('IST · with Practitioner')
  expect(screen.getByText('Manage booking controls')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View all bookings' })).toHaveAttribute('href', '/dashboard/bookings')
})

test('account home offers learning continuation using lesson order, including retained archived access', () => {
  render(<DashboardClient name="Sam" bookings={[]} unreadCount={2} courseEnrollments={[{
    id: 'enrolled', status: 'completed', progress: 2,
    course: { slug: 'breath practice', title: 'Breath Practice', isActive: false, lessons: [
      { id: 'lesson-1', order: 1, title: 'Start here' }, { id: 'lesson-9', order: 9, title: 'Next practice' },
    ] },
  }]} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your healing space')
  expect(screen.getByText('Welcome back, Sam')).toBeVisible()
  expect(screen.getByRole('navigation', { name: 'Your account workspaces' })).toBeVisible()
  expect(screen.getByRole('link', { name: '2 unread notifications' })).toHaveAttribute('href', '/dashboard/notifications')
  expect(screen.getByText('1/2 lessons · 50%')).toBeVisible()
  expect(screen.getByText('Archived · access retained')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Continue learning: Breath Practice' }))
    .toHaveAttribute('href', '/courses/breath%20practice/lesson/lesson-9')
  expect(screen.queryByText('Completed')).not.toBeInTheDocument()
})

test('completed and empty courses offer review and overview instead of invented next lessons', () => {
  render(<DashboardClient bookings={[]} courseEnrollments={[
    { id: 'done', status: 'completed', progress: 99, course: { slug: 'done', title: 'Finished Course', isActive: true, lessons: [{ id: 'first', order: 8, title: 'Practice' }] } },
    { id: 'empty', status: 'active', progress: 0, course: { slug: 'empty', title: 'Empty Course', isActive: true, lessons: [] } },
  ]} />)
  expect(screen.getByRole('link', { name: 'Review lessons: Finished Course' })).toHaveAttribute('href', '/courses/done/lesson/first')
  expect(screen.getByRole('link', { name: 'View course: Empty Course' })).toHaveAttribute('href', '/courses/empty')
  expect(screen.getByRole('progressbar', { name: 'Course progress for Finished Course' })).toHaveAttribute('value', '1')
  expect(screen.getByText('Lessons are not available yet.')).toBeVisible()
})

test('program cards distinguish confirmed reservations, paused programs and schedules needing review', () => {
  const program = { id: 'program', title: 'Practice Program', status: 'active' as const, completedSessions: 2, totalSessions: 6, progressPercent: 33, needsReview: false, nextSessionAt: '2026-11-30T21:00:00.000Z', practitioner: 'Practitioner' }
  render(<DashboardClient bookings={[]} programs={[
    program,
    { ...program, id: 'paused', title: 'Paused Program', status: 'paused', nextSessionAt: null },
    { ...program, id: 'review', title: 'Review Program', totalSessions: 0, needsReview: true, nextSessionAt: null },
  ]} />)
  expect(screen.getByText(/Next confirmed session:/)).toHaveTextContent(/1 Dec,? 2026.*IST/)
  expect(screen.getByRole('progressbar', { name: 'Practice Program progress' })).toHaveAttribute('max', '6')
  expect(screen.getByText(/Your program is paused/)).toBeVisible()
  expect(screen.getByText('Your purchased schedule needs staff review.')).toBeVisible()
  expect(screen.queryByRole('progressbar', { name: 'Review Program progress' })).not.toBeInTheDocument()
})
