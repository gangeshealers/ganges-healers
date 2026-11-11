import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'
import {
  HEALER_ACTIVITY_MAX_EXPORT, HEALER_ACTIVITY_PERIODS, type HealerActivityPeriod,
  healerActivityCsv, healerActivityWhere,
} from '@/lib/healer/payment-activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

/** Download exactly the requesting healer's captured INR session activity. */
export async function GET(req: NextRequest) {
  let healer: Awaited<ReturnType<typeof requireHealer>>['healer']
  try {
    ({ healer } = await requireHealer())
  } catch (error) {
    const code = (error as { status?: number }).status
    if (code === 401 || code === 403) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: code, headers })
    }
    console.error('[healer][payments][export_auth_failed]')
    return NextResponse.json({ error: 'Export unavailable' }, { status: 500, headers })
  }
  const all = new URL(req.url).searchParams.getAll('period')
  if (all.length > 1 || all[0] && !HEALER_ACTIVITY_PERIODS.includes(all[0] as HealerActivityPeriod)) {
    return NextResponse.json({ error: 'Invalid period filter' }, { status: 400, headers })
  }
  const period = (all[0] ?? 'month') as HealerActivityPeriod

  try {
    const rows = await prisma.payment.findMany({
      where: healerActivityWhere(healer.id, period),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: HEALER_ACTIVITY_MAX_EXPORT + 1,
      select: {
        id: true, createdAt: true, amountPaise: true,
        booking: { select: { id: true, scheduledAt: true, service: { select: { name: true } } } },
      },
    })
    if (rows.length > HEALER_ACTIVITY_MAX_EXPORT) {
      return NextResponse.json({
        error: 'Too many payment records for one export. Try a shorter period.',
        code: 'EXPORT_TOO_LARGE',
        maxRows: HEALER_ACTIVITY_MAX_EXPORT,
      }, { status: 413, headers })
    }
    return new NextResponse(healerActivityCsv(rows), { headers: {
      ...headers,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ganges-healers-session-payments.csv"',
    } })
  } catch (error) {
    console.error('[healer][payments][export_failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Export unavailable' }, { status: 500, headers })
  }
}
