import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/invoices/me/export/route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { invoice: { findMany: jest.fn() } } }))

const mockAuth = auth as jest.Mock
const mockInvoices = prisma.invoice.findMany as jest.Mock
const req = (query = '') => new NextRequest('http://localhost/api/invoices/me/export' + query)
const invoice = {
  invoiceNumber: '=SUM(1,2)',
  issuedAt: new Date('2026-11-01T00:00:00.000Z'),
  totalPaise: 12345,
  payment: { type: 'STORE' },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'owner_member' } })
  mockInvoices.mockResolvedValue([invoice])
})

describe('private invoice export', () => {
  it('requires a signed-in account before any read', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const response = await GET(req())
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(mockInvoices).not.toHaveBeenCalled()
  })

  it('exports only owner invoices with saved filters and spreadsheet-safe identifiers', async () => {
    const response = await GET(req('?type=STORE&q=INV'))
    expect(response.status).toBe(200)
    expect(mockInvoices).toHaveBeenCalledWith(expect.objectContaining({
      where: { payment: { userId: 'owner_member', type: 'STORE' }, invoiceNumber: { contains: 'INV', mode: 'insensitive' } },
      take: 1001,
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
    }))
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('attachment')
    const csv = await response.text()
    expect(csv).toContain('"\'=SUM(1,2)"')
    expect(csv).toContain('"123.45"')
    expect(csv).not.toContain('owner_member')
    expect(csv).toContain('2026-11-01T00:00:00.000Z')
  })

  it('rejects unknown types and limits export size rather than silently truncating', async () => {
    expect((await GET(req('?type=UNKNOWN'))).status).toBe(400)
    expect(mockInvoices).not.toHaveBeenCalled()
    mockInvoices.mockResolvedValueOnce(Array(1001).fill(invoice))
    const response = await GET(req('?type=STORE'))
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'export-too-large', maxRows: 1000 })
  })

  it('never uses URL user identifiers and treats repeated search/type values as unfiltered', async () => {
    const response = await GET(req('?userId=someone_else&type=STORE&type=SESSION&q=one&q=two'))
    expect(response.status).toBe(200)
    expect(mockInvoices).toHaveBeenCalledWith(expect.objectContaining({ where: { payment: { userId: 'owner_member' } } }))
  })
})
