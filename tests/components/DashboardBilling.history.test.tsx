import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import ReceiptPage from '@/app/dashboard/billing/[id]/page'
import BillingPage from '@/app/dashboard/billing/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({
  prisma: { invoice: { findMany: jest.fn(), findFirst: jest.fn() } },
}))
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => { throw new Error('not found') }),
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
  expect(screen.getByRole('link', { name: 'Download billing CSV' })).toHaveAttribute('href', '/api/invoices/me/export?type=STORE&q=INV')
  expect(screen.getAllByRole('link', { name: 'View invoice' })).toHaveLength(25)
  expect(screen.getAllByRole('link', { name: 'View invoice' })[0]).toHaveAttribute('href', '/dashboard/billing/invoice_0')
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

const readReceipt = () => ReceiptPage({ params: Promise.resolve({ id: 'invoice_42' }) })
const mockReceipt = prisma.invoice.findFirst as jest.Mock
const savedInvoice = {
  id: 'invoice_42', invoiceNumber: 'INV-42', issuedAt: new Date('2026-11-01T20:00:00Z'),
  billTo: { name: 'Saved recipient', email: 'buyer@example.test' },
  lineItems: [{ description: 'Session at booking', amountPaise: 15000 }, { invalid: true }],
  subtotalPaise: 15000, taxPaise: 500, totalPaise: 15500, pdfUrl: '',
}

test('prints issued amounts and recipient details from the saved invoice without a PDF', async () => {
  mockAuth.mockResolvedValue({ user: { id: 'buyer' } })
  mockReceipt.mockResolvedValue(savedInvoice)
  render(await readReceipt())
  expect(mockReceipt).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'invoice_42', payment: { userId: 'buyer' } } }))
  expect(screen.getByRole('heading', { name: 'INV-42' })).toBeVisible()
  expect(screen.getByText('2 November 2026')).toBeVisible()
  expect(screen.getByText('buyer@example.test')).toBeVisible()
  expect(screen.getByRole('row', { name: /Session at booking/ })).toHaveTextContent('₹150.00')
  expect(screen.getByText('Tax').parentElement).toHaveTextContent('₹5.00')
  expect(screen.getByText('Invoice total').parentElement).toHaveTextContent('₹155.00')
  expect(screen.getByRole('button', { name: 'Print' })).toBeVisible()
  expect(screen.queryByRole('link', { name: 'View PDF' })).toBeNull()
})

test('handles sparse historical snapshots and links an available PDF through its viewer', async () => {
  mockAuth.mockResolvedValue({ user: { id: 'buyer' } })
  mockReceipt.mockResolvedValue({ ...savedInvoice, billTo: null, lineItems: {}, pdfUrl: 'https://example.test/invoice.pdf' })
  render(await readReceipt())
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.queryByText('Billed to')).toBeNull()
  expect(screen.getByText('Invoice total').parentElement).toHaveTextContent('₹155.00')
  expect(screen.getByRole('link', { name: 'View PDF' })).toHaveAttribute('href', '/invoices/invoice_42/view')
})

test('requires sign-in with a receipt return path and handles an unavailable owner-scoped record', async () => {
  mockAuth.mockResolvedValue(null)
  await expect(readReceipt()).rejects.toThrow('redirected')
  expect(redirect).toHaveBeenCalledWith('/auth/signin?callbackUrl=%2Fdashboard%2Fbilling%2Finvoice_42')
  expect(mockReceipt).not.toHaveBeenCalled()
  mockAuth.mockResolvedValue({ user: { id: 'other' } })
  mockReceipt.mockResolvedValue(null)
  await expect(readReceipt()).rejects.toThrow('not found')
  expect(mockReceipt).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'invoice_42', payment: { userId: 'other' } } }))
})
