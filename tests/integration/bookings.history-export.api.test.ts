import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET as exportHistory } from '@/app/api/bookings/history/export/route'

let mockActor: string | null = null
jest.mock('@/lib/auth', () => ({
  auth: async () => mockActor ? { user: { id: mockActor, role: 'USER' } } : null,
}))

const users: string[] = []
let healerUser = ''
let serviceId = ''
const now = () => Date.now()
const request = (query = '') => new NextRequest('http://localhost/api/bookings/history/export' + query)

beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    const user = await prisma.user.create({ data: {
      email: 'history-owner-' + i + '-' + randomUUID() + '@example.test',
    } })
    users.push(user.id)
  }
  healerUser = (await prisma.user.create({ data: {
    email: 'history-healer-' + randomUUID() + '@example.test', role: 'HEALER', name: 'Calm Practitioner',
  } })).id
  const healer = await prisma.healer.create({ data: { userId: healerUser, isActive: true, isVerified: true } })
  serviceId = (await prisma.service.create({ data: {
    name: 'Archived Calm Session', description: 'History ownership fixture',
    slug: 'history-fixture-' + randomUUID(), category: 'test', price: 150, duration: 60,
  } })).id
  const create = (owner: string, status: 'COMPLETED' | 'CANCELLED' | 'CONFIRMED', days: number) =>
    prisma.booking.create({ data: {
      userId: owner, healerId: healer.id, serviceId,
      status, pricePaise: 15000, durationMin: 60, scheduledAt: new Date(now() + days * 86400000),
    } })
  await create(users[0], 'COMPLETED', -3)
  await create(users[0], 'CANCELLED', 9)
  await create(users[0], 'CONFIRMED', -10)
  await create(users[0], 'CONFIRMED', 7)
  await create(users[1], 'COMPLETED', -7)
})
beforeEach(() => { mockActor = users[0] })
afterAll(async () => {
  try {
    if (users.length || healerUser) await prisma.user.deleteMany({
      where: { id: { in: [...users, healerUser].filter(Boolean) } },
    })
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  } finally { await prisma.$disconnect() }
})

test('requires an authenticated customer before any export', async () => {
  mockActor = null
  const response = await exportHistory(request())
  expect(response.status).toBe(401)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})

test('exports only the signed-in account’s past or terminal bookings, excluding live future bookings', async () => {
  const response = await exportHistory(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/csv')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  const csv = await response.text()
  expect(csv.match(/"Archived Calm Session"/g)).toHaveLength(3)
  expect(csv).toContain('"COMPLETED"')
  expect(csv).toContain('"CANCELLED"')
  expect(csv).toContain('"CONFIRMED"') // historical start date even if status was not finalized
  expect(csv).not.toMatch(/email|private customer|meeting link/i)
  mockActor = users[1]
  const other = await exportHistory(request())
  expect(other.status).toBe(200)
  expect((await other.text()).match(/"Archived Calm Session"/g)).toHaveLength(1)
})

test('exact status filtering never leaks other accounts or silently widens the result', async () => {
  const result = await exportHistory(request('?status=cancelled&q=Calm'))
  expect(result.status).toBe(200)
  const csv = await result.text()
  expect(csv.match(/"Archived Calm Session"/g)).toHaveLength(1)
  expect(csv).toContain('"CANCELLED"')
  expect(csv).not.toContain('"COMPLETED"')
  for (const query of ['?status=anything', '?status=all&status=cancelled', '?q=a&q=b', '?q=' + 'x'.repeat(81)]) {
    const response = await exportHistory(request(query))
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  }
})
