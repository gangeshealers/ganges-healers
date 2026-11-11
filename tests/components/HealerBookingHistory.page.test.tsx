import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'
import HealerBookingHistoryPage from '@/app/healer/bookings/history/page'

jest.mock('@/lib/prisma', () => ({
  prisma: { booking: { count: jest.fn(), findMany: jest.fn() } },
}))
jest.mock('@/lib/auth/requireHealer', () => ({ requireHealer: jest.fn() }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => { throw new Error('redirect:' + url) }),
}))
const actor = requireHealer as jest.Mock
const count = prisma.booking.count as jest.Mock
const findMany = prisma.booking.findMany as jest.Mock
const row = (id: string, status: string = 'COMPLETED') => ({
  id, status, durationMin: 60, scheduledAt: new Date('2026-07-14T04:30:00.000Z'),
  user: { name: 'Member A' }, service: { name: 'Meditation Coaching' },
})
beforeEach(() => {
  jest.clearAllMocks()
  actor.mockResolvedValue({ healer: { id: 'healer-owned' } })
  count.mockResolvedValue(1)
  findMany.mockResolvedValue([row('booking-1')])
})

test('anonymous and non-healer accounts are redirected before private query', async () => {
  actor.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
  await expect(HealerBookingHistoryPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('redirect:/auth/signin?callbackUrl=%2Fhealer%2Fbookings%2Fhistory')
  actor.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }))
  await expect(HealerBookingHistoryPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('redirect:/dashboard')
  expect(count).not.toHaveBeenCalled()
  expect(findMany).not.toHaveBeenCalled()
})

test('owned practitioner sees a past appointment without member email or meeting details', async () => {
  render(await HealerBookingHistoryPage({ searchParams: Promise.resolve({}) }))
  expect(count).toHaveBeenCalledWith({ where: expect.objectContaining({ healerId: 'healer-owned' }) })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ healerId: 'healer-owned' }),
    orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
    skip: 0, take: 20,
  }))
  expect(screen.getByRole('heading', { name: 'Practitioner booking history' })).toBeInTheDocument()
  expect(screen.getByText('Meditation Coaching')).toBeInTheDocument()
  expect(screen.getByText(/14 Jul 2026/)).toHaveTextContent('IST · 60 min')
  expect(screen.getByText('Member: Member A')).toBeInTheDocument()
  expect(screen.queryByText(/@example/i)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to Manage Bookings' })).toHaveAttribute('href', '/healer/bookings')
})

test('filtered pages preserve owner, service name and status', async () => {
  count.mockResolvedValueOnce(41)
  findMany.mockResolvedValueOnce([row('cancel', 'CANCELLED')])
  render(await HealerBookingHistoryPage({
    searchParams: Promise.resolve({ status: 'cancelled', page: '2', q: '  breathwork  ' }),
  }))
  expect(count).toHaveBeenCalledWith({
    where: expect.objectContaining({
      healerId: 'healer-owned', status: 'CANCELLED',
      service: { name: { contains: 'breathwork', mode: 'insensitive' } },
    }),
  })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }))
  expect(screen.getByRole('link', { name: 'Previous appointments' }))
    .toHaveAttribute('href', '/healer/bookings/history?status=cancelled&q=breathwork')
  expect(screen.getByRole('link', { name: 'Next appointments' }))
    .toHaveAttribute('href', '/healer/bookings/history?status=cancelled&q=breathwork&page=3')
  expect(screen.getByRole('link', { name: 'Cancelled' })).toHaveAttribute('aria-current', 'page')
})

test('out-of-range and repeated parameters cannot reveal other practitioners or show ghost pages', async () => {
  count.mockResolvedValueOnce(4)
  render(await HealerBookingHistoryPage({
    searchParams: Promise.resolve({ status: ['cancelled', 'completed'], q: ['private'], page: '9999' }),
  }))
  expect(count).toHaveBeenCalledWith({ where: expect.objectContaining({ healerId: 'healer-owned' }) })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }))
  expect(screen.getByRole('link', { name: 'All history' })).toHaveAttribute('aria-current', 'page')
})

test('empty history skips fetching rows and offers navigation back', async () => {
  count.mockResolvedValueOnce(0)
  render(await HealerBookingHistoryPage({ searchParams: Promise.resolve({}) }))
  expect(findMany).not.toHaveBeenCalled()
  expect(screen.getByText('No past appointments yet')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Return to Manage Bookings' })).toHaveAttribute('href', '/healer/bookings')
})
