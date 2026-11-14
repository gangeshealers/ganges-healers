import { capturedPaymentWhere, reportType } from '@/lib/admin/payment-report'
import { parseRange } from '@/lib/time-range'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100)
  const typeFilter = searchParams.get('type')
  const types = reportType(typeFilter)
  if (!types) return NextResponse.json({ error: 'invalid-payment-type' }, { status: 400 })
  const { from, to } = parseRange(searchParams.get('from'), searchParams.get('to'))
  const dated = searchParams.has('from') || searchParams.has('to')
  const where = { ...capturedPaymentWhere, ...types, ...(dated ? { createdAt: { gte: from, lte: to } } : {}) }
  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, createdAt: true, amountPaise: true, currency: true, type: true, metadata: true, userId: true }
  })
  const items = payments.map((p: { id: string; createdAt: Date; amountPaise: number; type: string | null; currency: string | null; metadata: unknown; userId: string | null }) => {
    const md: any = p.metadata || {} // eslint-disable-line @typescript-eslint/no-explicit-any
    let source: string | null = null
    if (md.programId) source = 'Program'
    else if (md.bookingId) source = 'Booking'
    else if (p.type === 'MEMBERSHIP') source = 'Membership'
    return {
      id: p.id,
      createdAt: p.createdAt,
      amountPaise: p.amountPaise,
      currency: p.currency ?? 'INR',
      type: p.type,
      source,
      userId: p.userId
    }
  })
  const ms = Date.now()-t0
  const logMeta = { limit, type: typeFilter || 'ALL', ms }
  if (ms > 400) console.warn('[admin][payments][latest][slow]', logMeta)
  else console.log('[admin][payments][latest]', logMeta)
  return NextResponse.json({ items })
}
