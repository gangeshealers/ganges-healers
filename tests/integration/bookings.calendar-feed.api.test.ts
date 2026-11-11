import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/bookings/calendar/route'

let actor: string | null = null
jest.mock('@/lib/auth', () => ({ auth: async () => actor ? { user: { id: actor, role: 'USER' } } : null }))

const users: string[] = []
const created: Record<string, string> = {}
let healerUser = ''
let healerId = ''
let serviceId = ''
const later = (days: number) => new Date(Date.now() + days * 86400000)

beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    users.push((await prisma.user.create({ data: { email: 'calendar-owner-' + i + '-' + randomUUID() + '@example.test' } })).id)
  }
  healerUser = (await prisma.user.create({ data: { role: 'HEALER', email: 'calendar-healer-' + randomUUID() + '@example.test', name: 'Practitioner' } })).id
  healerId = (await prisma.healer.create({ data: { userId: healerUser, isActive: true, isVerified: true } })).id
  serviceId = (await prisma.service.create({ data: { name: 'Calendar Session', slug: 'calendar-session-' + randomUUID(), description: 'Private export fixture', category: 'Test', price: 100, duration: 60 } })).id
  const insert = async (name: string, userId: string, status: 'PENDING' | 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED' | 'COMPLETED', when: Date, room: string | null) => {
    created[name] = (await prisma.booking.create({ data: {
      userId, healerId, serviceId, status, scheduledAt: when, durationMin: 60, pricePaise: 10000, meetingLink: room,
    } })).id
  }
  await insert('confirmed', users[0], 'CONFIRMED', later(8), 'https://meet.example.test/confirmed-room')
  await insert('pending', users[0], 'PENDING', later(9), 'https://meet.example.test/secret-pending')
  await insert('unfunded', users[0], 'RESCHEDULED', later(10), 'https://meet.example.test/secret-unfunded')
  await insert('cancelled', users[0], 'CANCELLED', later(11), 'https://meet.example.test/cancelled')
  await insert('completed', users[0], 'COMPLETED', later(-1), 'https://meet.example.test/completed')
  await insert('past', users[0], 'CONFIRMED', later(-2), 'https://meet.example.test/past')
  await insert('foreign', users[1], 'CONFIRMED', later(12), 'https://meet.example.test/foreign-private')
})
beforeEach(() => { actor = users[0] })
afterAll(async () => {
  try {
    if (users.length || healerUser) await prisma.user.deleteMany({ where: { id: { in: [...users, healerUser].filter(Boolean) } } })
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  } finally { await prisma.$disconnect() }
})

test('exports only the authenticated member’s future live appointments, without unreleased rooms', async () => {
  const response = await GET()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('content-type')).toContain('text/calendar')
  expect(response.headers.get('content-disposition')).toContain('attachment')
  const content = await response.text()
  expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(3)
  for (const name of ['confirmed', 'pending', 'unfunded']) expect(content).toContain('UID:booking-' + created[name])
  for (const name of ['cancelled', 'completed', 'past', 'foreign']) expect(content).not.toContain(created[name])
  expect(content).toContain('URL:https://meet.example.test/confirmed-room')
  expect(content).not.toMatch(/secret-pending|secret-unfunded|foreign-private|cancelled|completed/)
  expect(content.match(/STATUS:TENTATIVE/g)).toHaveLength(2)
  expect(content.match(/STATUS:CONFIRMED/g)).toHaveLength(1)
})

test('switching to a different owner never reveals the previous account’s calendar', async () => {
  actor = users[1]
  const content = await (await GET()).text()
  expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  expect(content).toContain('UID:booking-' + created.foreign)
  expect(content).not.toContain(created.confirmed)
  expect(content).not.toContain('confirmed-room')
})

test('returns 401 instead of any calendar when the session is gone', async () => {
  actor = null
  const response = await GET()
  expect(response.status).toBe(401)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect((await response.json()).error).toContain('Sign in')
})
