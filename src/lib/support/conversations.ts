import { z } from 'zod'
import type { Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import { isSupportConversationEnabled } from './availability'
import { SupportTicketError } from './tickets'

export type SupportScope = 'member' | 'staff'
export const supportStatusLabels = {
  OPEN: 'Received',
  IN_PROGRESS: 'In review',
  RESOLVED: 'Resolved',
} as const
const PAGE_SIZE = 30
const ticketIdSchema = z.string().min(8).max(80)
const replyInput = z
  .object({
    message: z.string().trim().max(3000),
    requestId: z.string().uuid(),
    updatedAt: z.string().datetime({ offset: true }),
    expectedAccountId: z.string().min(1).max(80),
    scope: z.enum(['member', 'staff']),
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.scope === 'member' && (!value.message || value.status !== undefined)) ||
      (value.scope === 'staff' && !value.status)
    ) {
      ctx.addIssue({ code: 'custom', message: 'Review your message and status.' })
    }
  })

function enabled() {
  if (!isSupportConversationEnabled())
    throw new SupportTicketError('Support conversations are not available yet.', 503, 'NOT_ENABLED')
}

/** Owner-scoped detail and bounded, newest-page-first history. No read marks messages as seen. */
export async function readSupportConversation(
  userId: string,
  id: string,
  scope: SupportScope,
  requestedPage: unknown = '1',
) {
  enabled()
  if (!userId) throw new SupportTicketError('Sign in to contact support.', 401, 'UNAUTHORIZED')
  if (!ticketIdSchema.safeParse(id).success)
    throw new SupportTicketError('Support request not found.', 404, 'NOT_FOUND')
  return prisma.$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, closedAt: true },
      })
      if (!actor || actor.closedAt)
        throw new SupportTicketError('Sign in again to contact support.', 401, 'UNAUTHORIZED')
      if (scope === 'staff' && actor.role !== 'ADMIN')
        throw new SupportTicketError('Staff access is required.', 403, 'FORBIDDEN')
      const ticket = await tx.supportTicket.findFirst({
        where: { id, ...(scope === 'member' ? { userId } : {}) },
        select: {
          id: true,
          subject: true,
          message: true,
          status: true,
          response: true,
          respondedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      })
      if (!ticket) throw new SupportTicketError('Support request not found.', 404, 'NOT_FOUND')
      const total = await tx.supportMessage.count({ where: { ticketId: id } })
      const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
      const rawPage =
        typeof requestedPage === 'string' && /^[1-9][0-9]{0,9}$/.test(requestedPage)
          ? Number(requestedPage)
          : 1
      const page = Math.min(rawPage, lastPage)
      const [messages, latestStaff] = await Promise.all([
        tx.supportMessage.findMany({
          where: { ticketId: id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: { id: true, body: true, authorRole: true, statusAfter: true, createdAt: true },
        }),
        // A response saved by an older app during rollout remains visible before its first threaded reply.
        tx.supportMessage.findFirst({
          where: { ticketId: id, authorRole: 'STAFF', body: { not: '' } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { body: true },
        }),
      ])
      return {
        ticket,
        messages: messages.reverse(),
        page,
        lastPage,
        legacyResponse: ticket.response && ticket.response !== latestStaff?.body ? ticket.response : null,
      }
    },
    { isolationLevel: 'RepeatableRead' },
  )
}

/** Append a reply, status and notification atomically; retries reuse the same request ID. */
export async function replyToSupportConversation(userId: string, ticketId: string, input: unknown) {
  enabled()
  if (!userId) throw new SupportTicketError('Sign in to contact support.', 401, 'UNAUTHORIZED')
  const parsed = replyInput.safeParse(input)
  if (!parsed.success || !ticketIdSchema.safeParse(ticketId).success)
    throw new SupportTicketError(
      'Enter a message of up to 3000 characters and review the request.',
      400,
      'INVALID_INPUT',
    )
  const { message, requestId, updatedAt, scope, status } = parsed.data
  if (parsed.data.expectedAccountId !== userId)
    throw new SupportTicketError('Your account changed. Reload this conversation.', 409, 'ACCOUNT_CHANGED')
  return prisma.$transaction(
    async (tx) => {
      await lockTransaction(tx, 'account', userId)
      const [actor] = await tx.$queryRaw<
        Array<{ id: string; role: Role; closedAt: Date | null }>
      >`SELECT "id", "role", "closedAt" FROM "User" WHERE "id" = ${userId} FOR SHARE`
      if (!actor || actor.closedAt)
        throw new SupportTicketError('Sign in again to contact support.', 401, 'UNAUTHORIZED')
      if (scope === 'staff' && actor.role !== 'ADMIN')
        throw new SupportTicketError('Staff access is required.', 403, 'FORBIDDEN')
      // Lock before rereading the revision, including concurrent member/staff replies.
      const rows =
        scope === 'member'
          ? await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT "id" FROM "SupportTicket" WHERE "id" = ${ticketId} AND "userId" = ${userId} FOR UPDATE`
          : await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT "id" FROM "SupportTicket" WHERE "id" = ${ticketId} FOR UPDATE`
      if (!rows.length) throw new SupportTicketError('Support request not found.', 404, 'NOT_FOUND')
      const ticket = await tx.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })
      const nextStatus = scope === 'staff' ? status! : ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status
      const authorRole = scope === 'member' ? 'MEMBER' : 'STAFF'
      const previousAttempt = await tx.supportMessage.findUnique({
        where: { ticketId_requestId: { ticketId, requestId } },
      })
      if (previousAttempt) {
        if (
          previousAttempt.authorId !== userId ||
          previousAttempt.authorRole !== authorRole ||
          previousAttempt.body !== message ||
          (scope === 'staff' && previousAttempt.statusAfter !== nextStatus)
        ) {
          throw new SupportTicketError(
            'This send attempt belongs to a different reply. Reload the conversation.',
            409,
            'REQUEST_CONFLICT',
          )
        }
        return { success: true, id: ticketId, messageId: previousAttempt.id, requestId, replayed: true }
      }
      if (ticket.updatedAt.toISOString() !== new Date(updatedAt).toISOString())
        throw new SupportTicketError(
          'This conversation changed. Review the latest messages before sending.',
          409,
          'STALE_TICKET',
        )
      if (!message && nextStatus === ticket.status)
        throw new SupportTicketError('Write a reply or change the request status.', 400, 'INVALID_INPUT')
      if (ticket.response) {
        const latest = await tx.supportMessage.findFirst({
          where: { ticketId, authorRole: 'STAFF', body: { not: '' } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { body: true },
        })
        if (latest?.body !== ticket.response)
          await tx.supportMessage.create({
            data: {
              ticketId,
              authorRole: 'STAFF',
              body: ticket.response,
              requestId: `legacy:${ticket.updatedAt.toISOString()}`,
              statusAfter: ticket.status,
              createdAt: ticket.respondedAt ?? ticket.createdAt,
            },
          })
      }
      const now = new Date(Math.max(Date.now(), ticket.updatedAt.getTime() + 1))
      const reply = await tx.supportMessage.create({
        data: {
          ticketId,
          authorId: userId,
          authorRole,
          body: message,
          requestId,
          statusAfter: nextStatus,
          createdAt: now,
        },
        select: { id: true },
      })
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: nextStatus,
          updatedAt: now,
          ...(scope === 'staff' && message ? { response: message, respondedAt: now } : {}),
        },
      })
      if (scope === 'staff' && message)
        await tx.notification.create({
          data: {
            userId: ticket.userId,
            type: 'support_reply',
            title: 'Your support request has a reply',
            message:
              'A member of the Ganges Healers team responded. Open your Support Center to read the response.',
          },
        })
      await tx.activityLog.create({
        data: {
          userId,
          action: 'support.reply',
          entityType: 'SupportTicket',
          entityId: ticketId,
          metadata: { messageId: reply.id, authorRole, previousStatus: ticket.status, status: nextStatus },
        },
      })
      return { success: true, id: ticketId, messageId: reply.id, requestId, replayed: false }
    },
    { maxWait: 5000, timeout: 15000 },
  )
}
