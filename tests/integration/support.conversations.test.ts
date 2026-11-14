import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { readSupportConversation, replyToSupportConversation } from '@/lib/support/conversations'

const ids: string[] = []
const originalFlags = [process.env.SUPPORT_DESK_ENABLED, process.env.SUPPORT_CONVERSATIONS_ENABLED]
let owner: string, staff: string, outsider: string
beforeAll(async () => {
  process.env.SUPPORT_DESK_ENABLED = process.env.SUPPORT_CONVERSATIONS_ENABLED = 'true'
  for (const role of ['USER', 'ADMIN', 'USER'] as const) {
    const user = await prisma.user.create({ data: { role, email: randomUUID() + '@example.test' } })
    ids.push(user.id)
  }
  ;[owner, staff, outsider] = ids
})
afterAll(async () => {
  for (const [index, key] of ['SUPPORT_DESK_ENABLED', 'SUPPORT_CONVERSATIONS_ENABLED'].entries()) {
    const previous = originalFlags[index]
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  }
  await prisma.activityLog.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
})

const fixture = () =>
  prisma.supportTicket.create({
    data: {
      userId: owner,
      subject: 'Booking question',
      message: 'Please help with my next appointment.',
      response: 'Earlier team response',
      status: 'IN_PROGRESS',
      respondedAt: new Date(),
    },
  })
const payload = (account: string, updatedAt: Date) => ({
  expectedAccountId: account,
  requestId: randomUUID(),
  updatedAt: updatedAt.toISOString(),
  scope: account === staff ? 'staff' : 'member',
  message: 'Can you confirm the appointment day?',
})

test('concurrent sends preserve the legacy response and save one message, one notice and one audit per staff reply', async () => {
  const ticket = await fixture()
  const member = payload(owner, ticket.updatedAt)
  const both = await Promise.all([
    replyToSupportConversation(owner, ticket.id, member),
    replyToSupportConversation(owner, ticket.id, member),
  ])
  expect(both[0].messageId).toBe(both[1].messageId)
  const thread = await readSupportConversation(owner, ticket.id, 'member')
  expect(thread.messages.map((m) => m.body)).toEqual(['Earlier team response', member.message])
  expect(thread.ticket.status).toBe('IN_PROGRESS')
  const answer = {
    ...payload(staff, thread.ticket.updatedAt),
    message: 'Your appointment is on Friday.',
    status: 'RESOLVED',
  }
  await replyToSupportConversation(staff, ticket.id, answer)
  await replyToSupportConversation(staff, ticket.id, answer)
  expect(await prisma.notification.count({ where: { userId: owner, type: 'support_reply' } })).toBe(1)
  expect(await prisma.activityLog.count({ where: { entityId: ticket.id, action: 'support.reply' } })).toBe(2)
  await expect(
    replyToSupportConversation(owner, ticket.id, { ...member, requestId: randomUUID() }),
  ).rejects.toMatchObject({ code: 'STALE_TICKET' })
  const resolved = await readSupportConversation(staff, ticket.id, 'staff')
  await replyToSupportConversation(owner, ticket.id, payload(owner, resolved.ticket.updatedAt))
  expect((await readSupportConversation(owner, ticket.id, 'member')).ticket.status).toBe('OPEN')
  await expect(
    replyToSupportConversation(staff, ticket.id, { ...answer, message: 'Different reply' }),
  ).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' })
})
test('a member sees only owned tickets and cannot reply using a staff role or a stale account', async () => {
  const ticket = await fixture()
  await expect(readSupportConversation(outsider, ticket.id, 'member')).rejects.toMatchObject({ status: 404 })
  await expect(
    replyToSupportConversation(outsider, ticket.id, payload(outsider, ticket.updatedAt)),
  ).rejects.toMatchObject({ status: 404 })
  await expect(
    replyToSupportConversation(owner, ticket.id, {
      ...payload(owner, ticket.updatedAt),
      scope: 'staff',
      status: 'RESOLVED',
    }),
  ).rejects.toMatchObject({ status: 403 })
  await expect(
    replyToSupportConversation(owner, ticket.id, {
      ...payload(owner, ticket.updatedAt),
      expectedAccountId: outsider,
    }),
  ).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
  expect(await prisma.supportMessage.count({ where: { ticketId: ticket.id } })).toBe(0)
})
