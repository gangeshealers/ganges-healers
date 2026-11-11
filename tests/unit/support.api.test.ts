import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { createMemberSupportTicket, SupportTicketError } from '@/lib/support/tickets'
import { POST } from '@/app/api/support/tickets/route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/support/tickets', () => ({
  createMemberSupportTicket: jest.fn(),
  SupportTicketError: class SupportTicketError extends Error {
    constructor(message: string, public status: number, public code: string) {
      super(message)
    }
  },
}))

const valid = { subject: 'Booking question', message: 'Please help me review my appointment information.' }
const url = 'http://localhost:3000/api/support/tickets'
function req(body: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...headers },
    body,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'owner-123' } })
  ;(createMemberSupportTicket as jest.Mock).mockResolvedValue({ id: 'ticket-123', status: 'OPEN' })
})

test('guests cannot submit support requests', async () => {
  ;(auth as jest.Mock).mockResolvedValueOnce(null)
  const res = await POST(req(JSON.stringify(valid)))
  expect(res.status).toBe(401)
  expect(createMemberSupportTicket).not.toHaveBeenCalled()
  expect(res.headers.get('cache-control')).toBe('no-store')
})

test('rejects foreign origins and unsupported content before persisting anything', async () => {
  const cross = await POST(req(JSON.stringify(valid), { origin: 'https://untrusted.example' }))
  expect(cross.status).toBe(403)
  const wrongType = await POST(req(JSON.stringify(valid), { 'content-type': 'text/plain' }))
  expect(wrongType.status).toBe(415)
  expect(createMemberSupportTicket).not.toHaveBeenCalled()
})

test('rejects malformed or oversized JSON without writing', async () => {
  expect((await POST(req('not-json'))).status).toBe(400)
  expect((await POST(req('x'.repeat(8001)))).status).toBe(413)
  expect(createMemberSupportTicket).not.toHaveBeenCalled()
})

test('authenticated member gets only a private ticket reference', async () => {
  const res = await POST(req(JSON.stringify(valid)))
  expect(res.status).toBe(201)
  expect(await res.json()).toEqual({ id: 'ticket-123', status: 'OPEN' })
  expect(createMemberSupportTicket).toHaveBeenCalledWith('owner-123', valid)
  expect(res.headers.get('cache-control')).toBe('no-store')
})

test('persistent submission limit produces a clear 429', async () => {
  ;(createMemberSupportTicket as jest.Mock).mockRejectedValueOnce(
    new SupportTicketError('Daily limit reached.', 429, 'RATE_LIMITED'),
  )
  const res = await POST(req(JSON.stringify(valid)))
  expect(res.status).toBe(429)
  expect(await res.json()).toEqual({ error: 'Daily limit reached.', code: 'RATE_LIMITED' })
})
