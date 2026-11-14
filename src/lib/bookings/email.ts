import { randomUUID } from 'node:crypto'
import type { BookingEmailKind, Prisma } from '@prisma/client'
import { render } from '@react-email/components'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'
import { BookingConfirmationEmail } from '@/lib/email/templates/booking-confirmation'
import { trustedAuthEmailOrigin } from '@/lib/auth/email-links'
import { runSideEffect } from '@/lib/runSideEffect'
import { recordBookingNotifications } from './notifications'
import { BOOKING_TIME_ZONE } from './time'

const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000 // Stay inside Resend's 24-hour idempotency window.
const MAX_ATTEMPTS = 8
const snapshotSchema = z.object({
  message: z.object({ from: z.string().min(1), to: z.email(), subject: z.string().min(1), html: z.string().min(1) }).strict(),
  scheduledAt: z.iso.datetime(), healerId: z.string(), serviceId: z.string(),
}).strict()
type Outcome = 'sent' | 'pending' | 'skipped' | 'review' | 'busy'

/** Save exactly one event per booking/kind in the caller's business transaction. */
export async function recordBookingEmail(client: Prisma.TransactionClient, bookingId: string, kind: BookingEmailKind) {
  const created = await client.bookingEmail.createMany({ data: [{ bookingId, kind }], skipDuplicates: true })
  if (created.count) await recordBookingNotifications(client, bookingId, kind, `${bookingId}:${kind}`)
}

async function claim(id: string, origin: string) {
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "BookingEmail" WHERE "id" = ${id} FOR UPDATE SKIP LOCKED`
    if (!locked.length) return null
    const event = await tx.bookingEmail.findUniqueOrThrow({
      where: { id }, include: { booking: { include: {
        user: { select: { name: true, email: true, closedAt: true } },
        service: { select: { name: true } }, healer: { select: { user: { select: { name: true } } } },
      } } },
    })
    const now = new Date()
    if (event.status !== 'PENDING' || event.nextAttemptAt > now || (event.leaseUntil && event.leaseUntil > now)) return null
    const terminal = async (status: 'SKIPPED' | 'REVIEW', lastError: string) => {
      await tx.bookingEmail.update({ where: { id }, data: { status, lastError, claimToken: null, leaseUntil: null } })
      return { outcome: status === 'SKIPPED' ? 'skipped' as const : 'review' as const }
    }
    if (event.firstAttemptAt && now.getTime() - event.firstAttemptAt.getTime() >= RETRY_WINDOW_MS) return terminal('REVIEW', 'RETRY_WINDOW_EXPIRED')
    if (event.attempts >= MAX_ATTEMPTS) return terminal('REVIEW', 'ATTEMPTS_EXHAUSTED')
    const booking = event.booking
    const eligible = event.kind === 'REQUESTED' ? booking.status === 'PENDING' : ['CONFIRMED', 'RESCHEDULED'].includes(booking.status)
    if (!eligible || booking.user.closedAt || booking.scheduledAt <= now) return terminal('SKIPPED', 'BOOKING_INACTIVE')

    let snapshot: z.infer<typeof snapshotSchema>
    if (event.payload) {
      const parsed = snapshotSchema.safeParse(event.payload)
      if (!parsed.success) return terminal('REVIEW', 'PAYLOAD_INVALID')
      snapshot = parsed.data
      if (snapshot.scheduledAt !== booking.scheduledAt.toISOString() || snapshot.message.to !== booking.user.email
        || snapshot.healerId !== booking.healerId || snapshot.serviceId !== booking.serviceId) return terminal('REVIEW', 'BOOKING_CHANGED')
    } else {
      if (!z.email().safeParse(booking.user.email).success) return terminal('REVIEW', 'RECIPIENT_INVALID')
      const pending = event.kind === 'REQUESTED'
      const date = new Intl.DateTimeFormat('en-US', { timeZone: BOOKING_TIME_ZONE, month: 'long', day: 'numeric', year: 'numeric' }).format(booking.scheduledAt)
      const time = `${new Intl.DateTimeFormat('en-US', { timeZone: BOOKING_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(booking.scheduledAt)} IST`
      snapshot = {
        scheduledAt: booking.scheduledAt.toISOString(), healerId: booking.healerId, serviceId: booking.serviceId,
        message: {
          from: 'Ganges Healers <noreply@gangeshealers.com>', to: booking.user.email,
          subject: `${pending ? 'Booking Request Received' : 'Booking Confirmed'} - ${booking.service.name} on ${date}`,
          html: await render(BookingConfirmationEmail({ userName: booking.user.name || 'User', serviceName: booking.service.name,
            healerName: booking.healer.user.name || 'Healer', date, time, bookingId: booking.id,
            status: pending ? 'PENDING' : 'CONFIRMED', dashboardUrl: `${origin}/dashboard/bookings` })),
        },
      }
    }
    const token = randomUUID()
    await tx.bookingEmail.update({ where: { id }, data: {
      claimToken: token, leaseUntil: new Date(now.getTime() + 120000), attempts: { increment: 1 },
      firstAttemptAt: event.firstAttemptAt ?? now, payload: snapshot, lastError: null,
    } })
    return { outcome: 'claimed' as const, id, token, snapshot, attempts: event.attempts + 1 }
  }, { maxWait: 5000, timeout: 10000 })
}

async function deliver(id: string, origin: string): Promise<Outcome> {
  const event = await claim(id, origin)
  if (!event) return 'busy'
  if (event.outcome !== 'claimed') return event.outcome
  const result = await emailService.sendBookingNotice(event.snapshot.message, `booking-email/${event.id}`)
  const sent = result.success && 'id' in result && typeof result.id === 'string' && Boolean(result.id.trim())
  const exhausted = event.attempts >= MAX_ATTEMPTS
  const updated = await prisma.bookingEmail.updateMany({
    where: { id, claimToken: event.token, status: 'PENDING' },
    data: sent ? { status: 'SENT', sentAt: new Date(), providerMessageId: result.id, claimToken: null, leaseUntil: null, lastError: null }
      : { status: exhausted ? 'REVIEW' : 'PENDING', lastError: exhausted ? 'ATTEMPTS_EXHAUSTED' : 'PROVIDER_UNCONFIRMED',
        nextAttemptAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** (event.attempts - 1))), claimToken: null, leaseUntil: null },
  })
  if (!updated.count) return 'busy' // An expired claimant cannot overwrite a newer outcome.
  if (!sent) console.warn('[bookings][email][unconfirmed]', { eventId: id, attempts: event.attempts })
  return sent ? 'sent' : exhausted ? 'review' : 'pending'
}

/** Drain a bounded batch. Pending/unknown provider outcomes remain durable for recovery. */
export async function drainBookingEmails(options: { bookingId?: string; limit?: number } = {}) {
  const counts = { processed: 0, sent: 0, pending: 0, skipped: 0, review: 0, busy: 0, disabled: false }
  const origin = trustedAuthEmailOrigin()
  if (!emailService.isEnabled() || !origin) return { ...counts, disabled: true }
  const now = new Date()
  const events = await prisma.bookingEmail.findMany({
    where: { status: 'PENDING', bookingId: options.bookingId, nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: Math.max(1, Math.min(5, options.limit ?? 3)), select: { id: true },
  })
  for (const event of events) {
    try {
      const outcome = await deliver(event.id, origin)
      counts[outcome]++
    } catch {
      // Keep the lease/payload intact after an ambiguous provider or persistence failure.
      counts.pending++
      console.error('[bookings][email][dispatch_failed]', { eventId: event.id })
    }
    counts.processed++
  }
  return counts
}

/** Start delivery after the committed booking decision, retaining the request lifetime. */
export async function dispatchBookingEmails(bookingId: string) {
  await runSideEffect(drainBookingEmails({ bookingId, limit: 2 }).catch(() => {
    console.error('[bookings][email][dispatch_failed]', { bookingId })
  }))
}
