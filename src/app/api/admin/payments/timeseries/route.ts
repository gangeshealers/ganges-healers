import { referencedRefundStatus } from '@/lib/bookings/refund-policy'
import { capturedPaymentWhere, inrPaymentWhere, reportType } from '@/lib/admin/payment-report'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/rbac'
import { parseRange } from '@/lib/time-range'
import { ensureByTypeKeys } from '@/lib/admin/metrics-constants'


function enumerateDays(from: Date, to: Date) {
  const dates: string[] = []
  const d = new Date(from)
  while (d <= to) {
    dates.push(d.toISOString().slice(0,10))
    d.setDate(d.getDate()+1)
  }
  return dates
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  const { searchParams } = new URL(req.url)
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')
  const typeFilter = searchParams.get('type')
  const { from, to } = parseRange(fromStr, toStr)

  const types = reportType(typeFilter)
  if (!types) return NextResponse.json({ error: 'invalid-payment-type' }, { status: 400 })
  const date = { gte: from, lte: to }
  const paymentWhere = { createdAt: date, ...types, AND: [capturedPaymentWhere, inrPaymentWhere] }
  const refundWhere = { createdAt: date, payment: { ...types, ...inrPaymentWhere } }

  const payments = await prisma.payment.findMany({
    where: paymentWhere,
    select: { createdAt: true, amountPaise: true, type: true }
  })
  const refunds = await prisma.refund.findMany({ where: refundWhere, select: { createdAt: true, amountPaise: true, status: true, gatewayRefundId: true } })

  const buckets: Record<string, { gross: number; refunds: number; byType: Record<string, number> }> = {}
  for (const p of payments) {
    const day = p.createdAt.toISOString().slice(0,10)
    if (!buckets[day]) buckets[day] = { gross: 0, refunds: 0, byType: {} }
    buckets[day].gross += p.amountPaise
    const t = p.type || 'OTHER'
    buckets[day].byType[t] = (buckets[day].byType[t] || 0) + p.amountPaise
  }
  for (const r of refunds) {
    if (referencedRefundStatus(r) !== 'SUCCESS') continue
    const day = r.createdAt.toISOString().slice(0,10)
    if (!buckets[day]) buckets[day] = { gross: 0, refunds: 0, byType: {} }
    buckets[day].refunds += r.amountPaise
  }

  const days = enumerateDays(from, to)
  const series = days.map(day => {
    const b = buckets[day] || { gross: 0, refunds: 0, byType: {} as Record<string, number> }
    const net = b.gross - b.refunds
    // stabilize byType keys
    const byType = ensureByTypeKeys(b.byType)
    return { date: day, grossPaise: b.gross, refundsPaise: b.refunds, netPaise: net, byType }
  })
  const ms = Date.now()-t0
  const logMeta = { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), type: typeFilter || 'ALL', ms }
  if (ms > 400) console.warn('[admin][payments][timeseries][slow]', logMeta)
  else console.log('[admin][payments][timeseries]', logMeta)
  return NextResponse.json(series)
}
