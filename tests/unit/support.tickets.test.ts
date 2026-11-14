import { prisma } from '@/lib/prisma'
import { createMemberSupportTicket, SupportTicketError, updateAdminSupportTicket } from '@/lib/support/tickets'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    supportTicket: { updateMany: jest.fn() },
  },
}))

const tx = {
  $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
  supportTicket: {
    count: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  notification: { create: jest.fn() },
}
const valid = {
  subject: 'Help with booking',
  message: 'I cannot access my appointment confirmation and need assistance.',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.$transaction as jest.Mock).mockImplementation((work: (client: typeof tx) => Promise<unknown>) => work(tx))
  tx.supportTicket.count.mockResolvedValue(0)
  tx.supportTicket.create.mockResolvedValue({ id: 'ticket-abc123', status: 'OPEN' })
  tx.supportTicket.findUnique.mockResolvedValue({ userId: 'member-123', response: null })
  tx.supportTicket.updateMany.mockResolvedValue({ count: 1 })
  tx.notification.create.mockResolvedValue({ id: 'notification-new' })
})

test('a member request is normalized, owner-scoped and created within a serialized limit check', async () => {
  const result = await createMemberSupportTicket('member-123', {
    subject: '  Help with booking  ',
    message: `  ${valid.message}  `,
  })
  expect(result).toEqual({ id: 'ticket-abc123', status: 'OPEN' })
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  expect(tx.supportTicket.count).toHaveBeenCalledWith({
    where: { userId: 'member-123', createdAt: { gte: expect.any(Date) } },
  })
  expect(tx.supportTicket.create).toHaveBeenCalledWith({
    data: { userId: 'member-123', ...valid },
    select: { id: true, status: true },
  })
  expect(prisma.$transaction).toHaveBeenCalledTimes(1)
})

test('malformed and unauthenticated requests are refused before database writes', async () => {
  await expect(createMemberSupportTicket('', valid)).rejects.toMatchObject({ status: 401 })
  await expect(createMemberSupportTicket('member-123', { subject: 'bad', message: 'short' })).rejects.toMatchObject({ status: 400 })
  await expect(createMemberSupportTicket('member-123', { ...valid, extraneous: 'not accepted' })).rejects.toMatchObject({ status: 400 })
  expect(prisma.$transaction).not.toHaveBeenCalled()
})

test('five submissions within a day is a persistent rate limit, not an in-memory counter', async () => {
  tx.supportTicket.count.mockResolvedValueOnce(5)
  await expect(createMemberSupportTicket('member-123', valid)).rejects.toMatchObject({
    status: 429, code: 'RATE_LIMITED',
  })
  expect(tx.supportTicket.create).not.toHaveBeenCalled()
})

test('admin reply is validated and optimistic-locks updates using the visible revision', async () => {
  await expect(updateAdminSupportTicket({
    id: 'ticket-abc123', updatedAt: '2026-11-11T03:00:00.000Z',
    status: 'RESOLVED', response: '  Your booking is confirmed.  ',
  })).resolves.toEqual({ success: true })
  expect(tx.supportTicket.updateMany).toHaveBeenCalledWith({
    where: { id: 'ticket-abc123', updatedAt: new Date('2026-11-11T03:00:00.000Z') },
    data: { status: 'RESOLVED', response: 'Your booking is confirmed.', respondedAt: expect.any(Date) },
  })
})

test('a new support reply creates exactly one private member notification with no reply content', async () => {
  await updateAdminSupportTicket({
    id: 'ticket-abc123', updatedAt: '2026-11-11T03:00:00.000Z',
    status: 'IN_PROGRESS', response: 'Your private order information is only in the Support Center.',
  })
  expect(tx.notification.create).toHaveBeenCalledTimes(1)
  expect(tx.notification.create).toHaveBeenCalledWith({
    data: {
      userId: 'member-123',
      type: 'support_reply',
      title: 'Your support request has a reply',
      message: 'A member of the Ganges Healers team responded. Open your Support Center to read the response.',
    },
  })
  expect(JSON.stringify(tx.notification.create.mock.calls)).not.toContain('private order information')
})

test('status-only edits, empty replies and unchanged responses do not create duplicate notifications', async () => {
  await updateAdminSupportTicket({ id: 'ticket-abc123', updatedAt: '2026-11-11T03:00:00.000Z', status: 'IN_PROGRESS', response: '' })
  tx.supportTicket.findUnique.mockResolvedValueOnce({ userId: 'member-123', response: 'Already answered' })
  await updateAdminSupportTicket({ id: 'ticket-abc123', updatedAt: '2026-11-11T03:00:00.000Z', status: 'RESOLVED', response: 'Already answered' })
  expect(tx.notification.create).not.toHaveBeenCalled()
})

test('a failed notification insertion prevents a reply from being reported as saved', async () => {
  tx.notification.create.mockRejectedValueOnce(new Error('notification insert failed'))
  await expect(updateAdminSupportTicket({ id: 'ticket-abc123', updatedAt: '2026-11-11T03:00:00.000Z', status: 'RESOLVED', response: 'A new answer' }))
    .rejects.toThrow('notification insert failed')
  expect(prisma.$transaction).toHaveBeenCalled()
})

test('a stale admin form cannot silently overwrite a newer response', async () => {
  tx.supportTicket.updateMany.mockResolvedValueOnce({ count: 0 })
  await expect(updateAdminSupportTicket({
    id: 'ticket-abc123', updatedAt: '2026-11-11T03:00:00.000Z',
    status: 'IN_PROGRESS', response: '',
  })).rejects.toMatchObject({ status: 409, code: 'STALE_TICKET' })
})

test('admin cannot set unsupported status or arbitrary response contents', async () => {
  for (const payload of [
    { id: 'ticket-abc123', updatedAt: 'invalid', status: 'OPEN', response: '' },
    { id: 'ticket-abc123', updatedAt: '2026-11-11T03:00:00.000Z', status: 'DELETED', response: '' },
    { id: 'ticket-abc123', updatedAt: '2026-11-11T03:00:00.000Z', status: 'RESOLVED', response: 'x'.repeat(3001) },
  ]) {
    await expect(updateAdminSupportTicket(payload)).rejects.toBeInstanceOf(SupportTicketError)
  }
  expect(tx.supportTicket.updateMany).not.toHaveBeenCalled()
})
