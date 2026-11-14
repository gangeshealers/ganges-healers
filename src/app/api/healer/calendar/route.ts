import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'
import { renderCalendarFeed, type CalendarEvent } from '@/lib/bookings/calendar'
import { bookingDeliveryState } from '@/lib/bookings/session-delivery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_EVENTS = 100
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

/** One private snapshot of the signed-in practitioner's upcoming confirmed sessions. */
export async function GET() {
  let healerId: string
  try {
    healerId = (await requireHealer()).healer.id
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: 'Unauthorized' }, { status, headers: privateHeaders })
    }
    console.error('[healer][calendar][auth_failed]')
    return NextResponse.json({ error: 'Schedule unavailable' }, { status: 500, headers: privateHeaders })
  }

  try {
    const now = new Date()
    const [bookings, programs] = await Promise.all([
      prisma.booking.findMany({
        where: {
          healerId,
          scheduledAt: { gt: now },
          status: { in: ['CONFIRMED', 'RESCHEDULED'] },
        },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        take: MAX_EVENTS + 1,
        select: {
          id: true, scheduledAt: true, durationMin: true, status: true, pricePaise: true,
          updatedAt: true, meetingLink: true,
          payment: { select: { status: true, statusEnum: true, amountPaise: true, gateway: true } },
          service: { select: { name: true } },
        },
      }),
      prisma.programSession.findMany({
        where: {
          healerId,
          status: 'SCHEDULED',
          scheduledAt: { gt: now },
          enrollment: { status: 'active' },
        },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        take: MAX_EVENTS + 1,
        select: {
          id: true, sessionNumber: true, scheduledAt: true, durationMin: true,
          updatedAt: true, meetingLink: true,
          enrollment: { select: { program: { select: { title: true } } } },
        },
      }),
    ])
    // Reject a potentially incomplete schedule even if some candidate bookings
    // are unfunded; never silently stop at the first hundred rows.
    if (bookings.length + programs.length > MAX_EVENTS) {
      return NextResponse.json({
        error: 'Your schedule is too large for one calendar file. Contact support.',
        code: 'CALENDAR_TOO_LARGE',
        maxEvents: MAX_EVENTS,
      }, { status: 413, headers: privateHeaders })
    }
    const events: CalendarEvent[] = [
      ...bookings.filter(booking => bookingDeliveryState(booking).confirmed).map(booking => ({
        id: 'booking-' + booking.id,
        title: 'Ganges Healers · ' + booking.service.name,
        description: 'Confirmed practitioner appointment. Check the healer bookings workspace for current details.',
        start: booking.scheduledAt,
        durationMin: booking.durationMin,
        updatedAt: booking.updatedAt,
        status: 'CONFIRMED' as const,
        meetingLink: booking.meetingLink,
      })),
      ...programs.map(row => ({
        id: 'program-' + row.id,
        title: row.enrollment.program.title + ' · Session ' + row.sessionNumber,
        description: 'Confirmed program reservation. Check Assigned Programs for current details.',
        start: row.scheduledAt,
        durationMin: row.durationMin,
        updatedAt: row.updatedAt,
        status: 'CONFIRMED' as const,
        meetingLink: row.meetingLink,
      })),
    ].sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id))

    return new Response(renderCalendarFeed(events), {
      headers: {
        ...privateHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ganges-healers-practitioner-schedule.ics"',
      },
    })
  } catch (error) {
    console.error('[healer][calendar][export_failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Schedule unavailable' }, { status: 500, headers: privateHeaders })
  }
}
