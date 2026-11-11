import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import AdminBookingDetailPage from '@/app/admin/bookings/[id]/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { booking: { findFirst: jest.fn() } } }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => { throw new Error('redirect:' + url) }),
  notFound: jest.fn(() => { throw new Error('not-found') }),
}))

const mockAuth = auth as jest.Mock
const checked = requireCurrentAdmin as jest.Mock
const lookup = prisma.booking.findFirst as jest.Mock
const params = { params: Promise.resolve({ id: 'owned-record-123' }) }
const booking = {
  id: 'owned-record-123', status: 'CONFIRMED',
  scheduledAt: new Date('2026-12-01T04:30:00.000Z'), durationMin: 60, pricePaise: 25000,
  createdAt: new Date('2026-11-11T04:30:00.000Z'),
  updatedAt: new Date('2026-11-11T05:00:00.000Z'),
  service: { name: 'Reiki Care' },
  user: { name: 'Member One', email: 'member@example.test' },
  healer: { user: { name: 'Practitioner' } },
  payment: {
    status: 'success', statusEnum: 'SUCCESS', amountPaise: 25000, currency: 'INR',
    gateway: 'razorpay',
    refunds: [{ id: 'refund-one', amountPaise: 5000, status: 'PENDING', createdAt: new Date('2026-11-11T08:00:00.000Z') }],
  },
  emails: [{ id: 'email-one', kind: 'CONFIRMED', status: 'PENDING', attempts: 1, sentAt: null, nextAttemptAt: new Date('2026-11-12T08:00:00Z') }],
}
beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } })
  checked.mockResolvedValue({ id: 'admin' })
  lookup.mockResolvedValue(booking)
})

test('signed-out and non-admin requests cannot query a booking by guessed ID', async () => {
  mockAuth.mockResolvedValueOnce(null)
  await expect(AdminBookingDetailPage(params)).rejects.toThrow('redirect:/auth/signin')
  mockAuth.mockResolvedValueOnce({ user: { id: 'member', role: 'USER' } })
  await expect(AdminBookingDetailPage(params)).rejects.toThrow('redirect:/')
  expect(checked).not.toHaveBeenCalled()
  expect(lookup).not.toHaveBeenCalled()
})

test('live administrator authorization is revalidated and oversized IDs fail closed', async () => {
  checked.mockRejectedValueOnce(new Error('Administrator access revoked'))
  await expect(AdminBookingDetailPage(params)).rejects.toThrow('Administrator access revoked')
  expect(lookup).not.toHaveBeenCalled()
  await expect(AdminBookingDetailPage({ params: Promise.resolve({ id: 'x'.repeat(201) }) }))
    .rejects.toThrow('not-found')
  expect(lookup).not.toHaveBeenCalled()
})

test('unknown booking stays unavailable even to an authenticated admin', async () => {
  lookup.mockResolvedValueOnce(null)
  await expect(AdminBookingDetailPage(params)).rejects.toThrow('not-found')
  expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'owned-record-123' } }))
})

test('review shows saved payment, refund and email statuses without provider tokens or mutation actions', async () => {
  render(await AdminBookingDetailPage(params))
  expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'owned-record-123' } }))
  expect(screen.getByRole('heading', { name: 'Review booking record' })).toBeInTheDocument()
  expect(screen.getByText('Reiki Care')).toBeInTheDocument()
  expect(screen.getByText(/Member One \(member@example\.test\)/)).toBeInTheDocument()
  expect(screen.getByText('Confirmed for delivery')).toBeInTheDocument()
  expect(screen.getByText('₹250.00')).toBeInTheDocument()
  expect(screen.getByText(/₹50.00 · PENDING/)).toBeInTheDocument()
  expect(screen.getByText(/CONFIRMED · PENDING · 1 attempts/)).toBeInTheDocument()
  expect(screen.getByText('Not confirmed sent')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Payment reconciliation' })).toHaveAttribute('href', '/admin/payments')
  expect(screen.queryByRole('button', { name: /refund|cancel|resend|confirm/i })).not.toBeInTheDocument()
  expect(screen.queryByText(/gatewayPaymentId|gatewaySignature|meetingLink/)).not.toBeInTheDocument()
})

test('a free/no-payment appointment never fabricates payment or email acceptance', async () => {
  lookup.mockResolvedValueOnce({
    ...booking, pricePaise: 0, status: 'PENDING', payment: null, emails: [],
  })
  render(await AdminBookingDetailPage(params))
  expect(screen.getByText(/No payment record attached/)).toBeInTheDocument()
  expect(screen.getByText('No booking email events recorded.')).toBeInTheDocument()
  expect(screen.getByText('Not yet confirmed for delivery')).toBeInTheDocument()
})
