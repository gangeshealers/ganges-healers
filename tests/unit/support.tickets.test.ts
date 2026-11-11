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
  },
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
  ;(prisma.supportTicket.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 })
  await expect(updateAdminSupportTicket({
    id: 'ticket-abc123', updatedAt: '2026-11-11T03:00:00.000Z',
    status: 'RESOLVED', response: '  Your booking is confirmed.  ',
  })).resolves.toEqual({ success: true })
  expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({
    where: { id: 'ticket-abc123', updatedAt: new Date('2026-11-11T03:00:00.000Z') },
    data: { status: 'RESOLVED', response: 'Your booking is confirmed.', respondedAt: expect.any(Date) },
  })
})

test('a stale admin form cannot silently overwrite a newer response', async () => {
  ;(prisma.supportTicket.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 })
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
  expect(prisma.supportTicket.updateMany).not.toHaveBeenCalled()
})
