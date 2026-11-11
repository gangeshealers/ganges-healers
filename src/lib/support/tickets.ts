import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const ticketInput = z.object({
  subject: z.string().trim().min(5).max(120),
  message: z.string().trim().min(20).max(3000),
}).strict()

const adminUpdate = z.object({
  id: z.string().min(8).max(80),
  updatedAt: z.string().datetime({ offset: true }),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
  response: z.string().trim().max(3000),
})

export class SupportTicketError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message)
    this.name = 'SupportTicketError'
  }
}

/**
 * Authenticated support submission. A PostgreSQL transaction-scoped advisory
 * lock serializes concurrent submissions from one account so the persistent
 * five-tickets-per-day limit works across serverless instances.
 */
export async function createMemberSupportTicket(userId: string, input: unknown) {
  if (!userId) throw new SupportTicketError('Sign in to contact support.', 401, 'UNAUTHORIZED')
  const parsed = ticketInput.safeParse(input)
  if (!parsed.success) {
    throw new SupportTicketError('Enter a subject (5–120 characters) and message (20–3000 characters).', 400, 'INVALID_INPUT')
  }
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return prisma.$transaction(async tx => {
    // No email/contents are placed in the advisory-lock key or server logs.
    await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(707071, hashtext(${userId}))`
    const submitted = await tx.supportTicket.count({
      where: { userId, createdAt: { gte: windowStart } },
    })
    if (submitted >= 5) {
      throw new SupportTicketError('You have reached the daily limit of support requests. Please review your existing requests or try again later.', 429, 'RATE_LIMITED')
    }
    return tx.supportTicket.create({
      data: { userId, subject: parsed.data.subject, message: parsed.data.message },
      select: { id: true, status: true },
    })
  }, { maxWait: 5000, timeout: 15000 })
}

/** Admin-only call site must authenticate before invoking this helper. */
export async function updateAdminSupportTicket(input: unknown) {
  const parsed = adminUpdate.safeParse(input)
  if (!parsed.success) throw new SupportTicketError('Review the response and reload the ticket.', 400, 'INVALID_INPUT')
  const { id, updatedAt, status, response } = parsed.data
  const result = await prisma.supportTicket.updateMany({
    where: { id, updatedAt: new Date(updatedAt) },
    data: {
      status,
      response: response || null,
      respondedAt: response ? new Date() : null,
    },
  })
  if (!result.count) {
    throw new SupportTicketError('This support request changed. Reload before saving.', 409, 'STALE_TICKET')
  }
  return { success: true }
}
