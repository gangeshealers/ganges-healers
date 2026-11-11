import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'
import { clinicDate, clinicSlotInstant, BOOKING_TIME_ZONE } from '@/lib/bookings/time'
import { bookingDeliveryState } from '@/lib/bookings/session-delivery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const dateFormatter = new Intl.DateTimeFormat('en-IN', { timeZone: BOOKING_TIME_ZONE, year: 'numeric', month: 'long', day: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('en-IN', { timeZone: BOOKING_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true })

/** Reminder window is tomorrow's local calendar date in India, not the host server's timezone. */
export function reminderWindow(now = new Date()) {
  const tomorrow = clinicDate(new Date(now.getTime() + 86400000))
  const start = clinicSlotInstant(tomorrow, '00:00')
  return { start, end: new Date(start.getTime() + 86400000) }
}

/** The scheduler is authorized by the configured secret, never by a caller-controlled date. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim() || request.headers.get('authorization') !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  }

  try {
    const { start, end } = reminderWindow()
    const upcomingBookings = await prisma.booking.findMany({
      where: { scheduledAt: { gte: start, lt: end }, status: { in: ['CONFIRMED', 'RESCHEDULED'] } },
      select: {
        id: true, scheduledAt: true, pricePaise: true, status: true,
        payment: { select: { status: true, statusEnum: true, amountPaise: true, gateway: true } },
        user: { select: { email: true, name: true, closedAt: true } },
        service: { select: { name: true } },
        healer: { select: { user: { select: { name: true } } } },
      },
    })
    // An unfunded reschedule does not authorize a confirmed appointment reminder.
    const eligible = upcomingBookings.filter(b => !b.user.closedAt && bookingDeliveryState(b).confirmed)
    const results = await Promise.all(eligible.map(booking =>
      emailService.sendBookingReminder({
        to: booking.user.email,
        userName: booking.user.name || 'User',
        serviceName: booking.service.name,
        healerName: booking.healer.user.name || 'Healer',
        date: dateFormatter.format(booking.scheduledAt),
        time: timeFormatter.format(booking.scheduledAt) + ' IST',
        bookingId: booking.id,
        scheduledAtIso: booking.scheduledAt.toISOString(),
      })
    ))
    return NextResponse.json({
      success: true,
      remindersSent: results.filter(result => result.success).length,
      total: upcomingBookings.length,
      eligible: eligible.length,
      skipped: upcomingBookings.length - eligible.length,
    }, { headers })
  } catch (error) {
    console.error('[bookings][reminders][failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500, headers })
  }
}
