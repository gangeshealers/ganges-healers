import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'
import { makeNextRequest } from '../helpers/next-handler'
import { POST, GET as listBookings } from '@/app/api/bookings/route'
import { PUT, DELETE, GET as getBooking } from '@/app/api/bookings/[id]/route'
import { POST as confirmWithCredits } from '@/app/api/bookings/[id]/confirm-with-credits/route'
import { GET as getAvailability } from '@/app/api/availability/route'

jest.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: process.env.BOOKING_RACE_USER_ID, email: 'booking-race@example.test', name: 'Race Test' } }),
}))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))
jest.mock('@/lib/email/email.service', () => ({ emailService: { isEnabled: () => false } }))

let userId: string
let healerUserId: string
let healerId: string
let serviceId: string
let previousTestMode: string | undefined

function day(offset: number) {
  return clinicDate(new Date(Date.now() + (30 + offset) * 86400000))
}
function slot(offset: number, time: string) {
  return clinicSlotInstant(day(offset), time).toISOString()
}
function create(offset: number, time: string, expectedPricePaise?: number) {
  return POST(makeNextRequest('http://localhost/api/bookings', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ healerId, serviceId, scheduledAt: slot(offset, time), expectedPricePaise }),
  }))
}
function reschedule(id: string, offset: number, time: string, version?: string) {
  return PUT(makeNextRequest(`http://localhost/api/bookings/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', ...(version ? { 'if-match': `"${version}"` } : {}) },
    body: JSON.stringify({ scheduledAt: slot(offset, time) }),
  }), { params: Promise.resolve({ id }) })
}
async function created(offset: number, time: string) {
  const response = await create(offset, time)
  expect(response.status).toBe(201)
  return (await response.json()).data.id as string
}

beforeAll(async () => {
  previousTestMode = process.env.TEST_MODE
  delete process.env.TEST_MODE
  const user = await prisma.user.create({ data: { email: `booking-race-${randomUUID()}@example.test`, password: 'unused', role: 'USER' } })
  userId = user.id
  process.env.BOOKING_RACE_USER_ID = userId
  const healerUser = await prisma.user.create({ data: { email: `healer-race-${randomUUID()}@example.test`, password: 'unused', role: 'HEALER' } })
  healerUserId = healerUser.id
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const availability = Object.fromEntries(days.map(d => [d, { start: '09:00', end: '20:00' }]))
  healerId = (await prisma.healer.create({ data: { userId: healerUserId, availability, isVerified: true } })).id
  serviceId = (await prisma.service.create({ data: {
    slug: `booking-race-${randomUUID()}`, name: 'Race Test', description: 'Test', category: 'Test', price: 100, duration: 90,
  } })).id
})

afterAll(async () => {
  if (previousTestMode === undefined) delete process.env.TEST_MODE
  else process.env.TEST_MODE = previousTestMode
  delete process.env.BOOKING_RACE_USER_ID
  if (userId) await prisma.user.delete({ where: { id: userId } })
  if (healerUserId) await prisma.user.delete({ where: { id: healerUserId } })
  if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  await prisma.$disconnect()
})

test('concurrent overlapping creates yield exactly one reservation, including in test mode', async () => {
  process.env.TEST_MODE = '1'
  try {
    const responses = await Promise.all([create(1, '10:00'), create(1, '10:30')])
    expect(responses.map(r => r.status).sort((a, b) => a - b)).toEqual([201, 409])
    expect(await prisma.booking.count({ where: { healerId, scheduledAt: { gte: new Date(slot(1, '09:00')), lt: new Date(slot(1, '13:00')) } } })).toBe(1)
  } finally {
    delete process.env.TEST_MODE
  }
})

test('an unknown service keeps the existing booking conflict response', async () => {
  const response = await POST(makeNextRequest('http://localhost/api/bookings', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ healerId, serviceId: 'missing-service', scheduledAt: slot(1, '15:00') }),
  }))
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'Service not found or inactive' })
})

test('a changed price requires fresh confirmation before saving the appointment and requested email', async () => {
  const scheduledAt = new Date(slot(24, '11:00'))
  const where = { userId, healerId, serviceId, scheduledAt }
  const stale = await create(24, '11:00', 0)
  expect(stale.status).toBe(409)
  expect(await stale.json()).toMatchObject({ currentPricePaise: 10000 })
  expect(await prisma.booking.count({ where })).toBe(0)
  expect(await prisma.bookingEmail.count({ where: { booking: where } })).toBe(0)

  const accepted = await create(24, '11:00', 10000)
  expect(accepted.status).toBe(201)
  const { data } = await accepted.json()
  expect(data.pricePaise).toBe(10000)
  expect(await prisma.bookingEmail.count({ where: { bookingId: data.id, kind: 'REQUESTED' } })).toBe(1)
})

test('a creation and reschedule cannot reserve overlapping intervals concurrently', async () => {
  const id = await created(2, '10:00')
  const responses = await Promise.all([reschedule(id, 2, '13:00'), create(2, '13:30')])
  // Either request may acquire the lock first; each route has its own success status.
  expect([[200, 409], [409, 201]]).toContainEqual(responses.map(r => r.status))
  const bookings = await prisma.booking.findMany({ where: { healerId, scheduledAt: { gte: new Date(slot(2, '13:00')), lt: new Date(slot(2, '15:00')) } } })
  expect(bookings).toHaveLength(1)
})

test('two reschedules competing for a slot leave only one booking there', async () => {
  const first = await created(3, '10:00')
  const second = await created(3, '15:00')
  const responses = await Promise.all([reschedule(first, 3, '12:00'), reschedule(second, 3, '12:00')])
  expect(responses.map(r => r.status).sort((a, b) => a - b)).toEqual([200, 409])
  expect(await prisma.booking.count({ where: { healerId, scheduledAt: new Date(slot(3, '12:00')), status: 'RESCHEDULED' } })).toBe(1)
  expect((await create(3, '12:30')).status).toBe(409)
})

test('rescheduling excludes its own original interval and retains its booked duration', async () => {
  const id = await created(4, '10:00')
  await prisma.service.update({ where: { id: serviceId }, data: { duration: 30 } })
  try {
    expect((await reschedule(id, 4, '10:30')).status).toBe(200)
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id } })
    expect(booking.durationMin).toBe(90)
    expect((await create(4, '11:30')).status).toBe(409)
  } finally {
    await prisma.service.update({ where: { id: serviceId }, data: { duration: 90 } })
  }
})

test('a cancelled or completed booking cannot be revived by rescheduling', async () => {
  const id = await created(5, '10:00')
  for (const status of ['CANCELLED', 'COMPLETED'] as const) {
    await prisma.booking.update({ where: { id }, data: { status } })
    expect((await reschedule(id, 5, '12:00')).status).toBe(409)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe(status)
  }
})

test('concurrent credit confirmations spend only one credit for one booking', async () => {
  const id = await created(6, '10:00')
  await prisma.user.update({ where: { id: userId }, data: { vip: true, freeSessionCredits: 2 } })
  try {
    const confirm = () => confirmWithCredits(new Request('http://localhost/confirm', { method: 'POST' }), { params: Promise.resolve({ id }) })
    const responses = await Promise.all([confirm(), confirm()])
    expect(responses.map(r => r.status).sort((a, b) => a - b)).toEqual([200, 400])
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits).toBe(1)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('CONFIRMED')
    expect(await prisma.payment.count({ where: { bookingId: id } })).toBe(1)
  } finally {
    await prisma.user.update({ where: { id: userId }, data: { vip: false, freeSessionCredits: 0 } })
  }
})

test('owned rescheduling previews its original duration and does not expose another user’s booking', async () => {
  const id = await created(7, '10:00')
  await created(7, '12:00')
  const url = `http://localhost/api/availability?healerId=${healerId}&date=${day(7)}&bookingId=${id}`
  const response = await getAvailability(makeNextRequest(url))
  expect(response.status).toBe(200)
  const slots = (await response.json()).data.slots as Array<{ time: string; available: boolean }>
  expect(slots.find(s => s.time === '10:30')?.available).toBe(true) // excludes the owned booking
  expect(slots.find(s => s.time === '11:30')?.available).toBe(false) // overlaps the other booking
  process.env.BOOKING_RACE_USER_ID = 'someone-else'
  try {
    expect((await getAvailability(makeNextRequest(url))).status).toBe(404)
  } finally {
    process.env.BOOKING_RACE_USER_ID = userId
  }
})


async function current(id: string) {
  return getBooking(makeNextRequest(`http://localhost/api/bookings/${id}`), { params: Promise.resolve({ id }) })
}
function reviewedCancel(id: string, version: string) {
  return DELETE(makeNextRequest(`http://localhost/api/bookings/${id}`, { method: 'DELETE', headers: { 'if-match': `"${version}"` } }), { params: Promise.resolve({ id }) })
}

test('owned reads agree on a private version and same-timestamp changes reject both reviewed mutations', async () => {
  const id = await created(40, '10:00')
  const detail = await current(id)
  const saved = (await detail.json()).data
  expect(saved.reviewVersion).toMatch(/^[a-f0-9]{64}$/)
  expect(detail.headers.get('etag')).toBe(`"${saved.reviewVersion}"`)
  expect(detail.headers.get('cache-control')).toContain('no-store')
  const list = await listBookings(makeNextRequest('http://localhost/api/bookings'))
  expect((await list.json()).data.find((row: { id: string }) => row.id === id).reviewVersion).toBe(saved.reviewVersion)
  const before = await prisma.booking.findUniqueOrThrow({ where: { id } })
  await prisma.booking.update({ where: { id }, data: { meetingLink: 'https://meet.google.com/review-changed', updatedAt: before.updatedAt } })
  expect((await reschedule(id, 40, '14:00', saved.reviewVersion)).status).toBe(409)
  expect((await reviewedCancel(id, saved.reviewVersion)).status).toBe(409)
  const after = await prisma.booking.findUniqueOrThrow({ where: { id } })
  expect(after.scheduledAt).toEqual(before.scheduledAt)
  expect(after.status).toBe(before.status)
  const fresh = (await (await current(id)).json()).data
  const changed = await reschedule(id, 40, '14:00', fresh.reviewVersion)
  expect(changed.status).toBe(200)
  expect((await changed.json()).data.reviewVersion).not.toBe(fresh.reviewVersion)
})

test('two reviewed changes to the same appointment commit only one chosen time', async () => {
  const id = await created(41, '10:00')
  const version = (await (await current(id)).json()).data.reviewVersion
  const replies = await Promise.all([reschedule(id, 41, '13:00', version), reschedule(id, 41, '16:00', version)])
  expect(replies.map(reply => reply.status).sort()).toEqual([200, 409])
  expect([slot(41, '13:00'), slot(41, '16:00')]).toContain((await prisma.booking.findUniqueOrThrow({ where: { id } })).scheduledAt.toISOString())
})

test('a reviewed cancellation and reschedule cannot both act on an old appointment', async () => {
  const id = await created(42, '10:00')
  const version = (await (await current(id)).json()).data.reviewVersion
  const replies = await Promise.all([reschedule(id, 42, '13:00', version), reviewedCancel(id, version)])
  expect(replies.map(reply => reply.status).sort()).toEqual([200, 409])
  expect(['RESCHEDULED', 'CANCELLED']).toContain((await prisma.booking.findUniqueOrThrow({ where: { id } })).status)
  expect(await prisma.refund.count({ where: { payment: { bookingId: id } } })).toBe(0)
})

test('malformed versions do not write, and an owned review token grants no access to another account', async () => {
  const id = await created(43, '10:00')
  const version = (await (await current(id)).json()).data.reviewVersion
  const malformed = await DELETE(makeNextRequest(`http://localhost/api/bookings/${id}`, { method: 'DELETE', headers: { 'if-match': '*' } }), { params: Promise.resolve({ id }) })
  expect(malformed.status).toBe(400)
  process.env.BOOKING_RACE_USER_ID = healerUserId
  try { expect((await reviewedCancel(id, version)).status).toBe(404) }
  finally { process.env.BOOKING_RACE_USER_ID = userId }
  expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING')
})
