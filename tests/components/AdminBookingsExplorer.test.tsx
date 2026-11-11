import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import AdminBookingsPage from '@/app/admin/bookings/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { booking: { count: jest.fn(), findMany: jest.fn() } } }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => { throw new Error('redirect:' + url) }),
}))

const mockAuth = auth as jest.Mock
const checkedAdmin = requireCurrentAdmin as jest.Mock
const count = prisma.booking.count as jest.Mock
const findMany = prisma.booking.findMany as jest.Mock
const sample = {
  id: 'saved-booking-1',
  status: 'CONFIRMED', scheduledAt: new Date('2026-12-01T04:30:00.000Z'),
  durationMin: 60, pricePaise: 15000,
  service: { name: 'Meditation Session' },
  user: { name: 'Member One', email: 'member@example.test' },
  healer: { user: { name: 'Practitioner A' } },
  payment: { status: 'success', statusEnum: 'SUCCESS', amountPaise: 15000, gateway: 'razorpay' },
}
beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'staff-admin', role: 'ADMIN' } })
  checkedAdmin.mockResolvedValue({ id: 'staff-admin' })
  count.mockResolvedValue(1)
  findMany.mockResolvedValue([sample])
})

test('signed-out and non-admin accounts never load the booking inventory', async () => {
  mockAuth.mockResolvedValueOnce(null)
  await expect(AdminBookingsPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('redirect:/auth/signin')
  mockAuth.mockResolvedValueOnce({ user: { id: 'member', role: 'USER' } })
  await expect(AdminBookingsPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('redirect:/')
  expect(checkedAdmin).not.toHaveBeenCalled()
  expect(count).not.toHaveBeenCalled()
  expect(findMany).not.toHaveBeenCalled()
})

test('admin identity must be rechecked before the DB query', async () => {
  checkedAdmin.mockRejectedValueOnce(Object.assign(new Error('Administrator access revoked'), { status: 403 }))
  await expect(AdminBookingsPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('Administrator access revoked')
  expect(count).not.toHaveBeenCalled()
})

test('read-only operations view shows verified delivery signals without meeting links', async () => {
  render(await AdminBookingsPage({ searchParams: Promise.resolve({}) }))
  expect(checkedAdmin).toHaveBeenCalledTimes(1)
  expect(count).toHaveBeenCalledWith({ where: { scheduledAt: { gte: expect.any(Date) } } })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { scheduledAt: { gte: expect.any(Date) } },
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], skip: 0, take: 25,
  }))
  expect(screen.getByRole('heading', { name: 'Booking operations' })).toBeInTheDocument()
  expect(screen.getByText('Meditation Session')).toBeInTheDocument()
  expect(screen.getByText(/1 Dec 2026/)).toHaveTextContent('IST · 60 min')
  expect(screen.getByText(/Member: Member One/)).toHaveTextContent('Practitioner: Practitioner A')
  expect(screen.getByText('Delivery confirmed')).toBeInTheDocument()
  expect(screen.getByText('Matching captured payment')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Payment reconciliation' })).toHaveAttribute('href', '/admin/payments')
  expect(screen.queryByRole('button', { name: /refund|cancel|confirm/i })).not.toBeInTheDocument()
  expect(screen.queryByText(/https:\/\//)).not.toBeInTheDocument()
})

test('service and time filters are not mixed with an untrusted account selector', async () => {
  count.mockResolvedValueOnce(52)
  findMany.mockResolvedValueOnce([sample])
  render(await AdminBookingsPage({ searchParams: Promise.resolve({
    scope: 'past', status: 'rescheduled', page: '2', q: '  booking-ref  ',
  }) }))
  expect(count).toHaveBeenCalledWith({
    where: { scheduledAt: { lt: expect.any(Date) }, status: 'RESCHEDULED', id: 'booking-ref' },
  })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    skip: 25, take: 25, orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
  }))
  expect(screen.getByRole('link', { name: 'Previous bookings' }))
    .toHaveAttribute('href', '/admin/bookings?scope=past&status=rescheduled&q=booking-ref')
  expect(screen.getByRole('link', { name: 'Next bookings' }))
    .toHaveAttribute('href', '/admin/bookings?scope=past&status=rescheduled&q=booking-ref&page=3')
  expect(screen.getByRole('link', { name: 'Past' })).toHaveAttribute('aria-current', 'page')
})

test('no matching bookings yields useful reset path and no extra query', async () => {
  count.mockResolvedValueOnce(0)
  render(await AdminBookingsPage({ searchParams: Promise.resolve({ q: 'no-such-booking' }) }))
  expect(findMany).not.toHaveBeenCalled()
  expect(screen.getByText('No bookings match these filters')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Show upcoming bookings' })).toHaveAttribute('href', '/admin/bookings')
})
