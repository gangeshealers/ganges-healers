import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/healer/bookings/history/export/route'

let mockActor: string | null = null
let mockRole: 'USER' | 'HEALER' = 'HEALER'
jest.mock('@/lib/auth', () => ({
  auth: async () => mockActor ? { user: { id: mockActor, role: mockRole } } : null,
}))
const users: string[] = []
let healerOne = ''
let healerTwo = ''
let serviceId = ''
const request = (query = '') => new NextRequest('http://localhost/api/healer/bookings/history/export' + query)

beforeAll(async () => {
  const makeUser = async (role: 'USER' | 'HEALER') => {
    const u = await prisma.user.create({ data: { role, email: 'healer-history-' + randomUUID() + '@example.test' } })
    users.push(u.id)
    return u.id
  }
  const first = await makeUser('HEALER')
  const second = await makeUser('HEALER')
  const member = await makeUser('USER')
  healerOne = (await prisma.healer.create({ data: { userId: first, isActive: true } })).id
  healerTwo = (await prisma.healer.create({ data: { userId: second, isActive: true } })).id
  serviceId = (await prisma.service.create({ data: {
    slug: 'healer-history-' + randomUUID(), name: 'Mindful Breathwork',
    description: 'Private fixture', category: 'test', price: 150, duration: 60,
  } })).id
  const write = async (healerId: string, status: 'COMPLETED' | 'CANCELLED' | 'CONFIRMED', days: number) => {
    await prisma.booking.create({ data: {
      userId: member, healerId, serviceId, status,
      scheduledAt: new Date(Date.now() + days * 86400000), durationMin: 60, pricePaise: 15000,
    } })
  }
  await write(healerOne, 'COMPLETED', -4)
  await write(healerOne, 'CANCELLED', 2)
  await write(healerOne, 'CONFIRMED', -12)
  await write(healerOne, 'CONFIRMED', 6)
  await write(healerTwo, 'COMPLETED', -5)
})
beforeEach(() => { mockActor = users[0]; mockRole = 'HEALER' })
afterAll(async () => {
  try {
    if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } })
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  } finally { await prisma.$disconnect() }
})

test('requires the real practitioner role before showing a private historical export', async () => {
  mockActor = null
  const response = await GET(request())
  expect(response.status).toBe(401)
  mockActor = users[2]; mockRole = 'USER'
  expect((await GET(request())).status).toBe(403)
})

test('exports only signed-in healer’s historical or terminal sessions with no member contacts', async () => {
  const res = await GET(request())
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect(res.headers.get('content-type')).toContain('text/csv')
  const csv = await res.text()
  expect(csv.match(/"Mindful Breathwork"/g)).toHaveLength(3)
  expect(csv).toContain('"COMPLETED"')
  expect(csv).toContain('"CANCELLED"')
  expect(csv).toContain('"CONFIRMED"') // historical scheduled start still belongs to the archive
  expect(csv).not.toMatch(/healer-history-|@example|meeting|member email/i)
  mockActor = users[1]
  const other = await GET(request())
  expect(other.status).toBe(200)
  expect((await other.text()).match(/"Mindful Breathwork"/g)).toHaveLength(1)
})

test('invalid status and duplicate filters do not widen export scope', async () => {
  for (const q of ['?status=bad', '?status=all&status=cancelled', '?q=a&q=b', '?q=' + 'a'.repeat(81)]) {
    const response = await GET(request(q))
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  }
  const filtered = await GET(request('?status=cancelled&q=breath'))
  expect(filtered.status).toBe(200)
  const csv = await filtered.text()
  expect(csv.match(/"Mindful Breathwork"/g)).toHaveLength(1)
  expect(csv).toContain('"CANCELLED"')
  expect(csv).not.toContain('"COMPLETED"')
})
