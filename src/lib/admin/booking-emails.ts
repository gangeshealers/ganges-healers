import { Prisma, type BookingEmailStatus, type BookingEmailKind, type BookingStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

export const bookingEmailReasons = new Map([
  ['ATTEMPTS_EXHAUSTED', 'The automatic attempt limit was reached.'],
  ['BOOKING_CHANGED', 'The booking or recipient changed after the message was prepared.'],
  ['BOOKING_INACTIVE', 'The booking is no longer eligible for this message.'],
  ['PAYLOAD_INVALID', 'The saved message could not be validated.'],
  ['PROVIDER_UNCONFIRMED', 'The provider did not confirm acceptance.'],
  ['RECIPIENT_INVALID', 'The saved recipient address needs review.'],
  ['RETRY_WINDOW_EXPIRED', 'The automatic retry window ended.'],
  ['STAFF_STOPPED', 'An administrator stopped automatic retries after review.'],
])
export type ReviewedEmail = {
  id: string; bookingId: string; kind: BookingEmailKind; status: BookingEmailStatus
  version: string; recipient: string | null; hasPayload: boolean; attempts: number
  firstAttemptAt: Date | null; nextAttemptAt: Date; leaseUntil: Date | null
  reason: string | null; providerMessageId: string | null; sentAt: Date | null
  scheduledAt: Date; bookingStatus: BookingStatus; serviceName: string
  customerName: string | null; healerName: string | null
}

/** Project private delivery data before React can observe an awaited database result.
 * The opaque fingerprint covers every saved field, including payload and worker token.
 */
export async function loadBookingEmailReview(id: string, db: Pick<Prisma.TransactionClient, '$queryRaw'> = prisma): Promise<ReviewedEmail | null> {
  const rows = await db.$queryRaw<ReviewedEmail[]>(Prisma.sql`
    SELECT e.id, e."bookingId", e.kind::text AS kind, e.status::text AS status, e.attempts,
      e."firstAttemptAt", e."nextAttemptAt", e."leaseUntil", e."providerMessageId", e."sentAt",
      encode(sha256(convert_to(to_jsonb(e)::text, 'UTF8')), 'hex') AS version,
      (e.payload IS NOT NULL AND e.payload <> 'null'::jsonb) AS "hasPayload",
      CASE WHEN length(e.payload #>> '{message,to}') <= 254
        AND (e.payload #>> '{message,to}') ~ '^[A-Za-z0-9.!#$%&''*+/=?^_\x60{|}~-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$'
        THEN e.payload #>> '{message,to}' END AS recipient,
      CASE WHEN e."lastError" IN (${Prisma.join([...bookingEmailReasons.keys()])}) THEN e."lastError"
        WHEN e."lastError" IS NOT NULL THEN 'OTHER' END AS reason,
      b."scheduledAt", b.status::text AS "bookingStatus", s.name AS "serviceName",
      customer.name AS "customerName", practitioner.name AS "healerName"
    FROM "BookingEmail" e
    JOIN "Booking" b ON b.id = e."bookingId"
    JOIN "Service" s ON s.id = b."serviceId"
    JOIN "User" customer ON customer.id = b."userId"
    JOIN "Healer" h ON h.id = b."healerId"
    JOIN "User" practitioner ON practitioner.id = h."userId"
    WHERE e.id = ${id}
  `)
  return rows[0] ?? null
}

const common = z.object({
  ownerId: z.string().min(1).max(200), id: z.string().min(1).max(200),
  version: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().min(1).max(300),
}).strict()
export const bookingEmailDecisionSchema = z.discriminatedUnion('decision', [
  common.extend({ decision: z.literal('accepted'), providerMessageId: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9_-]+$/) }).strict(),
  common.extend({ decision: z.literal('stopped') }).strict(),
])
export type BookingEmailDecisionInput = z.infer<typeof bookingEmailDecisionSchema>
export type BookingEmailReviewRecord = {
  id: string; status: BookingEmailStatus; version: string; canAccept: boolean; canStop: boolean
  providerMessageId: string | null; sentAt: string | null; leaseUntil: string | null
}
export type BookingEmailDecisionResult = { success: true; record: BookingEmailReviewRecord } | { success: false; code: string; error: string }

export class BookingEmailReviewError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); this.name = 'BookingEmailReviewError' }
}

/** Only unresolved work can be stopped; verified acceptance can reconcile a previously skipped attempt. */
export function bookingEmailReviewRecord(row: ReviewedEmail, now = new Date()): BookingEmailReviewRecord {
  const active = Boolean(row.leaseUntil && row.leaseUntil > now)
  return {
    id: row.id, status: row.status, version: row.version,
    canAccept: !active && row.status !== 'SENT' && row.attempts > 0 && Boolean(row.firstAttemptAt && row.hasPayload),
    canStop: !active && (row.status === 'PENDING' || row.status === 'REVIEW'),
    providerMessageId: row.providerMessageId, sentAt: row.sentAt?.toISOString() ?? null,
    leaseUntil: active ? row.leaseUntil!.toISOString() : null,
  }
}

/** Record a reviewed provider outcome and audit together; never send, requeue or rotate a key. */
export async function reconcileBookingEmail(actorId: string, raw: unknown): Promise<BookingEmailReviewRecord> {
  const parsed = bookingEmailDecisionSchema.safeParse(raw)
  if (!parsed.success) throw new BookingEmailReviewError('Review the message, enter a reason, and provide a valid provider message ID when recording acceptance.', 400, 'INVALID_EMAIL_REVIEW')
  const input = parsed.data
  if (input.ownerId !== actorId) throw new BookingEmailReviewError('Your account changed. Reload this message before saving.', 409, 'SESSION_CHANGED')
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR SHARE`
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, closedAt: true } })
    if (actor?.role !== 'ADMIN' || actor.closedAt) throw new BookingEmailReviewError('Administrator access is required.', 403, 'FORBIDDEN')
    await tx.$queryRaw`SELECT "id" FROM "BookingEmail" WHERE "id" = ${input.id} FOR UPDATE`
    const row = await loadBookingEmailReview(input.id, tx)
    if (!row) throw new BookingEmailReviewError('This delivery record no longer exists. Reload the message list.', 404, 'EMAIL_NOT_FOUND')
    if (row.version !== input.version) throw new BookingEmailReviewError('Delivery changed since you reviewed it. Reload the message and review the latest values.', 409, 'EMAIL_CHANGED')
    const permissions = bookingEmailReviewRecord(row)
    if (permissions.leaseUntil) throw new BookingEmailReviewError('A delivery attempt is active. Refresh after its lease expires before reviewing it.', 409, 'EMAIL_BUSY')
    if (input.decision === 'accepted' ? !permissions.canAccept : !permissions.canStop) {
      throw new BookingEmailReviewError('This delivery state does not allow that decision. Reload and review its current status.', 409, 'EMAIL_DECISION_UNAVAILABLE')
    }
    const saved = await tx.bookingEmail.update({ where: { id: row.id }, data: input.decision === 'accepted'
      ? { status: 'SENT', providerMessageId: input.providerMessageId, sentAt: new Date(), lastError: null, leaseUntil: null, claimToken: null }
      : { status: 'SKIPPED', lastError: 'STAFF_STOPPED', leaseUntil: null, claimToken: null }, select: { id: true, status: true, providerMessageId: true } })
    await tx.activityLog.create({ data: {
      userId: actorId, action: input.decision === 'accepted' ? 'booking_email_acceptance_recorded' : 'booking_email_retries_stopped',
      entityType: 'booking_email', entityId: row.id,
      metadata: { reason: input.reason, statusBefore: row.status, statusAfter: saved.status,
        attempts: row.attempts, lastErrorBefore: row.reason, providerMessageIdBefore: row.providerMessageId, providerMessageId: saved.providerMessageId,
        leaseUntilBefore: row.leaseUntil?.toISOString() ?? null, reviewedVersion: input.version },
    }, select: { id: true } })
    return bookingEmailReviewRecord((await loadBookingEmailReview(saved.id, tx))!)
  }, { maxWait: 5000, timeout: 10000 })
}
