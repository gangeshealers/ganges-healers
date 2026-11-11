import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import BookingHistoryPage from '@/app/dashboard/bookings/history/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({
  prisma: { booking: { count: jest.fn(), findMany: jest.fn() } },
}))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => { throw new Error('redirect:' + url) }),
}))

const mockAuth = auth as jest.Mock
const count = prisma.booking.count as jest.Mock
const findMany = prisma.booking.findMany as jest.Mock
const row = (id: string, status: string = 'COMPLETED') => ({
  id, status, durationMin: 60, scheduledAt: new Date('2026-08-11T04:30:00Z'),
  service: { name: 'Gentle Reiki Session', slug: 'reiki' },
  healer: { user: { name: 'Practitioner One' } },
})
beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'member-owned' } })
  count.mockResolvedValue(1)
  findMany.mockResolvedValue([row('booking-a')])
})

test('anonymous users cannot query any booking history', async () => {
  mockAuth.mockResolvedValueOnce(null)
  await expect(BookingHistoryPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('redirect:/auth/signin?callbackUrl=%2Fdashboard%2Fbookings%2Fhistory')
  expect(count).not.toHaveBeenCalled()
  expect(findMany).not.toHaveBeenCalled()
})

test('older owned appointments render with IST times and links to billing', async () => {
  render(await BookingHistoryPage({ searchParams: Promise.resolve({}) }))
  expect(count).toHaveBeenCalledWith({
    where: { userId: 'member-owned', OR: [
      { scheduledAt: { lt: expect.any(Date) } },
      { status: { in: ['COMPLETED', 'CANCELLED'] } },
    ] },
  })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ userId: 'member-owned' }),
    orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
    take: 20, skip: 0,
  }))
  expect(screen.getByRole('heading', { name: 'Booking history' })).toBeInTheDocument()
  expect(screen.getByText('Gentle Reiki Session')).toBeInTheDocument()
  expect(screen.getByText(/11 Aug 2026/)).toHaveTextContent('IST · 60 min')
  expect(screen.getByRole('link', { name: 'Back to My Bookings' }))
    .toHaveAttribute('href', '/dashboard/bookings')
  expect(screen.getByRole('link', { name: 'Download history CSV' }))
    .toHaveAttribute('href', '/api/bookings/history/export')
})

test('search, status and later pages always remain owner-scoped', async () => {
  count.mockResolvedValueOnce(51)
  findMany.mockResolvedValueOnce([row('booking-b', 'CANCELLED')])
  render(await BookingHistoryPage({
    searchParams: Promise.resolve({ status: 'cancelled', q: '  reiki  ', page: '2' }),
  }))
  expect(count).toHaveBeenCalledWith({
    where: expect.objectContaining({
      userId: 'member-owned', status: 'CANCELLED',
      service: { name: { contains: 'reiki', mode: 'insensitive' } },
    }),
  })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }))
  expect(screen.getByRole('link', { name: 'Next bookings' }))
    .toHaveAttribute('href', '/dashboard/bookings/history?status=cancelled&q=reiki&page=3')
  expect(screen.getByRole('link', { name: 'Previous bookings' }))
    .toHaveAttribute('href', '/dashboard/bookings/history?status=cancelled&q=reiki')
  expect(screen.getByRole('link', { name: 'Download history CSV' }))
    .toHaveAttribute('href', '/api/bookings/history/export?status=cancelled&q=reiki')
})

test('invalid query and out-of-range page recover safely', async () => {
  count.mockResolvedValueOnce(8)
  render(await BookingHistoryPage({
    searchParams: Promise.resolve({ status: ['completed', 'cancelled'], q: ['wrong'], page: '9999' }),
  }))
  expect(count).toHaveBeenCalledWith({
    where: expect.objectContaining({ userId: 'member-owned' }),
  })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }))
  expect(screen.getByRole('link', { name: 'All history' })).toHaveAttribute('aria-current', 'page')
})

test('empty history does not query booking records and offers a safe return', async () => {
  count.mockResolvedValueOnce(0)
  render(await BookingHistoryPage({ searchParams: Promise.resolve({}) }))
  expect(findMany).not.toHaveBeenCalled()
  expect(screen.getByText('No past appointments yet')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Return to My Bookings' })).toHaveAttribute('href', '/dashboard/bookings')
})
