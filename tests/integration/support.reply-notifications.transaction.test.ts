import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { updateAdminSupportTicket } from '@/lib/support/tickets'

const owners: string[] = []
const tickets: string[] = []

beforeAll(async () => {
  for (const [index, name] of ['Member One', 'Member Two'].entries()) {
    const user = await prisma.user.create({
      data: { email: 'support-reply-' + index + '-' + randomUUID() + '@example.test', name },
    })
    owners.push(user.id)
    const ticket = await prisma.supportTicket.create({
      data: { userId: user.id, subject: 'Help with account', message: 'I need help understanding this saved request.' },
    })
    tickets.push(ticket.id)
  }
})

afterAll(async () => {
  try {
    if (owners.length) await prisma.user.deleteMany({ where: { id: { in: owners } } })
  } finally { await prisma.$disconnect() }
})

const update = async (index: number, response: string, status: 'IN_PROGRESS' | 'RESOLVED' = 'IN_PROGRESS') => {
  const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: tickets[index] } })
  return updateAdminSupportTicket({
    id: ticket.id,
    updatedAt: ticket.updatedAt.toISOString(),
    status,
    response,
  })
}

test('a staff response creates a private notification for only the owning account', async () => {
  const text = 'Private account response for Member One.'
  await expect(update(0, text)).resolves.toEqual({ success: true })
  const saved = await prisma.supportTicket.findUniqueOrThrow({ where: { id: tickets[0] } })
  expect(saved).toMatchObject({ response: text, status: 'IN_PROGRESS' })
  const ownerRows = await prisma.notification.findMany({ where: { userId: owners[0], type: 'support_reply' } })
  const foreignRows = await prisma.notification.findMany({ where: { userId: owners[1], type: 'support_reply' } })
  expect(ownerRows).toHaveLength(1)
  expect(foreignRows).toHaveLength(0)
  expect(ownerRows[0]).toMatchObject({ read: false, title: 'Your support request has a reply' })
  expect(JSON.stringify(ownerRows)).not.toContain(text)
})

test('status-only edits, unchanged replies and stale edits do not duplicate alerts', async () => {
  await update(0, 'Private account response for Member One.', 'RESOLVED')
  await update(1, '', 'IN_PROGRESS')
  expect(await prisma.notification.count({ where: { userId: owners[0], type: 'support_reply' } })).toBe(1)
  expect(await prisma.notification.count({ where: { userId: owners[1], type: 'support_reply' } })).toBe(0)
  const old = await prisma.supportTicket.findUniqueOrThrow({ where: { id: tickets[0] } })
  await update(0, 'The updated private response.', 'RESOLVED')
  await expect(updateAdminSupportTicket({
    id: old.id, updatedAt: old.updatedAt.toISOString(), status: 'RESOLVED', response: 'Stale competing reply',
  })).rejects.toMatchObject({ status: 409, code: 'STALE_TICKET' })
  expect(await prisma.notification.count({ where: { userId: owners[0], type: 'support_reply' } })).toBe(2)
  expect(await prisma.supportTicket.findUniqueOrThrow({ where: { id: tickets[0] } })).toMatchObject({ response: 'The updated private response.' })
})
