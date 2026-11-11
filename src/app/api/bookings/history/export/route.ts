import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  BOOKING_HISTORY_FILTERS, BOOKING_HISTORY_EXPORT_LIMIT,
  type BookingHistoryFilter, bookingHistoryCsv, bookingHistoryWhere,
} from '@/lib/bookings/history'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

/** Private historical appointment export using exactly the same filters as the member UI. */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  }
  const params = request.nextUrl.searchParams
  if (params.getAll('status').length > 1 || params.getAll('q').length > 1) {
    return NextResponse.json({ error: 'Invalid history filters' }, { status: 400, headers })
  }
  const rawStatus = params.get('status') ?? 'all'
  if (!BOOKING_HISTORY_FILTERS.includes(rawStatus as BookingHistoryFilter)) {
    return NextResponse.json({ error: 'Invalid booking status' }, { status: 400, headers })
  }
  const rawQuery = params.get('q') ?? ''
  if (rawQuery.length > 80) {
    return NextResponse.json({ error: 'Search is too long' }, { status: 400, headers })
  }
  const status = rawStatus as BookingHistoryFilter
  const query = rawQuery.trim()

  try {
    const rows = await prisma.booking.findMany({
      where: bookingHistoryWhere(session.user.id, status, query),
      orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
      take: BOOKING_HISTORY_EXPORT_LIMIT + 1,
      select: {
        id: true, scheduledAt: true, durationMin: true, status: true,
        service: { select: { name: true } },
        healer: { select: { user: { select: { name: true } } } },
      },
    })
    if (rows.length > BOOKING_HISTORY_EXPORT_LIMIT) {
      return NextResponse.json({
        error: 'History is too large for one download. Apply a service or status filter.',
        code: 'HISTORY_TOO_LARGE',
        maxRows: BOOKING_HISTORY_EXPORT_LIMIT,
      }, { status: 413, headers })
    }
    return new NextResponse(bookingHistoryCsv(rows), { headers: {
      ...headers,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ganges-healers-booking-history.csv"',
    } })
  } catch (error) {
    console.error('[bookings][history][export_failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Booking history export unavailable' }, { status: 500, headers })
  }
}
