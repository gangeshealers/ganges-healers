import { NextRequest } from 'next/server'

const access = jest.fn()
const findPayments = jest.fn()
const findRefunds = jest.fn()

jest.mock('@/lib/rbac', () => ({ requireAdmin: () => access() }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    payment: { findMany: (args: unknown) => findPayments(args) },
    refund: { findMany: (args: unknown) => findRefunds(args) },
  },
}))

import { GET } from '@/app/api/admin/payments/export/route'

function request(query = '') {
  return new NextRequest('http://localhost/api/admin/payments/export' + query)
}

const day = new Date('2026-11-01T12:00:00.000Z')

describe('admin payment CSV export', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    access.mockResolvedValue({ user: { role: 'ADMIN' } })
    findPayments.mockResolvedValue([])
    findRefunds.mockResolvedValue([])
  })

  test('rejects non-admin access before reading any transaction data', async () => {
    access.mockRejectedValue(new Error('Forbidden'))
    const response = await GET(request('?kind=payments'))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(findPayments).not.toHaveBeenCalled()
    expect(findRefunds).not.toHaveBeenCalled()
  })

  test('returns typed successful payments in a safely quoted downloadable CSV', async () => {
    findPayments.mockResolvedValue([{
      id: 'payment-1', createdAt: day, type: 'SESSION', amountPaise: 1299,
      userId: '=HYPERLINK("https://invalid.example","click")',
    }])
    const response = await GET(request('?kind=payments&type=SESSION&from=2026-11-01&to=2026-11-02'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/csv')
    expect(response.headers.get('Content-Disposition')).toContain('ganges-healers-payments-2026-11-01-to-2026-11-02.csv')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([239, 187, 191])
    const body = new TextDecoder().decode(bytes)
    expect(body).toContain('"Payment ID"')
    expect(body).toContain('"payment-1"')
    expect(body).toContain('"12.99"')
    expect(body).toContain('"' + "'=HYPERLINK(" + '""https://invalid.example"",""click"")"')
    const query = findPayments.mock.calls[0][0]
    expect(query.where.statusEnum).toBe('SUCCESS')
    expect(query.where.type).toBe('SESSION')
    expect(query.where.createdAt.gte.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(query.where.createdAt.lte.toISOString()).toBe('2026-11-02T23:59:59.999Z')
    expect(query.take).toBe(5001)
    expect(findRefunds).not.toHaveBeenCalled()
  })

  test('exports refunds independently of the payment type filter', async () => {
    findRefunds.mockResolvedValue([{
      id: 'refund-1', createdAt: day, amountPaise: 425, paymentId: 'payment-1',
    }])
    const response = await GET(request('?kind=refunds&type=COURSE&from=2026-11-01&to=2026-11-02'))
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('"refund-1"')
    expect(body).toContain('"payment-1"')
    expect(body).toContain('"4.25"')
    expect(findRefunds.mock.calls[0][0].where).toEqual({
      createdAt: {
        gte: new Date('2026-11-01T00:00:00.000Z'),
        lte: new Date('2026-11-02T23:59:59.999Z'),
      },
    })
    expect(findPayments).not.toHaveBeenCalled()
  })

  test.each([
    '?kind=wrong',
    '?type=NOT_A_REAL_TYPE',
    '?from=2026-02-30&to=2026-03-01',
    '?from=2026-01-01',
    '?from=2026-11-03&to=2026-11-02',
    '?from=2025-01-01&to=2026-11-01',
  ])('rejects unsupported or unsafe export filters: %s', async (query) => {
    const response = await GET(request(query))
    expect(response.status).toBe(400)
    expect(findPayments).not.toHaveBeenCalled()
    expect(findRefunds).not.toHaveBeenCalled()
  })

  test('refuses reports larger than 5000 rows instead of silently truncating', async () => {
    findPayments.mockResolvedValue(Array.from({ length: 5001 }, (_, index) => ({
      id: 'payment-' + index, createdAt: day, amountPaise: 100, userId: null, type: 'SESSION',
    })))
    const response = await GET(request('?kind=payments&from=2026-11-01&to=2026-11-02'))
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'export-too-large', maxRows: 5000 })
  })

  test('returns a header-only CSV for an empty date range', async () => {
    const response = await GET(request('?kind=refunds&from=2026-11-01&to=2026-11-02'))
    expect(response.status).toBe(200)
    expect((await response.text()).split('\r\n')).toHaveLength(2)
  })

  test('hides database errors from clients', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    findPayments.mockRejectedValue(new Error('private database connection detail'))
    try {
      const response = await GET(request())
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'export-unavailable' })
    } finally {
      log.mockRestore()
    }
  })
})
