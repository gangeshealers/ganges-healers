import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calendarFeedResponse, type CalendarEvent } from '@/lib/bookings/calendar'
import { bookingDeliveryState } from '@/lib/bookings/session-delivery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const MAX_UPCOMING = 100

/** One account-owned, read-only iCalendar snapshot of upcoming session bookings. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in to export your bookings.' }, { status: 401, headers: privateHeaders })
  }

  try {
    const rows = await prisma.booking.findMany({
      where: {
        userId: session.user.id,
        scheduledAt: { gt: new Date() },
        status: { in: ['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: MAX_UPCOMING + 1,
      select: {
        id: true, scheduledAt: true, updatedAt: true, durationMin: true, status: true,
        pricePaise: true, meetingLink: true,
        payment: { select: { status: true, statusEnum: true, amountPaise: true, gateway: true } },
        service: { select: { name: true } },
        healer: { select: { user: { select: { name: true } } } },
      },
    })
    // Never send an incomplete calendar while implying it contains all future sessions.
    if (rows.length > MAX_UPCOMING) {
      return NextResponse.json({
        error: 'Your schedule is too large for one file. Please contact support for assistance.',
        code: 'CALENDAR_TOO_LARGE',
        maxEvents: MAX_UPCOMING,
      }, { status: 413, headers: privateHeaders })
    }

    const events: CalendarEvent[] = rows.map(row => {
      const delivery = bookingDeliveryState(row)
      return {
        id: 'booking-' + row.id,
        title: 'Ganges Healers · ' + row.service.name,
        description: 'Session with ' + (row.healer.user.name || 'your practitioner') + '. Status: ' + row.status + '. Check My Bookings for current details.',
        start: row.scheduledAt,
        durationMin: row.durationMin,
        updatedAt: row.updatedAt,
        status: delivery.confirmed ? 'CONFIRMED' : 'TENTATIVE',
        meetingLink: delivery.confirmed ? row.meetingLink : null,
      }
    })
    return calendarFeedResponse(events)
  } catch (error) {
    console.error('[bookings][calendar][feed_failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Could not export upcoming bookings. Please try again.' }, { status: 500, headers: privateHeaders })
  }
}
