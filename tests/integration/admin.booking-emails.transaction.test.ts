import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { loadBookingEmailReview, reconcileBookingEmail } from '@/lib/admin/booking-emails'
import { drainBookingEmails } from '@/lib/bookings/email'

jest.mock('@/lib/email/email.service', () => ({ emailService: { isEnabled: jest.fn(() => true), sendBookingNotice: jest.fn() } }))
const email = jest.requireMock<{ emailService: { sendBookingNotice: jest.Mock } }>('@/lib/email/email.service').emailService
let actorId: string, customerId: string, customerEmail: string, healerUserId: string, healerId: string, serviceId: string

beforeAll(async () => {
  actorId = (await prisma.user.create({ data: { email: `email-review-admin-${randomUUID()}@example.test`, role: 'ADMIN' } })).id
  const customer = await prisma.user.create({ data: { email: `email-review-customer-${randomUUID()}@example.test` } })
  customerId = customer.id; customerEmail = customer.email
  healerUserId = (await prisma.user.create({ data: { email: `email-review-healer-${randomUUID()}@example.test`, role: 'HEALER' } })).id
  healerId = (await prisma.healer.create({ data: { userId: healerUserId } })).id
  serviceId = (await prisma.service.create({ data: { slug: `email-review-${randomUUID()}`, name: 'Review fixture', description: 'Fixture', category: 'Fixture', price: 100, duration: 60 } })).id
})
beforeEach(() => { email.sendBookingNotice.mockReset().mockResolvedValue({ success: true, id: 'late-worker-id' }) })
afterEach(() => { jest.restoreAllMocks() })
afterAll(async () => {
  try {
    if (actorId) { await prisma.activityLog.deleteMany({ where: { userId: actorId } }); await prisma.user.delete({ where: { id: actorId } }) }
    if (customerId) await prisma.user.delete({ where: { id: customerId } })
    if (healerUserId) await prisma.user.delete({ where: { id: healerUserId } })
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  } finally { await prisma.$disconnect() }
})

async function fixture(overrides: { status?: 'PENDING' | 'REVIEW' | 'SENT' | 'SKIPPED'; attempts?: number; leaseUntil?: Date; claimToken?: string } = {}) {
  const booking = await prisma.booking.create({ data: { userId: customerId, healerId, serviceId, status: 'CONFIRMED', scheduledAt: new Date(Date.now() + 14 * 86400000), durationMin: 60, pricePaise: 10000 } })
  await prisma.payment.create({ data: { bookingId: booking.id, userId: customerId, type: 'SESSION', gateway: 'razorpay', status: 'success', statusEnum: 'SUCCESS', amountPaise: 10000 } })
  const row = await prisma.bookingEmail.create({ data: { bookingId: booking.id, kind: 'CONFIRMED', status: 'REVIEW', attempts: 2,
    firstAttemptAt: new Date(Date.now() - 60000), payload: { message: { from: 'Fixture <fixture@example.test>', to: customerEmail, subject: 'Fixture', html: '<p>Private rendered content</p>' }, scheduledAt: booking.scheduledAt.toISOString(), healerId, serviceId },
    lastError: 'PROVIDER_UNCONFIRMED', ...overrides } })
  return { row, input: { ownerId: actorId, id: row.id, version: (await loadBookingEmailReview(row.id))!.version, reason: 'Matched provider records' }, booking }
}

test('acceptance commits a safe audit and leaves appointment, payment, payload and provider key intact', async () => {
  const { row, input, booking } = await fixture()
  const payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })
  const saved = await reconcileBookingEmail(actorId, { ...input, decision: 'accepted', providerMessageId: 'verified-provider-id' })
  expect(saved).toMatchObject({ status: 'SENT', providerMessageId: 'verified-provider-id', canAccept: false, canStop: false })
  const after = await prisma.bookingEmail.findUniqueOrThrow({ where: { id: row.id } })
  expect(after.payload).toEqual(row.payload)
  expect(after.attempts).toBe(row.attempts)
  expect(after.firstAttemptAt).toEqual(row.firstAttemptAt)
  expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toEqual(booking)
  expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toEqual(payment)
  const audit = await prisma.activityLog.findFirstOrThrow({ where: { entityId: row.id, entityType: 'booking_email' } })
  expect(audit).toMatchObject({ userId: actorId, action: 'booking_email_acceptance_recorded' })
  expect(audit.metadata).toMatchObject({ reason: input.reason, statusBefore: 'REVIEW', statusAfter: 'SENT', providerMessageId: 'verified-provider-id' })
  expect(JSON.stringify(audit.metadata)).not.toMatch(/private@|rendered|<p>|payload/)
  expect(JSON.stringify(audit.metadata)).not.toContain(customerEmail)
  await drainBookingEmails({ bookingId: booking.id })
  expect(email.sendBookingNotice).not.toHaveBeenCalled()
})

test('stopping retries fences an expired claimant without deleting its receipt or frozen payload', async () => {
  const { row, input, booking } = await fixture({ status: 'PENDING', claimToken: 'expired-worker', leaseUntil: new Date(Date.now() - 1000) })
  expect((await reconcileBookingEmail(actorId, { ...input, decision: 'stopped' })).status).toBe('SKIPPED')
  const late = await prisma.bookingEmail.updateMany({ where: { id: row.id, status: 'PENDING', claimToken: 'expired-worker' }, data: { status: 'SENT', providerMessageId: 'late-worker-id' } })
  expect(late.count).toBe(0)
  const saved = await prisma.bookingEmail.findUniqueOrThrow({ where: { id: row.id } })
  expect(saved).toMatchObject({ lastError: 'STAFF_STOPPED', claimToken: null, leaseUntil: null })
  expect(saved.payload).toEqual(row.payload)
  await drainBookingEmails({ bookingId: booking.id })
  expect(email.sendBookingNotice).not.toHaveBeenCalled()
})

test('a skipped attempted message can later record verified provider acceptance without another send', async () => {
  const { input } = await fixture({ status: 'SKIPPED' })
  expect((await reconcileBookingEmail(actorId, { ...input, decision: 'accepted', providerMessageId: 'verified-late-provider-id' })).status).toBe('SENT')
  expect(email.sendBookingNotice).not.toHaveBeenCalled()
})

test('private data is projected before rendering and same-timestamp worker, payload and provider changes invalidate review', async () => {
  const { row, input } = await fixture()
  const snapshot = await loadBookingEmailReview(row.id)
  expect(snapshot).toMatchObject({ recipient: customerEmail, reason: 'PROVIDER_UNCONFIRMED', hasPayload: true })
  expect(JSON.stringify(snapshot)).not.toMatch(/rendered content|claimToken|payload/)
  let version = input.version
  for (const change of [{ attempts: 3 }, { claimToken: 'private-worker-token' }, { providerMessageId: 'private-provider-id' }, { payload: { message: { to: '<script>invalid</script>', html: 'private-payload' } } }, { lastError: 'private-provider-error' }]) {
    await prisma.bookingEmail.update({ where: { id: row.id }, data: { ...change, updatedAt: row.updatedAt } })
    const fresh = (await loadBookingEmailReview(row.id))!
    expect(fresh.version).not.toBe(version)
    await expect(reconcileBookingEmail(actorId, { ...input, version, decision: 'stopped' })).rejects.toMatchObject({ code: 'EMAIL_CHANGED' })
    version = fresh.version
  }
  const safe = (await loadBookingEmailReview(row.id))!
  expect(safe).toMatchObject({ reason: 'OTHER', recipient: null })
  expect(JSON.stringify(safe)).not.toMatch(/private-worker-token|private-payload|private-provider-error|<script>/)
  expect(await prisma.activityLog.count({ where: { entityId: row.id } })).toBe(0)
})

test('active attempts reject either staff decision before any audit or update', async () => {
  const { row, input } = await fixture({ status: 'PENDING', leaseUntil: new Date(Date.now() + 120000), claimToken: 'active-worker' })
  for (const decision of [{ decision: 'accepted', providerMessageId: 'verified-provider-id' }, { decision: 'stopped' }]) {
    await expect(reconcileBookingEmail(actorId, { ...input, ...decision })).rejects.toMatchObject({ code: 'EMAIL_BUSY' })
  }
  expect((await prisma.bookingEmail.findUniqueOrThrow({ where: { id: row.id } })).claimToken).toBe('active-worker')
  expect(await prisma.activityLog.count({ where: { entityId: row.id } })).toBe(0)
})

test('concurrent administrators can commit only one decision for the reviewed version', async () => {
  const { row, input } = await fixture()
  const results = await Promise.allSettled([
    reconcileBookingEmail(actorId, { ...input, decision: 'accepted', providerMessageId: 'verified-provider-id' }),
    reconcileBookingEmail(actorId, { ...input, decision: 'stopped' }),
  ])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  expect(await prisma.activityLog.count({ where: { entityId: row.id, entityType: 'booking_email' } })).toBe(1)
})

test.each(['USER', 'closed'] as const)('a stale %s administrator cannot reconcile delivery', async state => {
  const { row, input } = await fixture()
  await prisma.user.update({ where: { id: actorId }, data: state === 'closed' ? { closedAt: new Date() } : { role: 'USER' } })
  try {
    await expect(reconcileBookingEmail(actorId, { ...input, decision: 'stopped' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await prisma.bookingEmail.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('REVIEW')
    expect(await prisma.activityLog.count({ where: { entityId: row.id } })).toBe(0)
  } finally { await prisma.user.update({ where: { id: actorId }, data: { role: 'ADMIN', closedAt: null } }) }
})

test('an owner change, unattempted acceptance or terminal stop cannot be submitted', async () => {
  const { input } = await fixture({ attempts: 0 })
  await expect(reconcileBookingEmail(actorId, { ...input, ownerId: customerId, decision: 'stopped' })).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
  await expect(reconcileBookingEmail(actorId, { ...input, decision: 'accepted', providerMessageId: 'verified-provider-id' })).rejects.toMatchObject({ code: 'EMAIL_DECISION_UNAVAILABLE' })
  const terminal = await fixture({ status: 'SENT' })
  await expect(reconcileBookingEmail(actorId, { ...terminal.input, decision: 'stopped' })).rejects.toMatchObject({ code: 'EMAIL_DECISION_UNAVAILABLE' })
})

test('an audit failure rolls the delivery decision back atomically', async () => {
  const { row, input } = await fixture()
  const name = `test_email_audit_${randomUUID().replace(/-/g, '')}`
  await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" ADD CONSTRAINT "${name}" CHECK (false) NOT VALID`)
  try { await expect(reconcileBookingEmail(actorId, { ...input, decision: 'accepted', providerMessageId: 'verified-provider-id' })).rejects.toThrow() }
  finally { await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" DROP CONSTRAINT "${name}"`) }
  const saved = await prisma.bookingEmail.findUniqueOrThrow({ where: { id: row.id } })
  expect(saved.status).toBe('REVIEW')
  expect(saved.providerMessageId).toBeNull()
  expect(saved.sentAt).toBeNull()
  expect(await prisma.activityLog.count({ where: { entityId: row.id } })).toBe(0)
})

test('staff reconciliation fences a real dispatcher reply after its expired lease, then records the verified late acceptance', async () => {
  const { row, booking } = await fixture({ status: 'PENDING' })
  let entered!: () => void, finish!: (value: { success: boolean; id: string }) => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const blocked = new Promise<{ success: boolean; id: string }>(resolve => { finish = resolve })
  email.sendBookingNotice.mockImplementationOnce(() => { entered(); return blocked })
  const work = drainBookingEmails({ bookingId: booking.id })
  await started
  try {
    const active = await prisma.bookingEmail.findUniqueOrThrow({ where: { id: row.id } })
    await expect(reconcileBookingEmail(actorId, { ownerId: actorId, id: row.id, version: (await loadBookingEmailReview(active.id))!.version, reason: 'Reviewing active delivery', decision: 'stopped' })).rejects.toMatchObject({ code: 'EMAIL_BUSY' })
    const expired = await prisma.bookingEmail.update({ where: { id: row.id }, data: { leaseUntil: new Date(Date.now() - 1000) } })
    await reconcileBookingEmail(actorId, { ownerId: actorId, id: row.id, version: (await loadBookingEmailReview(expired.id))!.version, reason: 'Stop unresolved retries after lease expiry', decision: 'stopped' })
  } finally { finish({ success: true, id: 'verified-late-provider-id' }) }
  expect((await work).busy).toBe(1)
  const stopped = await prisma.bookingEmail.findUniqueOrThrow({ where: { id: row.id } })
  expect(stopped.status).toBe('SKIPPED')
  await reconcileBookingEmail(actorId, { ownerId: actorId, id: row.id, version: (await loadBookingEmailReview(stopped.id))!.version, reason: 'Verified the late provider acceptance', decision: 'accepted', providerMessageId: 'verified-late-provider-id' })
  expect(email.sendBookingNotice).toHaveBeenCalledTimes(1)
  expect((await prisma.bookingEmail.findUniqueOrThrow({ where: { id: row.id } })).providerMessageId).toBe('verified-late-provider-id')
  expect(await prisma.activityLog.count({ where: { entityId: row.id, entityType: 'booking_email' } })).toBe(2)
})
