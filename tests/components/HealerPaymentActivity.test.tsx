import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'
import HealerPaymentsPage from '@/app/healer/payments/page'

jest.mock('@/lib/auth/requireHealer', () => ({ requireHealer: jest.fn() }))
jest.mock('@/lib/prisma', () => ({
  prisma: { payment: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() } },
}))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => { throw new Error('redirect:' + url) }),
}))

const actor = requireHealer as jest.Mock
const count = prisma.payment.count as jest.Mock
const aggregate = prisma.payment.aggregate as jest.Mock
const findMany = prisma.payment.findMany as jest.Mock
const row = {
  id: 'payment-abc',
  createdAt: new Date('2026-11-09T06:00:00Z'),
  amountPaise: 38500,
  booking: {
    id: 'booking-abc', scheduledAt: new Date('2026-11-13T04:30:00Z'),
    service: { name: 'Private Reiki Session' },
  },
}
beforeEach(() => {
  jest.clearAllMocks()
  actor.mockResolvedValue({ healer: { id: 'owned-healer' } })
  count.mockResolvedValue(1)
  aggregate.mockResolvedValue({ _sum: { amountPaise: 38500 } })
  findMany.mockResolvedValue([row])
})

test('fails closed when signed out or not authorized as a healer', async () => {
  actor.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
  await expect(HealerPaymentsPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('redirect:/auth/signin?callbackUrl=%2Fhealer%2Fpayments')
  actor.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }))
  await expect(HealerPaymentsPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('redirect:/dashboard')
  expect(count).not.toHaveBeenCalled()
  expect(findMany).not.toHaveBeenCalled()
})

test('shows owner-scoped gross successful INR payments and clearly distinguishes payouts', async () => {
  render(await HealerPaymentsPage({ searchParams: Promise.resolve({ period: 'all' }) }))
  expect(count).toHaveBeenCalledWith({
    where: { booking: { healerId: 'owned-healer' }, currency: 'INR', statusEnum: 'SUCCESS' },
  })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { booking: { healerId: 'owned-healer' }, currency: 'INR', statusEnum: 'SUCCESS' },
    take: 20, skip: 0,
  }))
  expect(screen.getByRole('heading', { name: 'Session payment activity' })).toBeInTheDocument()
  expect(screen.getByText('₹385.00')).toBeInTheDocument()
  expect(screen.getByText('Private Reiki Session')).toBeInTheDocument()
  expect(screen.getByText(/not your payable earnings/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Download payment CSV' }))
    .toHaveAttribute('href', '/api/healer/earnings/export?period=all')
  expect(screen.getByRole('link', { name: 'All time' })).toHaveAttribute('aria-current', 'page')
})

test('filters and paginates only within the same practitioner account', async () => {
  count.mockResolvedValueOnce(41)
  render(await HealerPaymentsPage({ searchParams: Promise.resolve({ page: '2', period: '90days' }) }))
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ booking: { healerId: 'owned-healer' }, createdAt: { gte: expect.any(Date) } }),
    skip: 20, take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  }))
  expect(screen.getByRole('link', { name: 'Previous payments' })).toHaveAttribute('href', '/healer/payments?period=90days')
  expect(screen.getByRole('link', { name: 'Next payments' })).toHaveAttribute('href', '/healer/payments?period=90days&page=3')
})

test('empty state makes gross-payment limitations clear', async () => {
  count.mockResolvedValueOnce(0)
  aggregate.mockResolvedValueOnce({ _sum: { amountPaise: null } })
  render(await HealerPaymentsPage({ searchParams: Promise.resolve({}) }))
  expect(findMany).not.toHaveBeenCalled()
  expect(screen.getByText(/No captured session payments were found for this period/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View all payment activity' })).toHaveAttribute('href', '/healer/payments?period=all')
})
