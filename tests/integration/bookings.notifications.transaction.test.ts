import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { POST as createBooking } from '@/app/api/bookings/route'
import { PUT, DELETE, PATCH } from '@/app/api/bookings/[id]/route'
import { PATCH as healerAction } from '@/app/api/healer/bookings/[id]/route'
import { POST as confirmCredits } from '@/app/api/bookings/[id]/confirm-with-credits/route'
import { GET as getNotifications } from '@/app/api/notifications/route'
import { recordBookingEmail } from '@/lib/bookings/email'
import { recordBookingNotifications } from '@/lib/bookings/notifications'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))
jest.mock('@/lib/email/email.service', () => ({ emailService: { isEnabled: () => false } }))
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
let customerId: string, practitionerId: string, healerId: string, serviceId: string
let offset = 40
const nextTime = () => clinicSlotInstant(clinicDate(new Date(Date.now() + offset++ * 86400000)), '10:00')
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const request = (id: string, method: string, body?: object) => new NextRequest(`http://localhost/api/bookings/${id}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
const notices = () => prisma.notification.findMany({ where: { userId: { in: [customerId, practitionerId] } }, orderBy: { id: 'asc' } })
async function fixture(status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' = 'PENDING', userId = customerId) {
  return prisma.booking.create({ data: { userId, healerId, serviceId, scheduledAt: nextTime(), durationMin: 60, pricePaise: 10000, status } })
}
async function create() {
  const reply = await createBooking(new NextRequest('http://localhost/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ healerId, serviceId, scheduledAt: nextTime().toISOString() }) }))
  expect(reply.status).toBe(201)
  return (await reply.json()).data as { id: string }
}
async function failNoticeWrites(work: () => Promise<void>) {
  const name = `test_notice_${randomUUID().replace(/-/g, '')}`
  await prisma.$executeRawUnsafe(`ALTER TABLE "Notification" ADD CONSTRAINT "${name}" CHECK (false) NOT VALID`)
  try { await work() } finally { await prisma.$executeRawUnsafe(`ALTER TABLE "Notification" DROP CONSTRAINT "${name}"`) }
}

beforeAll(async () => {
  customerId = (await prisma.user.create({ data: { email: `booking-notice-${randomUUID()}@example.test`, vip: true, freeSessionCredits: 5 } })).id
  practitionerId = (await prisma.user.create({ data: { email: `booking-notice-healer-${randomUUID()}@example.test`, role: 'HEALER' } })).id
  const availability = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, { start: '09:00', end: '20:00' }]))
  healerId = (await prisma.healer.create({ data: { userId: practitionerId, availability, isVerified: true } })).id
  serviceId = (await prisma.service.create({ data: { slug: `booking-notice-${randomUUID()}`, name: 'Notification fixture session', description: 'Fixture', category: 'Fixture', price: 100, duration: 60 } })).id
})
beforeEach(async () => {
  auth.mockResolvedValue({ user: { id: customerId, role: 'USER' } })
  await prisma.notification.deleteMany({ where: { userId: { in: [customerId, practitionerId] } } })
  await prisma.user.update({ where: { id: customerId }, data: { closedAt: null, vip: true, freeSessionCredits: 5 } })
  await prisma.user.update({ where: { id: practitionerId }, data: { closedAt: null, role: 'HEALER' } })
})
afterAll(async () => {
  try {
    await prisma.activityLog.deleteMany({ where: { userId: { in: [customerId, practitionerId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [customerId, practitionerId] } } })
    await prisma.service.delete({ where: { id: serviceId } })
  } finally { await prisma.$disconnect() }
})

test('a new request reaches both owned inboxes once and duplicate intents preserve read history', async () => {
  const booking = await create()
  const rows = await notices()
  expect(rows.map(row => row.type).sort()).toEqual(['booking_requested_customer', 'booking_requested_practitioner'])
  expect(rows.every(row => row.message.includes('IST') && row.message.includes('awaiting confirmation'))).toBe(true)
  const customer = rows.find(row => row.userId === customerId)!
  await prisma.notification.update({ where: { id: customer.id }, data: { read: true } })
  const before = await notices()
  await Promise.all([prisma.$transaction(tx => recordBookingEmail(tx, booking.id, 'REQUESTED')), prisma.$transaction(tx => recordBookingEmail(tx, booking.id, 'REQUESTED'))])
  expect(await notices()).toEqual(before)
  auth.mockResolvedValue({ user: { id: practitionerId, role: 'HEALER' } })
  const response = await getNotifications(new NextRequest(`http://localhost/api/notifications?type=booking&userId=${customerId}`))
  const inbox = await response.json()
  expect(inbox.notifications).toHaveLength(1)
  expect(inbox.notifications[0]).toMatchObject({ userId: practitionerId, type: 'booking_requested_practitioner' })
})

test('credit confirmation and replay retain one confirmed notice per recipient without another credit', async () => {
  const booking = await create()
  expect((await confirmCredits(request(booking.id, 'POST'), params(booking.id))).status).toBe(200)
  const before = await notices()
  expect(before.filter(row => row.type.startsWith('booking_confirmed_'))).toHaveLength(2)
  const balance = (await prisma.user.findUniqueOrThrow({ where: { id: customerId } })).freeSessionCredits
  expect((await confirmCredits(request(booking.id, 'POST'), params(booking.id))).status).toBe(400)
  expect(await notices()).toEqual(before)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: customerId } })).freeSessionCredits).toBe(balance)
})

test('a real reschedule creates two notices, an identical legacy retry creates none, and a later move remains distinct', async () => {
  const booking = await fixture('CONFIRMED'), target = nextTime()
  const sameTime = await fixture('CONFIRMED')
  expect((await PUT(request(sameTime.id, 'PUT', { scheduledAt: sameTime.scheduledAt.toISOString() }), params(sameTime.id))).status).toBe(200)
  expect(await notices()).toHaveLength(0)
  expect((await PUT(request(booking.id, 'PUT', { scheduledAt: target.toISOString() }), params(booking.id))).status).toBe(200)
  const first = await notices()
  expect(first).toHaveLength(2)
  const saved = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
  expect((await PUT(request(booking.id, 'PUT', { scheduledAt: target.toISOString() }), params(booking.id))).status).toBe(200)
  expect(await notices()).toEqual(first)
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).updatedAt).toEqual(saved.updatedAt)
  expect((await PUT(request(booking.id, 'PUT', { scheduledAt: nextTime().toISOString() }), params(booking.id))).status).toBe(200)
  expect(await notices()).toHaveLength(4)
})

test('cancellation notifies once, without claiming a refund, and legacy retries add nothing', async () => {
  const booking = await fixture('CONFIRMED')
  expect((await DELETE(request(booking.id, 'DELETE'), params(booking.id))).status).toBe(200)
  const before = await notices()
  expect(before.map(row => row.type).sort()).toEqual(['booking_cancelled_customer', 'booking_cancelled_practitioner'])
  expect(before.find(row => row.userId === customerId)?.message).toContain('saved refund outcome')
  expect(before.some(row => row.message.includes('refund confirmed'))).toBe(false)
  expect((await PATCH(request(booking.id, 'PATCH', { action: 'cancel' }), params(booking.id))).status).toBe(200)
  expect(await notices()).toEqual(before)
})

test('notification failure rolls booking creation and its outbox event back together', async () => {
  const count = await prisma.booking.count({ where: { userId: customerId } })
  const events = await prisma.bookingEmail.count({ where: { booking: { userId: customerId } } })
  await failNoticeWrites(async () => {
    const response = await createBooking(new NextRequest('http://localhost/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ healerId, serviceId, scheduledAt: nextTime().toISOString() }) }))
    expect(response.status).toBe(500)
  })
  expect(await prisma.booking.count({ where: { userId: customerId } })).toBe(count)
  expect(await prisma.bookingEmail.count({ where: { booking: { userId: customerId } } })).toBe(events)
  expect(await notices()).toHaveLength(0)
})

test('notification failure rolls credit confirmation, payment and confirmed intent back together', async () => {
  const booking = await create(), before = await notices()
  await failNoticeWrites(async () => { expect((await confirmCredits(request(booking.id, 'POST'), params(booking.id))).status).toBe(500) })
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('PENDING')
  expect((await prisma.user.findUniqueOrThrow({ where: { id: customerId } })).freeSessionCredits).toBe(5)
  expect(await prisma.payment.findUnique({ where: { bookingId: booking.id } })).toBeNull()
  expect(await prisma.bookingEmail.count({ where: { bookingId: booking.id, kind: 'CONFIRMED' } })).toBe(0)
  expect(await notices()).toEqual(before)
})

test('closed recipients and revoked practitioners are excluded while self-booking creates one customer notice', async () => {
  await prisma.user.update({ where: { id: customerId }, data: { closedAt: new Date() } })
  await prisma.user.update({ where: { id: practitionerId }, data: { role: 'USER' } })
  const excluded = await fixture()
  await prisma.$transaction(tx => recordBookingNotifications(tx, excluded.id, 'REQUESTED', 'excluded'))
  expect(await notices()).toHaveLength(0)
  await prisma.user.update({ where: { id: practitionerId }, data: { role: 'HEALER' } })
  const self = await fixture('PENDING', practitionerId)
  await prisma.$transaction(tx => recordBookingNotifications(tx, self.id, 'REQUESTED', 'self'))
  const rows = await notices()
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ userId: practitionerId, type: 'booking_requested_customer' })
})


test('a failed practitioner notice rolls the free confirmation and its staff audit back', async () => {
  const booking = await fixture()
  await prisma.booking.update({ where: { id: booking.id }, data: { pricePaise: 0 } })
  auth.mockResolvedValue({ user: { id: practitionerId, role: 'HEALER' } })
  await failNoticeWrites(async () => {
    const response = await healerAction(new NextRequest(`http://localhost/api/healer/bookings/${booking.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'CONFIRM' }) }), params(booking.id))
    expect(response.status).toBe(500)
  })
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('PENDING')
  expect(await prisma.activityLog.count({ where: { entityId: booking.id, action: 'booking_confirm_by_healer' } })).toBe(0)
  expect(await prisma.bookingEmail.count({ where: { bookingId: booking.id, kind: 'CONFIRMED' } })).toBe(0)
  expect(await notices()).toHaveLength(0)
})

test('successful practitioner confirmation and cancellation reach both recipients with no duplicate on a rejected repeat', async () => {
  const booking = await fixture()
  await prisma.booking.update({ where: { id: booking.id }, data: { pricePaise: 0 } })
  auth.mockResolvedValue({ user: { id: practitionerId, role: 'HEALER' } })
  const action = (value: string) => healerAction(new NextRequest(`http://localhost/api/healer/bookings/${booking.id}`, { method: 'PATCH', body: JSON.stringify({ action: value }) }), params(booking.id))
  expect((await action('CONFIRM')).status).toBe(200)
  const confirmed = await notices()
  expect(await prisma.bookingEmail.count({ where: { bookingId: booking.id, kind: 'CONFIRMED' } })).toBe(1)
  expect(confirmed.map(row => row.type).sort()).toEqual(['booking_confirmed_customer', 'booking_confirmed_practitioner'])
  expect((await action('CONFIRM')).status).toBe(400)
  expect(await notices()).toEqual(confirmed)
  expect((await action('CANCEL')).status).toBe(200)
  expect((await notices()).filter(row => row.type.startsWith('booking_cancelled_'))).toHaveLength(2)
})
