import { refundReviewLabel } from '@/lib/bookings/refund-policy'
import { reportType } from '@/lib/admin/payment-report'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/rbac'
import { parseRange } from '@/lib/time-range'

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  const { searchParams } = new URL(req.url)
  const { from, to } = parseRange(searchParams.get('from'), searchParams.get('to'))
  const limit = Math.max(1, Math.min(Math.trunc(Number(searchParams.get('limit'))) || 20, 100))
  const types = reportType(searchParams.get('type'))
  if (!types) return NextResponse.json({ error: 'invalid-payment-type' }, { status: 400 })
  const refunds = await prisma.refund.findMany({
    where: { createdAt: { gte: from, lte: to }, payment: types },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { id: true, amountPaise: true, createdAt: true, paymentId: true, status: true, gatewayRefundId: true, payment: { select: { bookingId: true, currency: true } } }
  })
  const ms = Date.now()-t0
  const logMeta = { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), limit, ms }
  if (ms > 400) console.warn('[admin][payments][refunds][slow]', logMeta)
  else console.log('[admin][payments][refunds]', logMeta)
  const items = refunds.map(row => ({
    id: row.id, paymentId: row.paymentId, createdAt: row.createdAt, amountPaise: row.amountPaise,
    outcome: refundReviewLabel(row), bookingId: row.payment.bookingId, currency: row.payment.currency ?? 'INR',
  }))
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, no-store' } })
}
