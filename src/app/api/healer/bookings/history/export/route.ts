import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'
import {
  HEALER_HISTORY_EXPORT_LIMIT, HEALER_HISTORY_STATUSES, type HealerHistoryStatus,
  healerHistoryCsv, healerHistoryWhere,
} from '@/lib/healer/booking-history'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

export async function GET(request: NextRequest) {
  let healerId: string
  try {
    healerId = (await requireHealer()).healer.id
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: 'Unauthorized' }, { status, headers })
    }
    console.error('[healer][booking_history][auth_failed]')
    return NextResponse.json({ error: 'Export unavailable' }, { status: 500, headers })
  }

  const params = request.nextUrl.searchParams
  if (params.getAll('status').length > 1 || params.getAll('q').length > 1) {
    return NextResponse.json({ error: 'Invalid history filters' }, { status: 400, headers })
  }
  const value = params.get('status') ?? 'all'
  if (!HEALER_HISTORY_STATUSES.includes(value as HealerHistoryStatus)) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400, headers })
  }
  const q = params.get('q') ?? ''
  if (q.length > 80) return NextResponse.json({ error: 'Search is too long' }, { status: 400, headers })
  try {
    const rows = await prisma.booking.findMany({
      where: healerHistoryWhere(healerId, value as HealerHistoryStatus, q.trim()),
      orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
      take: HEALER_HISTORY_EXPORT_LIMIT + 1,
      select: {
        id: true, scheduledAt: true, durationMin: true, status: true,
        service: { select: { name: true } },
      },
    })
    if (rows.length > HEALER_HISTORY_EXPORT_LIMIT) {
      return NextResponse.json({
        error: 'Too many appointments to export. Filter by status or service name.',
        code: 'HISTORY_TOO_LARGE', maxRows: HEALER_HISTORY_EXPORT_LIMIT,
      }, { status: 413, headers })
    }
    return new NextResponse(healerHistoryCsv(rows), { headers: {
      ...headers,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ganges-healers-practitioner-bookings.csv"',
    } })
  } catch (error) {
    console.error('[healer][booking_history][export_failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Export unavailable' }, { status: 500, headers })
  }
}
