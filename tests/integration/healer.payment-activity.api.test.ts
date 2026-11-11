import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET as exportPayments } from '@/app/api/healer/earnings/export/route'

let mockActor = ''
let mockRole: 'USER' | 'HEALER' | 'ADMIN' = 'HEALER'
jest.mock('@/lib/auth', () => ({
  auth: async () => mockActor ? { user: { id: mockActor, role: mockRole } } : null,
}))

const users: string[] = []
let firstHealer = ''
let secondHealer = ''
let serviceId = ''
const request = (suffix = '') => new NextRequest('http://localhost/api/healer/earnings/export' + suffix)

beforeAll(async () => {
  const makeUser = async (role: 'USER' | 'HEALER') =>
    (await prisma.user.create({ data: { role, email: 'healer-activity-' + randomUUID() + '@example.test' } })).id
  const first = await makeUser('HEALER')
  const second = await makeUser('HEALER')
  const customer = await makeUser('USER')
  users.push(first, second, customer)
  firstHealer = (await prisma.healer.create({ data: { userId: first } })).id
  secondHealer = (await prisma.healer.create({ data: { userId: second } })).id
  serviceId = (await prisma.service.create({ data: {
    name: 'Private Session', description: 'Isolated gross payment fixture',
    slug: 'healer-activity-' + randomUUID(), category: 'test', price: 250, duration: 60,
  } })).id
  const makeBooking = async (healerId: string, status: 'SUCCESS' | 'REFUNDED', amountPaise = 25000) => {
    const booking = await prisma.booking.create({ data: {
      userId: customer, healerId, serviceId, scheduledAt: new Date(Date.now() + 86400000),
      durationMin: 60, pricePaise: amountPaise, status: 'CONFIRMED',
    } })
    return prisma.payment.create({ data: {
      userId: customer, bookingId: booking.id,
      gateway: 'test', status: status === 'SUCCESS' ? 'success' : 'refunded',
      amountPaise, currency: 'INR', type: 'SESSION', statusEnum: status,
    } })
  }
  await makeBooking(firstHealer, 'SUCCESS')
  await makeBooking(firstHealer, 'REFUNDED')
  await makeBooking(secondHealer, 'SUCCESS', 99000)
})
beforeEach(() => { mockActor = users[0]; mockRole = 'HEALER' })
afterAll(async () => {
  try {
    if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } })
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  } finally { await prisma.$disconnect() }
})

test('auth and role checks run before any payment export', async () => {
  mockActor = ''
  expect((await exportPayments(request())).status).toBe(401)
  mockActor = users[2]; mockRole = 'USER'
  expect((await exportPayments(request())).status).toBe(403)
})

test('CSV exports only the logged-in healer’s captured INR sessions, not foreign or refunded payment activity', async () => {
  const res = await exportPayments(request('?period=all'))
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect(res.headers.get('content-type')).toContain('text/csv')
  const csv = await res.text()
  expect(csv).toContain('"Private Session"')
  expect(csv).toContain('"250.00"')
  expect(csv).not.toContain('"990.00"')
  expect(csv).not.toContain('"250.00"\r\n"250.00"')
  expect(csv.match(/Private Session/g)).toHaveLength(1)
  mockActor = users[1]
  const other = await exportPayments(request('?period=all'))
  expect(other.status).toBe(200)
  expect(await other.text()).toContain('"990.00"')
})

test('unsupported and repeated periods are rejected with private cache headers', async () => {
  for (const suffix of ['?period=last-century', '?period=all&period=month']) {
    const res = await exportPayments(request(suffix))
    expect(res.status).toBe(400)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  }
})
