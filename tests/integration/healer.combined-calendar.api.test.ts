import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/healer/calendar/route'

let mockUserId = ''
let mockRole: 'HEALER' | 'USER' = 'HEALER'
jest.mock('@/lib/auth', () => ({
  auth: async () => mockUserId ? { user: { id: mockUserId, role: mockRole } } : null,
}))

const users: string[] = []
let healerOne = ''
let healerTwo = ''
let serviceId = ''
let programId = ''
const later = (days: number) => new Date(Date.now() + days * 86400000)

beforeAll(async () => {
  const make = async (role: 'HEALER' | 'USER', name: string) => {
    const user = await prisma.user.create({
      data: { role, name, email: 'practitioner-calendar-' + randomUUID() + '@example.test' },
    })
    users.push(user.id)
    return user.id
  }
  const first = await make('HEALER', 'First Practitioner')
  const second = await make('HEALER', 'Second Practitioner')
  const member = await make('USER', 'Private Customer Identity')
  healerOne = (await prisma.healer.create({ data: { userId: first, isActive: true } })).id
  healerTwo = (await prisma.healer.create({ data: { userId: second, isActive: true } })).id
  serviceId = (await prisma.service.create({ data: {
    name: 'Personal Meditation', description: 'Private test fixture', category: 'test',
    slug: 'healer-calendar-' + randomUUID(), price: 100, duration: 60,
  } })).id
  const book = async (healerId: string, status: 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED', days: number, meeting: string | null) =>
    prisma.booking.create({ data: {
      userId: member, healerId, serviceId, status, scheduledAt: later(days),
      durationMin: 60, pricePaise: 10000, meetingLink: meeting,
    } })
  await book(healerOne, 'CONFIRMED', 7, 'https://meet.example.test/my-appointment')
  await book(healerOne, 'RESCHEDULED', 8, 'https://meet.example.test/unpaid-room')
  await book(healerOne, 'CANCELLED', 9, 'https://meet.example.test/cancelled')
  await book(healerOne, 'CONFIRMED', -2, 'https://meet.example.test/past')
  await book(healerTwo, 'CONFIRMED', 10, 'https://meet.example.test/foreign')
  programId = (await prisma.program.create({ data: {
    title: 'Meditation Program', slug: 'calendar-program-' + randomUUID(),
    description: 'Private fixture', pricePaise: 25000, totalSessions: 2, sessionsPerWeek: 1, durationMinutes: 60,
  } })).id
  const active = await prisma.programEnrollment.create({
    data: { userId: member, programId, healerId: healerOne, status: 'active' },
  })
  await prisma.programSession.create({
    data: { enrollmentId: active.id, healerId: healerOne, sessionNumber: 1,
      scheduledAt: later(6), durationMin: 60, meetingLink: 'https://meet.example.test/program' },
  })
  const paused = await prisma.programEnrollment.create({
    data: { userId: first, programId, healerId: healerOne, status: 'paused' },
  })
  await prisma.programSession.create({
    data: { enrollmentId: paused.id, healerId: healerOne, sessionNumber: 1,
      scheduledAt: later(12), durationMin: 60, meetingLink: 'https://meet.example.test/paused' },
  })
})
beforeEach(() => { mockUserId = users[0]; mockRole = 'HEALER' })
afterAll(async () => {
  try {
    if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } })
    if (programId) await prisma.program.delete({ where: { id: programId } })
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  } finally { await prisma.$disconnect() }
})

test('requires a current practitioner identity and never returns a calendar when signed out', async () => {
  mockUserId = ''
  expect((await GET()).status).toBe(401)
  mockUserId = users[2]; mockRole = 'USER'
  expect((await GET()).status).toBe(403)
})

test('owner sees future confirmed sessions and active program reservations without client PII', async () => {
  const response = await GET()
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/calendar')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('content-disposition')).toContain('attachment')
  const text = await response.text()
  expect(text.split('\r\n').filter(line => line === 'BEGIN:VEVENT')).toHaveLength(2)
  expect(text).toContain('Personal Meditation')
  expect(text).toContain('Meditation Program')
  expect(text).toContain('URL:https://meet.example.test/my-appointment')
  expect(text).toContain('URL:https://meet.example.test/program')
  expect(text).not.toMatch(/unpaid-room|cancelled|past|foreign|paused/)
  expect(text).not.toContain('Private Customer Identity')
  expect(text).not.toContain('practitioner-calendar-')
  expect(text.split('\r\n').filter(line => line.startsWith('DTSTART:'))).toHaveLength(2)
})

test('another healer receives only their own appointments, never those belonging to first practitioner', async () => {
  mockUserId = users[1]
  const response = await GET()
  expect(response.status).toBe(200)
  const text = await response.text()
  expect(text.split('\r\n').filter(line => line === 'BEGIN:VEVENT')).toHaveLength(1)
  expect(text).toContain('URL:https://meet.example.test/foreign')
  expect(text).not.toContain('my-appointment')
  expect(text).not.toContain('program')
})
