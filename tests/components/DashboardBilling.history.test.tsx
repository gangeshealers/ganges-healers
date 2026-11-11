import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import BillingPage from '@/app/dashboard/billing/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({
  prisma: { invoice: { findMany: jest.fn() } },
}))
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => { throw new Error('redirected') }),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string; className?: string }>) =>
    <a href={href} {...props}>{children}</a>,
}))

const mockAuth = auth as jest.Mock
const mockInvoices = prisma.invoice.findMany as jest.Mock

beforeEach(() => { jest.clearAllMocks() })

test('requires a real signed-in owner before querying billing history', async () => {
  mockAuth.mockResolvedValue(null)
  await expect(BillingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirected')
  expect(redirect).toHaveBeenCalledWith('/auth/signin?callbackUrl=%2Fdashboard%2Fbilling')
  expect(mockInvoices).not.toHaveBeenCalled()
})

test('filters by the authenticated owner, displays invoices and paginates', async () => {
  mockAuth.mockResolvedValue({ user: { id: 'member_123' } })
  const rows = Array.from({ length: 26 }, (_, index) => ({
    id: 'invoice_' + index,
    invoiceNumber: 'INV-' + (1000 + index),
    issuedAt: new Date('2026-11-01T00:00:00.000Z'),
    totalPaise: 14500,
    payment: { type: 'STORE' },
  }))
  mockInvoices.mockResolvedValue(rows)
  const view = await BillingPage({ searchParams: Promise.resolve({ page: '2', type: 'STORE', q: ' INV ' }) })
  render(view)

  expect(mockInvoices).toHaveBeenCalledWith(expect.objectContaining({
    where: { payment: { userId: 'member_123', type: 'STORE' }, invoiceNumber: { contains: 'INV', mode: 'insensitive' } },
    skip: 25,
    take: 26,
    orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
  }))
  expect(screen.getAllByRole('link', { name: 'View invoice' })).toHaveLength(25)
  expect(screen.getAllByRole('link', { name: 'View invoice' })[0]).toHaveAttribute('href', '/invoices/INV-1000/view')
  expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/dashboard/billing?type=STORE&q=INV&page=3')
  expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '/dashboard/billing?type=STORE&q=INV')
  expect(screen.queryByText('INV-1025')).not.toBeInTheDocument()
})

test('offers recovery for empty filter results without leaking any other account', async () => {
  mockAuth.mockResolvedValue({ user: { id: 'member_789' } })
  mockInvoices.mockResolvedValue([])
  render(await BillingPage({ searchParams: Promise.resolve({ q: 'missing', type: 'SESSION' }) }))
  expect(screen.getByText('No matching invoices')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Show all invoices' })).toHaveAttribute('href', '/dashboard/billing')
  expect(mockInvoices).toHaveBeenCalledWith(expect.objectContaining({
    where: { payment: { userId: 'member_789', type: 'SESSION' }, invoiceNumber: { contains: 'missing', mode: 'insensitive' } },
  }))
})
