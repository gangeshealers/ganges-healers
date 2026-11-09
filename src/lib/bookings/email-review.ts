import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

export const BOOKING_EMAIL_REVIEW_ACTION = 'booking_email_reviewed'
export const BOOKING_EMAIL_REVIEW_ENTITY = 'booking_email'
export const bookingEmailReviewOutcomes = [
  { value: 'ACCEPTANCE_CONFIRMED', label: 'Provider acceptance confirmed' },
  { value: 'FOLLOW_UP_COMPLETE', label: 'Customer follow-up completed' },
  { value: 'NO_FOLLOW_UP', label: 'No follow-up needed' },
] as const

const outcomes = bookingEmailReviewOutcomes.map(option => option.value)
const inputSchema = z.object({
  ownerId: z.string().min(1).max(200),
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
  version: z.string().regex(/^\d{1,16}$/),
  outcome: z.enum(outcomes),
}).strict()

export class BookingEmailReviewError extends Error {
  constructor(message: string, public readonly reloadRequired = false) {
    super(message)
  }
}

/** Record staff disposition independently of the provider's delivery state. */
export async function reviewBookingEmail(actorId: string, raw: unknown) {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) throw new BookingEmailReviewError('Select a review outcome for this notice.')
  const input = parsed.data
  if (input.ownerId !== actorId) throw new BookingEmailReviewError('Your account changed. Reload the queue before recording the review.', true)

  return prisma.$transaction(async tx => {
    const [actor] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "User" WHERE id = ${actorId} AND role = 'ADMIN' AND "closedAt" IS NULL FOR SHARE
    `
    if (!actor) throw new BookingEmailReviewError('Administrator access is required.')

    // Serialize review writes with each other and with any delivery-state update.
    const [notice] = await tx.$queryRaw<Array<{ status: string; updatedAt: Date }>>`
      SELECT status::text AS status, "updatedAt" FROM "BookingEmail" WHERE id = ${input.id} FOR UPDATE
    `
    if (notice?.status !== 'REVIEW' || String(notice.updatedAt.getTime()) !== input.version) {
      throw new BookingEmailReviewError('This notice changed. Reload the queue and review the current details.', true)
    }

    const key = { action: BOOKING_EMAIL_REVIEW_ACTION, entityType: BOOKING_EMAIL_REVIEW_ENTITY, entityId: input.id }
    const [previous] = await tx.$queryRaw<Array<{ outcome: string }>>`
      SELECT metadata->>'outcome' AS outcome FROM "ActivityLog"
      WHERE "entityType" = ${key.entityType} AND "entityId" = ${key.entityId} AND action = ${key.action}
        AND metadata->>'version' = ${input.version} AND metadata->>'outcome' IN (${Prisma.join(outcomes)})
      ORDER BY "createdAt" ASC, id ASC LIMIT 1
    `
    if (previous) {
      if (previous.outcome === input.outcome) return { recorded: false }
      throw new BookingEmailReviewError('A different review is already saved. Open Reviewed to see the outcome.', true)
    }

    await tx.activityLog.create({
      data: { ...key, userId: actorId, metadata: { version: input.version, outcome: input.outcome } },
      select: { id: true },
    })
    return { recorded: true }
  }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 })
}
