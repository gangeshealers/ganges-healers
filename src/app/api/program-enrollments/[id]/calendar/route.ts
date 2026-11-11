import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { programActor, ProgramAccessError } from '@/lib/programs/enrollments'
import { calendarFeedResponse, type CalendarEvent } from '@/lib/bookings/calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMIT = 100
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
type Context = { params: Promise<{ id: string }> }

/** Private snapshot of an owned program's future, actually reserved appointments. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const actor = await programActor()
    const { id } = await params
    if (!id || id.length > 200) {
      return NextResponse.json({ error: 'Program enrollment not found' }, { status: 404, headers })
    }
    const enrollment = await prisma.programEnrollment.findFirst({
      where: { id, userId: actor.id },
      select: {
        status: true,
        program: { select: { title: true } },
        sessions: {
          where: { status: 'SCHEDULED', scheduledAt: { gt: new Date() } },
          orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
          take: LIMIT + 1,
          select: {
            id: true, sessionNumber: true, scheduledAt: true, durationMin: true, updatedAt: true,
            meetingLink: true, healer: { select: { user: { select: { name: true } } } },
          },
        },
      },
    })
    if (!enrollment) return NextResponse.json({ error: 'Program enrollment not found' }, { status: 404, headers })
    // Paused, completed or cancelled enrollments must not advertise live future sessions.
    const reserved = enrollment.status === 'active' ? enrollment.sessions : []
    if (reserved.length > LIMIT) {
      return NextResponse.json({
        error: 'Too many upcoming sessions for one file. Please contact support.',
        code: 'CALENDAR_TOO_LARGE',
        maxEvents: LIMIT,
      }, { status: 413, headers })
    }
    const events: CalendarEvent[] = reserved.map(row => ({
      id: 'program-' + row.id,
      title: enrollment.program.title + ' · Session ' + row.sessionNumber,
      description: 'Ganges Healers program session with ' +
        (row.healer.user.name || 'your practitioner') + '. Check My Programs for current details.',
      start: row.scheduledAt,
      durationMin: row.durationMin,
      updatedAt: row.updatedAt,
      status: 'CONFIRMED',
      meetingLink: row.meetingLink,
    }))
    return calendarFeedResponse(events)
  } catch (error) {
    if (error instanceof ProgramAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers })
    }
    console.error('[programs][calendar][export_failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Could not export program sessions.' }, { status: 500, headers })
  }
}
