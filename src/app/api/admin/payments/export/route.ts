import { refundReviewLabel } from '@/lib/bookings/refund-policy'
import { capturedPaymentWhere, reportType } from '@/lib/admin/payment-report'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/rbac'
import { parseRange } from '@/lib/time-range'

const MAX_EXPORT_ROWS = 5000

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + 'T00:00:00.000Z')
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function csvCell(value: string | number | null): string {
  if (value === null) return '""'
  if (typeof value === 'number') return String(value)
  // A formula-looking identifier must remain text when a spreadsheet opens the CSV.
  const safe = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value
  return '"' + safe.replace(/"/g, '""') + '"'
}

function asCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/**
 * Download bounded, admin-only payment or refund rows for the selected UTC date range.
 * Refuses oversized results rather than silently providing an incomplete report.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }

  const params = new URL(req.url).searchParams
  const kind = params.get('kind') || 'payments'
  const type = params.get('type') || 'ALL'
  const fromParam = params.get('from')
  const toParam = params.get('to')

  const types = reportType(type)
  if ((kind !== 'payments' && kind !== 'refunds') || !types) {
    return NextResponse.json({ error: 'invalid-export-filter' }, { status: 400 })
  }
  if ((fromParam === null) !== (toParam === null) ||
      (fromParam !== null && !validDay(fromParam)) ||
      (toParam !== null && !validDay(toParam))) {
    return NextResponse.json({ error: 'invalid-export-range' }, { status: 400 })
  }

  const { from, to } = parseRange(fromParam, toParam)
  if (from > to || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: 'invalid-export-range' }, { status: 400 })
  }

  const dateFilter = { createdAt: { gte: from, lte: to } }
  const sort = [{ createdAt: 'desc' as const }, { id: 'desc' as const }]
  const dateLabel = from.toISOString().slice(0, 10) + '-to-' + to.toISOString().slice(0, 10)

  try {
    let csv: string
    let rowCount: number

    if (kind === 'payments') {
      const where = { ...dateFilter, ...capturedPaymentWhere, ...types }
      const payments = await prisma.payment.findMany({
        where,
        orderBy: sort,
        take: MAX_EXPORT_ROWS + 1,
        select: { id: true, createdAt: true, type: true, amountPaise: true, userId: true, currency: true },
      })
      if (payments.length > MAX_EXPORT_ROWS) {
        return NextResponse.json({ error: 'export-too-large', maxRows: MAX_EXPORT_ROWS }, { status: 413 })
      }
      rowCount = payments.length
      csv = asCsv(
        ['Created At (UTC)', 'Payment ID', 'Type', 'Amount (INR)', 'User ID', 'Currency', 'Amount (minor units)'],
        payments.map((payment) => [
          payment.createdAt.toISOString(), payment.id, payment.type,
          (payment.currency ?? 'INR') === 'INR' ? (payment.amountPaise / 100).toFixed(2) : null, payment.userId,
          payment.currency ?? 'INR', payment.amountPaise,
        ]),
      )
    } else {
      const refunds = await prisma.refund.findMany({
        where: { ...dateFilter, payment: types },
        orderBy: sort,
        take: MAX_EXPORT_ROWS + 1,
        select: { id: true, createdAt: true, paymentId: true, amountPaise: true, status: true, gatewayRefundId: true, payment: { select: { bookingId: true, currency: true } } },
      })
      if (refunds.length > MAX_EXPORT_ROWS) {
        return NextResponse.json({ error: 'export-too-large', maxRows: MAX_EXPORT_ROWS }, { status: 413 })
      }
      rowCount = refunds.length
      csv = asCsv(
        ['Created At (UTC)', 'Refund ID', 'Payment ID', 'Amount (INR)', 'Refund outcome', 'Booking ID', 'Currency', 'Amount (minor units)'],
        refunds.map((refund) => [
          refund.createdAt.toISOString(), refund.id, refund.paymentId,
          (refund.payment.currency ?? 'INR') === 'INR' ? (refund.amountPaise / 100).toFixed(2) : null,
          refundReviewLabel(refund), refund.payment.bookingId, refund.payment.currency ?? 'INR', refund.amountPaise,
        ]),
      )
    }

    console.info('[admin][payments][export]', { kind, type, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), rows: rowCount })
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ganges-healers-' + kind + '-' + dateLabel + '.csv"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    console.error('[admin][payments][export][failed]', { kind, type })
    return NextResponse.json({ error: 'export-unavailable' }, { status: 500 })
  }
}
