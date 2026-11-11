import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { BILLING_TYPES, parseBillingFilters } from '@/lib/invoices/billing-filters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ROWS = 1000
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

function csvCell(value: string): string {
  // Do not let an invoice identifier become a spreadsheet formula on open.
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? "'" + value : value
  return '"' + safe.replace(/"/g, '""') + '"'
}

function invoiceCsv(rows: Array<{ invoiceNumber: string; issuedAt: Date; totalPaise: number; payment: { type: string | null } }>): string {
  const headers = ['Issued At (UTC)', 'Invoice Number', 'Purchase Type', 'Amount (INR)']
  const lines = rows.map(row => [
    row.issuedAt.toISOString(),
    row.invoiceNumber,
    row.payment.type ?? 'OTHER',
    (row.totalPaise / 100).toFixed(2),
  ].map(csvCell).join(','))
  return '\uFEFF' + [headers.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n'
}

/** Export only the requesting member's issued invoices without silently truncating data. */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: privateHeaders })
  }

  const params = new URL(req.url).searchParams
  const one = (key: 'q' | 'type') => params.getAll(key).length === 1 ? params.get(key) ?? undefined : undefined
  const requestedType = one('type')
  // Reject misspelled payment categories instead of silently exporting everything.
  if (requestedType && !BILLING_TYPES.includes(requestedType.toUpperCase() as (typeof BILLING_TYPES)[number])) {
    return NextResponse.json({ error: 'invalid-export-filter' }, { status: 400, headers: privateHeaders })
  }
  const filters = parseBillingFilters({ q: one('q'), type: requestedType })
  const where: Prisma.InvoiceWhereInput = {
    payment: { userId: session.user.id, ...(filters.type !== 'ALL' ? { type: filters.type } : {}) },
    ...(filters.query ? { invoiceNumber: { contains: filters.query, mode: 'insensitive' } } : {}),
  }

  try {
    const rows = await prisma.invoice.findMany({
      where,
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      take: MAX_ROWS + 1,
      select: { invoiceNumber: true, issuedAt: true, totalPaise: true, payment: { select: { type: true } } },
    })
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: 'export-too-large', maxRows: MAX_ROWS }, { status: 413, headers: privateHeaders })
    }
    return new NextResponse(invoiceCsv(rows), {
      headers: {
        ...privateHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ganges-healers-invoices.csv"',
      },
    })
  } catch (error) {
    console.error('[invoices][me][export_failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'export-unavailable' }, { status: 500, headers: privateHeaders })
  }
}
