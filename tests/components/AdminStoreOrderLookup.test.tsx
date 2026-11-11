import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import AdminOrdersPage from '@/app/admin/orders/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { order: { count: jest.fn(), findMany: jest.fn() } } }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((href: string) => { throw new Error('redirect:' + href) }),
}))

const mockAuth = auth as jest.Mock
const authorized = requireCurrentAdmin as jest.Mock
const count = prisma.order.count as jest.Mock
const findMany = prisma.order.findMany as jest.Mock
const row = {
  id: 'store-order-123', status: 'paid', totalPaise: 13500,
  createdAt: new Date('2026-11-11T04:30:00.000Z'), _count: { items: 2 },
}
beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } })
  authorized.mockResolvedValue({ id: 'admin' })
  count.mockResolvedValue(1)
  findMany.mockResolvedValue([row])
})

test('no private store data queried before current ADMIN role verification', async () => {
  mockAuth.mockResolvedValueOnce(null)
  await expect(AdminOrdersPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('redirect:/auth/signin')
  mockAuth.mockResolvedValueOnce({ user: { id: 'member', role: 'USER' } })
  await expect(AdminOrdersPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('redirect:/')
  authorized.mockRejectedValueOnce(new Error('Administrator access revoked'))
  await expect(AdminOrdersPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('Administrator access revoked')
  expect(count).not.toHaveBeenCalled()
  expect(findMany).not.toHaveBeenCalled()
})

test('default paid fulfillment queue remains unchanged and links to reviewed order page', async () => {
  render(await AdminOrdersPage({ searchParams: Promise.resolve({}) }))
  expect(authorized).toHaveBeenCalledTimes(1)
  expect(count).toHaveBeenCalledWith({ where: { status: 'paid' } })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { status: 'paid' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 25, skip: 0,
  }))
  expect(screen.getByRole('heading', { name: 'Store orders' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Order store-order-123' }))
    .toHaveAttribute('href', '/admin/orders/store-order-123')
  expect(screen.getByRole('link', { name: 'Awaiting shipment' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'All statuses' })).toHaveAttribute('href', '/admin/orders?status=all')
})

test('exact order reference can find orders in any saved state, with bounded paging', async () => {
  count.mockResolvedValueOnce(76)
  findMany.mockResolvedValueOnce([{ ...row, status: 'pending_payment' }])
  render(await AdminOrdersPage({ searchParams: Promise.resolve({
    status: 'all', q: '  store-order-123  ', page: '2',
  }) }))
  expect(count).toHaveBeenCalledWith({ where: { id: 'store-order-123' } })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'store-order-123' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 25, skip: 25,
  }))
  expect(screen.getByText('pending payment')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Previous page' }))
    .toHaveAttribute('href', '/admin/orders?status=all&q=store-order-123')
  expect(screen.getByRole('link', { name: 'Next page' }))
    .toHaveAttribute('href', '/admin/orders?status=all&q=store-order-123&page=3')
  expect(screen.getByRole('link', { name: 'All statuses' })).toHaveAttribute('aria-current', 'page')
})

test('invalid role-independent filters and out-of-range pages recover without ghost rows', async () => {
  count.mockResolvedValueOnce(1)
  render(await AdminOrdersPage({ searchParams: Promise.resolve({
    status: ['paid', 'all'], q: ['foreign'], page: '9999',
  }) }))
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { status: 'paid' }, skip: 0, take: 25,
  }))
  expect(screen.getByRole('link', { name: 'Awaiting shipment' })).toHaveAttribute('aria-current', 'page')
})

test('empty or unmatched orders have a navigation recovery path', async () => {
  count.mockResolvedValueOnce(0)
  render(await AdminOrdersPage({ searchParams: Promise.resolve({ q: 'unknown', status: 'all' }) }))
  expect(findMany).not.toHaveBeenCalled()
  expect(screen.getByText('No saved orders match this status or reference.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Show orders across all statuses' }))
    .toHaveAttribute('href', '/admin/orders?status=all')
})
