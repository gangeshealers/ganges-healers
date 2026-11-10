import { createHash, randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { BOOKING_TIME_ZONE } from './time'

export type BookingNoticeKind = 'REQUESTED' | 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED'
const labels = {
  REQUESTED: { customer: 'Booking request received', practitioner: 'New booking request' },
  CONFIRMED: { customer: 'Booking confirmed', practitioner: 'Appointment confirmed' },
  RESCHEDULED: { customer: 'Booking rescheduled', practitioner: 'Appointment rescheduled' },
  CANCELLED: { customer: 'Booking cancelled', practitioner: 'Appointment cancelled' },
} as const

/** Persist at most two notices with the business transition; no queue or provider is involved. */
export async function recordBookingNotifications(client: Prisma.TransactionClient, bookingId: string, kind: BookingNoticeKind, transitionId: string = randomUUID()) {
  try {
    const booking = await client.booking.findUniqueOrThrow({ where: { id: bookingId }, select: {
      id: true, userId: true, status: true, scheduledAt: true,
      user: { select: { closedAt: true } }, service: { select: { name: true } },
      healer: { select: { userId: true, user: { select: { closedAt: true, role: true } } } },
    } })
    const eligible = kind === 'REQUESTED' ? booking.status === 'PENDING'
      : kind === 'CONFIRMED' ? ['CONFIRMED', 'RESCHEDULED'].includes(booking.status)
        : kind === 'RESCHEDULED' ? booking.status === 'RESCHEDULED' : booking.status === 'CANCELLED'
    if (!eligible) return 0
    const when = new Intl.DateTimeFormat('en-IN', { timeZone: BOOKING_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(booking.scheduledAt) + ' IST'
    const recipients: { id: string; audience: 'customer' | 'practitioner' }[] = []
    if (!booking.user.closedAt) recipients.push({ id: booking.userId, audience: 'customer' })
    if (!booking.healer.user.closedAt && booking.healer.user.role === 'HEALER' && booking.healer.userId !== booking.userId) recipients.push({ id: booking.healer.userId, audience: 'practitioner' })
    if (!recipients.length) return 0
    const result = await client.notification.createMany({ data: recipients.map(({ id, audience }) => ({
      id: 'booking_' + createHash('sha256').update(JSON.stringify([bookingId, kind, transitionId, id])).digest('hex'),
      userId: id, type: `booking_${kind.toLowerCase()}_${audience}`, title: labels[kind][audience],
      message: `${booking.service.name} · ${when}. ${kind === 'REQUESTED' ? 'This request is awaiting confirmation.' : kind === 'CANCELLED' ? audience === 'customer' ? 'Cancellation is recorded. Open your bookings for the saved refund outcome.' : 'This appointment is cancelled.' : kind === 'RESCHEDULED' ? 'The saved appointment time has changed.' : 'This appointment is confirmed.'}`,
    })), skipDuplicates: true })
    return result.count
  } catch (error) {
    console.error('[bookings][notifications][record_failed]', { kind, errorType: error instanceof Error ? error.name : 'unknown' })
    throw new Error('Booking notifications could not be recorded')
  }
}
