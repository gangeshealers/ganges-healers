import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { prisma } from '@/lib/prisma'
import { drainBookingEmails, recordBookingEmail } from '@/lib/bookings/email'
import { BOOKING_EMAIL_REVIEW_ACTION, BOOKING_EMAIL_REVIEW_ENTITY, reviewBookingEmail } from '@/lib/bookings/email-review'
import { loadBookingEmailReview } from '@/lib/admin/booking-emails'
import { finalizePayment } from '@/lib/payments/finalize'
import { POST as createBooking } from '@/app/api/bookings/route'
import { POST as confirmCredits } from '@/app/api/bookings/[id]/confirm-with-credits/route'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'
import { makeNextRequest } from '../helpers/next-handler'

jest.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: process.env.BOOKING_EMAIL_USER_ID, email: 'outbox@example.test', name: 'Fixture' } }) }))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))
jest.mock('@/lib/email/email.service', () => ({ emailService: { isEnabled: jest.fn(), sendBookingNotice: jest.fn() } }))
const email = jest.requireMock<{ emailService: { isEnabled: jest.Mock; sendBookingNotice: jest.Mock } }>('@/lib/email/email.service').emailService
let userId: string, healerId: string, healerUserId: string, serviceId: string, reviewerId: string
const originalOrigin = process.env.NEXTAUTH_URL
let offset = 0
const day = () => clinicDate(new Date(Date.now() + (40 + offset++) * 86400000))
const future = () => clinicSlotInstant(day(), '10:00')

async function booking(status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' = 'PENDING', scheduledAt = future()) {
  return prisma.booking.create({ data: { userId, healerId, serviceId, scheduledAt, durationMin: 60, pricePaise: 10000, status } })
}
async function record(bookingId: string, kind: 'REQUESTED' | 'CONFIRMED') {
  await prisma.$transaction(tx => recordBookingEmail(tx, bookingId, kind))
  return prisma.bookingEmail.findUniqueOrThrow({ where: { bookingId_kind: { bookingId, kind } } })
}
async function due(id: string) {
  await prisma.bookingEmail.update({ where: { id }, data: { nextAttemptAt: new Date(0), leaseUntil: new Date(0) } })
}

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `outbox-${randomUUID()}@example.test`, vip: true, freeSessionCredits: 5 } })).id
  reviewerId = (await prisma.user.create({ data: { email: `outbox-review-${randomUUID()}@example.test`, role: 'ADMIN' } })).id
  healerUserId = (await prisma.user.create({ data: { email: `outbox-healer-${randomUUID()}@example.test`, role: 'HEALER' } })).id
  const availability = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(d => [d, { start: '09:00', end: '20:00' }]))
  healerId = (await prisma.healer.create({ data: { userId: healerUserId, availability } })).id
  serviceId = (await prisma.service.create({ data: { slug: `outbox-${randomUUID()}`, name: 'Yoga <script>fixture</script>', description: 'Fixture', category: 'Fixture', price: 100, duration: 60 } })).id
  process.env.BOOKING_EMAIL_USER_ID = userId
})
beforeEach(() => {
  process.env.NEXTAUTH_URL = 'http://localhost:3010'
  email.isEnabled.mockReset().mockReturnValue(true)
  email.sendBookingNotice.mockReset().mockResolvedValue({ success: true, id: 'accepted-fixture' })
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { jest.restoreAllMocks() })
afterAll(async () => {
  delete process.env.BOOKING_EMAIL_USER_ID
  if (originalOrigin === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = originalOrigin
  try {
    if (reviewerId) {
      await prisma.activityLog.deleteMany({ where: { userId: reviewerId, action: BOOKING_EMAIL_REVIEW_ACTION } })
      await prisma.user.delete({ where: { id: reviewerId } })
    }
    if (userId) await prisma.user.delete({ where: { id: userId } })
    if (healerUserId) await prisma.user.delete({ where: { id: healerUserId } })
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  } finally { await prisma.$disconnect() }
})

test('booking creation sends request wording, escaped names, IST time and a trusted bookings link', async () => {
  const response = await createBooking(makeNextRequest('http://untrusted.invalid/api/bookings', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ healerId, serviceId, scheduledAt: future().toISOString() }),
  }))
  expect(response.status).toBe(201)
  const saved = (await response.json()).data
  expect(saved.status).toBe('PENDING')
  const event = await prisma.bookingEmail.findUniqueOrThrow({ where: { bookingId_kind: { bookingId: saved.id, kind: 'REQUESTED' } } })
  expect(event.status).toBe('SENT')
  expect(event.providerMessageId).toBe('accepted-fixture')
  const [message, key] = email.sendBookingNotice.mock.calls[0]
  expect(key).toBe(`booking-email/${event.id}`)
  expect(message.subject).toContain('Booking Request Received')
  expect(message.html).toContain('Complete payment or use an eligible session credit')
  expect(message.html).toContain('10:00 AM IST')
  expect(message.html).toContain('http://localhost:3010/dashboard/bookings')
  expect(message.html).not.toMatch(/<script>|untrusted\.invalid|has been confirmed/)
})

test('concurrent identical reviews produce one audit and a different outcome cannot replace it', async () => {
  const saved = await booking()
  const event = await record(saved.id, 'REQUESTED')
  const held = await prisma.bookingEmail.update({ where: { id: event.id }, data: {
    status: 'REVIEW', attempts: 8, lastError: 'ATTEMPTS_EXHAUSTED', payload: { fixture: 'stored notice' },
  } })
  const input = { id: held.id, ownerId: reviewerId, version: (await loadBookingEmailReview(held.id))!.version, outcome: 'FOLLOW_UP_COMPLETE' }
  const results = await Promise.all([reviewBookingEmail(reviewerId, input), reviewBookingEmail(reviewerId, input)])
  expect(results.map(result => result.recorded).sort()).toEqual([false, true])
  await expect(reviewBookingEmail(reviewerId, { ...input, outcome: 'NO_FOLLOW_UP' })).rejects.toThrow('A different review is already saved')
  expect(await prisma.activityLog.findMany({ where: { action: BOOKING_EMAIL_REVIEW_ACTION, entityType: BOOKING_EMAIL_REVIEW_ENTITY, entityId: event.id } })).toEqual([
    expect.objectContaining({ userId: reviewerId, metadata: { version: input.version, outcome: input.outcome } }),
  ])
  expect(await prisma.bookingEmail.findUniqueOrThrow({ where: { id: held.id } })).toEqual(held)
  await prisma.bookingEmail.update({ where: { id: held.id }, data: { payload: { fixture: 'changed notice' }, updatedAt: held.updatedAt } })
  await expect(reviewBookingEmail(reviewerId, input)).rejects.toThrow('This notice changed')
  expect(email.sendBookingNotice).not.toHaveBeenCalled()
})

test('reviews require the current administrator, a current version and a notice in REVIEW', async () => {
  const saved = await booking()
  const event = await record(saved.id, 'REQUESTED')
  const input = { id: event.id, ownerId: reviewerId, version: (await loadBookingEmailReview(event.id))!.version, outcome: 'NO_FOLLOW_UP' }
  await expect(reviewBookingEmail(userId, input)).rejects.toThrow('Your account changed')
  await expect(reviewBookingEmail(userId, { ...input, ownerId: userId })).rejects.toThrow('Administrator access is required')
  await expect(reviewBookingEmail(reviewerId, input)).rejects.toThrow('This notice changed')
  await expect(reviewBookingEmail(reviewerId, { ...input, outcome: 'untrusted free text' })).rejects.toThrow('Select a review outcome')
  const revised = await prisma.bookingEmail.update({ where: { id: event.id }, data: {
    status: 'REVIEW', updatedAt: new Date(event.updatedAt.getTime() + 1000),
  } })
  await expect(reviewBookingEmail(reviewerId, input)).rejects.toThrow('This notice changed')
  expect(await prisma.activityLog.count({ where: { action: BOOKING_EMAIL_REVIEW_ACTION, entityId: event.id } })).toBe(0)
  expect(await reviewBookingEmail(reviewerId, { ...input, version: (await loadBookingEmailReview(revised.id))!.version })).toEqual({ recorded: true })
})

test('concurrent browser and captured-payment confirmations persist one confirmed event and send once', async () => {
  email.isEnabled.mockReturnValue(false)
  const saved = await booking()
  const payment = await prisma.payment.create({ data: { userId, bookingId: saved.id, type: 'SESSION', gateway: 'razorpay', gatewayOrderId: `order_${randomUUID()}`, amountPaise: 10000, status: 'pending', statusEnum: 'PENDING' } })
  const input = { orderId: payment.gatewayOrderId!, paymentId: `pay_${randomUUID()}`, userId }
  await Promise.all([finalizePayment({ ...input, signature: 'browser-fixture' }), finalizePayment({ ...input, captured: { amountPaise: 10000, currency: 'INR' } })])
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: saved.id } })).status).toBe('CONFIRMED')
  expect(await prisma.bookingEmail.count({ where: { bookingId: saved.id, kind: 'CONFIRMED' } })).toBe(1)
  email.isEnabled.mockReturnValue(true)
  await Promise.all([drainBookingEmails({ bookingId: saved.id }), drainBookingEmails({ bookingId: saved.id })])
  expect(email.sendBookingNotice).toHaveBeenCalledTimes(1)
  expect(email.sendBookingNotice.mock.calls[0][0].subject).toContain('Booking Confirmed')
  await finalizePayment({ ...input, signature: 'replay-fixture' })
  expect(email.sendBookingNotice).toHaveBeenCalledTimes(1)
})

test('credit confirmation records one event, supersedes an unsent request and spends one credit', async () => {
  email.isEnabled.mockReturnValue(false)
  const saved = await booking()
  await record(saved.id, 'REQUESTED')
  const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits
  const confirm = () => confirmCredits(new Request('http://localhost/confirm', { method: 'POST' }), { params: Promise.resolve({ id: saved.id }) })
  expect((await Promise.all([confirm(), confirm()])).map(r => r.status).sort()).toEqual([200, 400])
  expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits).toBe(before - 1)
  email.isEnabled.mockReturnValue(true)
  const result = await drainBookingEmails({ bookingId: saved.id })
  expect(result).toMatchObject({ skipped: 1, sent: 1 })
  expect(email.sendBookingNotice).toHaveBeenCalledTimes(1)
  expect(email.sendBookingNotice.mock.calls[0][0].subject).toContain('Booking Confirmed')
  expect((await confirm()).status).toBe(400)
  await drainBookingEmails({ bookingId: saved.id })
  expect(email.sendBookingNotice).toHaveBeenCalledTimes(1)
})

test('credit confirmation after start time keeps the balance, booking and outbox intact', async () => {
  const saved = await booking('PENDING', new Date(Date.now() - 60_000))
  const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits
  const response = await confirmCredits(new Request('http://localhost/confirm', { method: 'POST' }), { params: Promise.resolve({ id: saved.id }) })
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'INVALID_STATE' })
  expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits).toBe(before)
  expect(await prisma.booking.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(saved)
  expect(await prisma.payment.count({ where: { bookingId: saved.id } })).toBe(0)
  expect(await prisma.bookingEmail.count({ where: { bookingId: saved.id } })).toBe(0)
  expect(email.sendBookingNotice).not.toHaveBeenCalled()
})

test('a captured payment for an earlier order still reconciles after the appointment starts', async () => {
  const saved = await booking('PENDING', new Date(Date.now() - 60_000))
  const payment = await prisma.payment.create({ data: {
    userId, bookingId: saved.id, type: 'SESSION', gateway: 'razorpay', gatewayOrderId: `order_${randomUUID()}`,
    amountPaise: 10000, status: 'pending', statusEnum: 'PENDING',
  } })
  const input = { orderId: payment.gatewayOrderId!, paymentId: `pay_${randomUUID()}`, userId, captured: { amountPaise: 10000, currency: 'INR' } }
  expect((await finalizePayment(input)).payment.statusEnum).toBe('SUCCESS')
  expect((await finalizePayment(input)).idempotent).toBe(true)
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: saved.id } })).status).toBe('CONFIRMED')
  expect(await prisma.bookingEmail.findMany({ where: { bookingId: saved.id, kind: 'CONFIRMED' } })).toEqual([
    expect.objectContaining({ status: 'SKIPPED', lastError: 'BOOKING_INACTIVE' }),
  ])
  expect(email.sendBookingNotice).not.toHaveBeenCalled()
})

test('replaying a legacy settled appointment does not create a new unsolicited confirmation', async () => {
  const saved = await booking('CONFIRMED')
  const paymentId = `pay_${randomUUID()}`
  const payment = await prisma.payment.create({ data: { userId, bookingId: saved.id, type: 'SESSION', gateway: 'razorpay', gatewayOrderId: `order_${randomUUID()}`, gatewayPaymentId: paymentId, amountPaise: 10000, status: 'success', statusEnum: 'SUCCESS' } })
  const noticesBefore = await prisma.notification.findMany({ where: { userId }, orderBy: { id: 'asc' } })
  expect((await finalizePayment({ orderId: payment.gatewayOrderId!, paymentId, userId, signature: 'replay' })).idempotent).toBe(true)
  expect(await prisma.notification.findMany({ where: { userId }, orderBy: { id: 'asc' } })).toEqual(noticesBefore)
  expect(await prisma.bookingEmail.count({ where: { bookingId: saved.id } })).toBe(0)
  expect(email.sendBookingNotice).not.toHaveBeenCalled()
})

test('outbox insertion failure rolls paid and credit confirmation back with their original financial state', async () => {
  const paid = await booking(), credit = await booking()
  const payment = await prisma.payment.create({ data: { userId, bookingId: paid.id, type: 'SESSION', gateway: 'razorpay', gatewayOrderId: `order_${randomUUID()}`, amountPaise: 10000, status: 'pending', statusEnum: 'PENDING' } })
  const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits
  const name = `test_outbox_failure_${randomUUID().replace(/-/g, '')}`
  // Isolated, serialized test DB only: reject new events while retaining all existing rows.
  await prisma.$executeRawUnsafe(`ALTER TABLE "BookingEmail" ADD CONSTRAINT "${name}" CHECK (false) NOT VALID`)
  try {
    await expect(finalizePayment({ orderId: payment.gatewayOrderId!, paymentId: `pay_${randomUUID()}`, userId, signature: 'fixture' })).rejects.toThrow()
    expect((await confirmCredits(new Request('http://localhost/confirm', { method: 'POST' }), { params: Promise.resolve({ id: credit.id }) })).status).toBe(500)
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "BookingEmail" DROP CONSTRAINT "${name}"`)
  }
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).statusEnum).toBe('PENDING')
  expect((await prisma.booking.findMany({ where: { id: { in: [paid.id, credit.id] } } })).map(b => b.status)).toEqual(['PENDING', 'PENDING'])
  expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits).toBe(before)
  expect(await prisma.payment.count({ where: { bookingId: credit.id } })).toBe(0)
  expect(email.sendBookingNotice).not.toHaveBeenCalled()
})

test('credit confirmation cannot overwrite an existing gateway payment or spend another credit', async () => {
  const saved = await booking()
  const payment = await prisma.payment.create({ data: { userId, bookingId: saved.id, type: 'SESSION', gateway: 'razorpay', gatewayOrderId: `order_${randomUUID()}`, amountPaise: 10000, status: 'pending', statusEnum: 'PENDING' } })
  const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits
  const response = await confirmCredits(new Request('http://localhost/confirm', { method: 'POST' }), { params: Promise.resolve({ id: saved.id }) })
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'INVALID_STATE' })
  expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toEqual(payment)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits).toBe(before)
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: saved.id } })).status).toBe('PENDING')
  expect(await prisma.bookingEmail.count({ where: { bookingId: saved.id } })).toBe(0)
  const [, concurrentCredit] = await Promise.all([
    finalizePayment({ orderId: payment.gatewayOrderId!, paymentId: `pay_${randomUUID()}`, userId, signature: 'fixture' }),
    confirmCredits(new Request('http://localhost/confirm', { method: 'POST' }), { params: Promise.resolve({ id: saved.id }) }),
  ])
  expect(concurrentCredit.status).toBe(400)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits).toBe(before)
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).gateway).toBe('razorpay')
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: saved.id } })).status).toBe('CONFIRMED')
})

test('provider acceptance followed by a lost database acknowledgement reuses the frozen payload and key', async () => {
  const saved = await booking('CONFIRMED'), event = await record(saved.id, 'CONFIRMED')
  const persist = jest.spyOn(prisma.bookingEmail, 'updateMany').mockRejectedValueOnce(new Error('private database acknowledgement lost'))
  expect((await drainBookingEmails({ bookingId: saved.id })).pending).toBe(1)
  persist.mockRestore()
  const pending = await prisma.bookingEmail.findUniqueOrThrow({ where: { id: event.id } })
  expect(pending.status).toBe('PENDING')
  expect(pending.payload).not.toBeNull()
  await due(event.id)
  process.env.NEXTAUTH_URL = 'http://localhost:9999'
  expect((await drainBookingEmails({ bookingId: saved.id })).sent).toBe(1)
  expect(email.sendBookingNotice.mock.calls[1]).toEqual(email.sendBookingNotice.mock.calls[0])
  expect((await prisma.bookingEmail.findUniqueOrThrow({ where: { id: event.id } })).attempts).toBe(2)
  expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toMatch(/private|acknowledgement/)
})

test('an unconfirmed response stays due for a later retry instead of reporting delivery', async () => {
  const saved = await booking('CONFIRMED'), event = await record(saved.id, 'CONFIRMED')
  email.sendBookingNotice.mockResolvedValueOnce({ success: false })
  expect((await drainBookingEmails({ bookingId: saved.id })).pending).toBe(1)
  expect((await prisma.bookingEmail.findUniqueOrThrow({ where: { id: event.id } })).sentAt).toBeNull()
  await drainBookingEmails({ bookingId: saved.id })
  expect(email.sendBookingNotice).toHaveBeenCalledTimes(1)
  await due(event.id)
  expect((await drainBookingEmails({ bookingId: saved.id })).sent).toBe(1)
  expect(email.sendBookingNotice.mock.calls[1]).toEqual(email.sendBookingNotice.mock.calls[0])
})

test.each(['CANCELLED', 'COMPLETED'] as const)('a %s appointment suppresses an outstanding confirmation', async status => {
  const saved = await booking(status)
  await record(saved.id, 'CONFIRMED')
  expect((await drainBookingEmails({ bookingId: saved.id })).skipped).toBe(1)
  expect(email.sendBookingNotice).not.toHaveBeenCalled()
})

test.each(['expired', 'exhausted', 'invalid'] as const)('%s attempts require review without another provider request', async state => {
  const saved = await booking('CONFIRMED'), event = await record(saved.id, 'CONFIRMED')
  await prisma.bookingEmail.update({ where: { id: event.id }, data: state === 'expired' ? { firstAttemptAt: new Date(Date.now() - 23 * 3600000) }
    : state === 'exhausted' ? { attempts: 8 } : { payload: {} } })
  expect((await drainBookingEmails({ bookingId: saved.id })).review).toBe(1)
  expect(email.sendBookingNotice).not.toHaveBeenCalled()
})

test('a reschedule after an unconfirmed attempt requires review rather than changing an idempotent payload', async () => {
  const saved = await booking('CONFIRMED'), event = await record(saved.id, 'CONFIRMED')
  email.sendBookingNotice.mockResolvedValueOnce({ success: false })
  await drainBookingEmails({ bookingId: saved.id })
  await prisma.booking.update({ where: { id: saved.id }, data: { scheduledAt: future(), status: 'RESCHEDULED' } })
  await due(event.id)
  expect((await drainBookingEmails({ bookingId: saved.id })).review).toBe(1)
  expect(email.sendBookingNotice).toHaveBeenCalledTimes(1)
})

test('an expired claimant cannot overwrite the newer accepted delivery', async () => {
  const saved = await booking('CONFIRMED'), event = await record(saved.id, 'CONFIRMED')
  let started!: () => void, finish!: (value: { success: boolean; id: string }) => void
  const entered = new Promise<void>(resolve => { started = resolve })
  const blocked = new Promise<{ success: boolean; id: string }>(resolve => { finish = resolve })
  email.sendBookingNotice.mockImplementationOnce(() => { started(); return blocked })
  const first = drainBookingEmails({ bookingId: saved.id })
  await entered
  await due(event.id)
  expect((await drainBookingEmails({ bookingId: saved.id })).sent).toBe(1)
  finish({ success: true, id: 'stale-reply' })
  expect((await first).busy).toBe(1)
  expect((await prisma.bookingEmail.findUniqueOrThrow({ where: { id: event.id } })).providerMessageId).toBe('accepted-fixture')
  expect(email.sendBookingNotice.mock.calls[1]).toEqual(email.sendBookingNotice.mock.calls[0])
})

test('the additive migration preserves populated legacy rows and adds usable unique events', async () => {
  const schema = `outbox_rehearsal_${randomUUID().replace(/-/g, '')}`
  const rollback = new Error('rollback isolated migration rehearsal')
  const migration = readFileSync('prisma/migrations/20261108010000_booking_email_outbox/migration.sql', 'utf8')
  await expect(prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)
    await tx.$executeRawUnsafe('CREATE TABLE "Booking" (id TEXT PRIMARY KEY, status TEXT, "pricePaise" INTEGER)')
    await tx.$executeRawUnsafe('CREATE TABLE "Payment" (id TEXT PRIMARY KEY, "bookingId" TEXT REFERENCES "Booking"(id), "amountPaise" INTEGER)')
    await tx.$executeRawUnsafe("INSERT INTO \"Booking\" VALUES ('legacy-booking', 'CONFIRMED', 7000)")
    await tx.$executeRawUnsafe("INSERT INTO \"Payment\" VALUES ('legacy-payment', 'legacy-booking', 7000)")
    const before = await tx.$queryRaw`SELECT row_to_json(b) AS booking, row_to_json(p) AS payment FROM "Booking" b JOIN "Payment" p ON p."bookingId" = b.id`
    for (const statement of migration.split(';').map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement)
    expect(await tx.$queryRaw`SELECT row_to_json(b) AS booking, row_to_json(p) AS payment FROM "Booking" b JOIN "Payment" p ON p."bookingId" = b.id`).toEqual(before)
    await tx.$executeRawUnsafe("INSERT INTO \"BookingEmail\" (id, \"bookingId\", kind, \"updatedAt\") VALUES ('event', 'legacy-booking', 'CONFIRMED', now())")
    expect(await tx.$executeRawUnsafe("INSERT INTO \"BookingEmail\" (id, \"bookingId\", kind, \"updatedAt\") VALUES ('duplicate', 'legacy-booking', 'CONFIRMED', now()) ON CONFLICT DO NOTHING")).toBe(0)
    throw rollback
  })).rejects.toBe(rollback)
})
