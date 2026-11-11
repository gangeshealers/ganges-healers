import { randomUUID, createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { POST as enrollProgram } from '@/app/api/programs/[slug]/enroll/route'
import { POST as verifyPayment } from '@/app/api/payments/verify/route'
import { POST as book } from '@/app/api/bookings/route'
import { GET as list } from '@/app/api/program-enrollments/route'
import { GET as detail, PATCH as update } from '@/app/api/program-enrollments/[id]/route'
import { GET as calendar } from '@/app/api/program-enrollments/[id]/sessions/[number]/calendar/route'
import { GET as bookingCalendar } from '@/app/api/bookings/[id]/calendar/route'
import { getHealerAvailability } from '@/lib/availability'
import { buildProgramSchedule } from '@/lib/programs/schedule'
import { archiveProgramCatalog, writeProgramCatalog, programCatalogVersion } from '@/lib/programs/queries'
import { lockTransaction } from '@/lib/db/locks'
import { GET as publicPrograms } from '@/app/api/programs/route'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'

let mockUserId = ''
let mockRole = 'ADMIN'
jest.mock('@/lib/auth', () => ({ auth: async () => mockUserId ? { user: { id: mockUserId, role: mockRole } } : null }))
jest.mock('@/lib/razorpay', () => ({ getRazorpayClient: async () => ({ orders: { create: async (input: { amount: number }) => ({ ...input, id: `order_${randomUUID()}` }) } }) }))
jest.mock('@/lib/analytics/session', () => ({ getSessionId: async () => null, getExperimentVariants: async () => ({}) }))
let adminId = '', ownerId = '', outsiderId = '', staffId = '', otherStaffId = '', healerId = '', otherHealerId = '', serviceId = ''
const programIds: string[] = []
const allDay = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, { start: '10:00', end: '20:00' }]))
const req = (body: unknown) => new Request('http://localhost/api/program-enrollments', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
function change(id: string, body: unknown) { return update(req(body), { params: Promise.resolve({ id }) }) }
const testEpoch = Date.now()
function at(offset = 10, time = '10:00') { return clinicSlotInstant(clinicDate(new Date(testEpoch + offset * 86400000)), time) }
async function fixture(status: 'active' | 'pending_payment' | 'paused' = 'active', total = 2, assigned: string | null = healerId) {
  const p = await prisma.program.create({ data: { title: 'Session Program', slug: `sessions-${randomUUID()}`, description: 'Test', pricePaise: 25000, totalSessions: total, sessionsPerWeek: 2, durationMinutes: 60 } }); programIds.push(p.id)
  return prisma.programEnrollment.create({ data: { userId: ownerId, programId: p.id, status, healerId: assigned, pricePaise: 25000, schedule: buildProgramSchedule(total, 2, 60, at()).sessions }, include: { program: true } })
}
beforeAll(async () => {
  const createUser = (role: 'ADMIN' | 'USER' | 'HEALER') => prisma.user.create({ data: { email: `program-session-${randomUUID()}@example.test`, role, name: role } })
  adminId = (await createUser('ADMIN')).id; ownerId = (await createUser('USER')).id; outsiderId = (await createUser('USER')).id
  staffId = (await createUser('HEALER')).id; otherStaffId = (await createUser('HEALER')).id
  healerId = (await prisma.healer.create({ data: { userId: staffId, availability: allDay, isVerified: true } })).id
  otherHealerId = (await prisma.healer.create({ data: { userId: otherStaffId, availability: allDay, isVerified: true } })).id
  serviceId = (await prisma.service.create({ data: { slug: `session-conflict-${randomUUID()}`, name: 'Booking Conflict', category: 'test', description: 'Test', price: 250, duration: 60 } })).id
})
beforeEach(() => { mockUserId = adminId; mockRole = 'ADMIN' })
afterAll(async () => {
  try {
    await prisma.program.deleteMany({ where: { id: { in: programIds } } })
    await prisma.booking.deleteMany({ where: { healerId: { in: [healerId, otherHealerId] } } })
    await prisma.service.deleteMany({ where: { id: serviceId } })
    await prisma.payment.deleteMany({ where: { userId: { in: [ownerId, adminId] } } })
    await prisma.activityLog.deleteMany({ where: { userId: { in: [adminId, ownerId, outsiderId, staffId, otherStaffId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [adminId, ownerId, outsiderId, staffId, otherStaffId] } } })
  } finally { await prisma.$disconnect() }
})

test('private enrollment lists and detail enforce the current database identity and role', async () => {
  const row = await fixture()
  mockUserId = outsiderId
  expect((await detail(req({}), { params: Promise.resolve({ id: row.id }) })).status).toBe(404)
  expect((await list(new Request('http://localhost/api/program-enrollments?scope=admin'))).status).toBe(403)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at().toISOString() })).status).toBe(403)
  mockUserId = ownerId
  const owned = await list(new Request('http://localhost/api/program-enrollments'))
  expect(owned.status).toBe(200)
  const found = (await owned.json()).items.find((item: { id: string }) => item.id === row.id)
  expect(found.canManage).toBe(false)
  expect(found).not.toHaveProperty('customerEmail')
  expect(found.sessions[0]).toMatchObject({ status: 'proposed', scheduledAt: null })
  mockUserId = ''
  expect((await list(new Request('http://localhost/api/program-enrollments'))).status).toBe(401)
})
test('a confirmed program reservation blocks public availability and ordinary bookings', async () => {
  const row = await fixture()
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at().toISOString() })).status).toBe(200)
  expect((await getHealerAvailability(healerId, clinicDate(at()))).slots.find(slot => slot.time === '10:00')?.available).toBe(false)
  const response = await book(new NextRequest('http://localhost/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ healerId, serviceId, scheduledAt: at().toISOString() }) }))
  expect(response.status).toBe(409)
})
test('ordinary booking and program reservation races cannot both reserve the same interval', async () => {
  const row = await fixture()
  const scheduledAt = at(12).toISOString()
  const responses = await Promise.all([
    change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt }),
    book(new NextRequest('http://localhost/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ healerId, serviceId, scheduledAt }) })),
  ])
  expect(responses.filter(response => response.status === 200 || response.status === 201)).toHaveLength(1)
  expect(responses.filter(response => response.status === 409)).toHaveLength(1)
})
test('concurrent program reservations and repeats cannot create duplicate sessions or overlap', async () => {
  const first = await fixture(), second = await fixture()
  const responses = await Promise.all([change(first.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(14).toISOString() }), change(second.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(14).toISOString() })])
  expect(responses.map(row => row.status).sort()).toEqual([200, 409])
  const winner = responses[0].status === 200 ? first : second
  expect((await change(winner.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(14).toISOString() })).status).toBe(200)
  expect(await prisma.programSession.count({ where: { enrollmentId: winner.id } })).toBe(1)
})
test('rescheduling excludes its own old reservation but cannot overlap another booking', async () => {
  const row = await fixture()
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(16).toISOString() })).status).toBe(200)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(16, '10:30').toISOString() })).status).toBe(200)
  await prisma.booking.create({ data: { userId: ownerId, healerId, serviceId, scheduledAt: at(16, '12:00'), durationMin: 60, pricePaise: 25000 } })
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(16, '12:00').toISOString() })).status).toBe(409)
})
test('cancelling a reservation releases capacity and pausing prevents duplicate checkout', async () => {
  const row = await fixture()
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(18).toISOString() })).status).toBe(200)
  expect((await change(row.id, { action: 'pause' })).status).toBe(409)
  expect((await change(row.id, { action: 'cancel', sessionNumber: 1 })).status).toBe(200)
  expect((await getHealerAvailability(healerId, clinicDate(at(18)))).slots.find(slot => slot.time === '10:00')?.available).toBe(true)
  expect((await change(row.id, { action: 'pause' })).status).toBe(200)
  mockUserId = ownerId
  const retry = await enrollProgram(req({}), { params: Promise.resolve({ slug: row.program.slug }) })
  expect(retry.status).toBe(409); expect((await retry.json()).enrolled).toBe(true)
  mockUserId = adminId
  expect((await change(row.id, { action: 'resume' })).status).toBe(200)
})
test('only an assigned practitioner or admin can complete an ended reservation, once', async () => {
  const row = await fixture('active', 1)
  await prisma.programSession.create({ data: { enrollmentId: row.id, healerId, sessionNumber: 1, durationMin: 60, scheduledAt: new Date(Date.now() - 7200000) } })
  mockUserId = ownerId
  expect((await change(row.id, { action: 'complete', sessionNumber: 1 })).status).toBe(403)
  mockUserId = otherStaffId
  expect((await change(row.id, { action: 'complete', sessionNumber: 1 })).status).toBe(404)
  mockUserId = staffId
  const response = await change(row.id, { action: 'complete', sessionNumber: 1 })
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({ status: 'completed', completedSessions: 1, progressPercent: 100 })
  const repeat = await change(row.id, { action: 'complete', sessionNumber: 1 })
  expect((await repeat.json()).idempotent).toBe(true)
  expect((await prisma.programEnrollment.findUniqueOrThrow({ where: { id: row.id } })).progress).toMatchObject({ sessionsCompleted: 1, percentComplete: 100 })
})
test('unpaid enrollments, future completion, out-of-window dates and unsafe links cannot be forged', async () => {
  const pending = await fixture('pending_payment')
  expect((await change(pending.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(20).toISOString() })).status).toBe(409)
  const row = await fixture()
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(20, '10:10').toISOString() })).status).toBe(409)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(20, '19:30').toISOString() })).status).toBe(409)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 3, scheduledAt: at(20).toISOString() })).status).toBe(409)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(20).toISOString(), meetingLink: 'javascript:alert(1)' })).status).toBe(400)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(20).toISOString() })).status).toBe(200)
  expect((await change(row.id, { action: 'complete', sessionNumber: 1 })).status).toBe(409)
})
test('owned calendar exports use confirmed rows and keep another customer’s enrollment private', async () => {
  const row = await fixture()
  const context = { params: Promise.resolve({ id: row.id, number: '1' }) }
  mockUserId = ownerId
  expect((await calendar(req({}), context)).status).toBe(404)
  mockUserId = adminId
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(22).toISOString(), meetingLink: 'https://example.test/session' })).status).toBe(200)
  mockUserId = ownerId
  const exported = await calendar(req({}), context)
  expect(exported.headers.get('cache-control')).toBe('private, no-store')
  const text = await exported.text(); expect(text).toContain('STATUS:CONFIRMED'); expect(text).toContain('URL:https://example.test/session')
  mockUserId = outsiderId
  expect((await calendar(req({}), context)).status).toBe(404)
})
test('booking calendar access is scoped and preserves tentative/cancelled status', async () => {
  const row = await prisma.booking.create({ data: { userId: ownerId, healerId, serviceId, scheduledAt: at(24), durationMin: 60, pricePaise: 25000 } })
  const context = { params: Promise.resolve({ id: row.id }) }
  mockUserId = ownerId; mockRole = 'USER'
  const own = await bookingCalendar(req({}), context)
  expect(own.status).toBe(200); expect(await own.text()).toContain('STATUS:TENTATIVE')
  mockUserId = outsiderId
  expect((await bookingCalendar(req({}), context)).status).toBe(404)
  await prisma.booking.update({ where: { id: row.id }, data: { status: 'CANCELLED' } })
  mockUserId = ownerId
  expect(await (await bookingCalendar(req({}), context)).text()).toContain('STATUS:CANCELLED')
})
test('catalog edits after checkout cannot alter purchased session count or duration, and assignment preserves payment replay', async () => {
  const row = await fixture('pending_payment', 2, null)
  await prisma.programEnrollment.delete({ where: { id: row.id } })
  mockUserId = ownerId
  const purchase = await enrollProgram(req({}), { params: Promise.resolve({ slug: row.program.slug }) })
  expect(purchase.status).toBe(200)
  const body = await purchase.json()
  await prisma.program.update({ where: { id: row.programId }, data: { totalSessions: 8, durationMinutes: 120, pricePaise: 99000 } })
  const paymentId = `pay_${randomUUID()}`
  const signature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${body.orderId}|${paymentId}`).digest('hex')
  const verified = () => verifyPayment(new Request('http://localhost/api/payments/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: body.orderId, paymentId, signature }) }))
  expect((await verified()).status).toBe(200)
  const before = await prisma.programEnrollment.findUniqueOrThrow({ where: { id: body.enrollmentId } })
  expect((before.schedule as Array<{ durationMinutes: number }>)).toHaveLength(2)
  expect((before.schedule as Array<{ durationMinutes: number }>)[0].durationMinutes).toBe(60)
  mockUserId = adminId
  expect((await change(body.enrollmentId, { action: 'assign', healerId: otherHealerId })).status).toBe(200)
  const assigned = await prisma.programEnrollment.findUniqueOrThrow({ where: { id: body.enrollmentId } })
  expect(assigned.healerId).toBeNull(); expect(assigned.assignedHealerId).toBe(otherHealerId)
  mockUserId = ownerId
  expect((await verified()).status).toBe(200)
  expect(await prisma.payment.count({ where: { userId: ownerId, gatewayOrderId: body.orderId } })).toBe(1)
})
test('catalog deletion archives purchased programs, preserves their sessions and requires an actual admin', async () => {
  const row = await fixture()
  const version = programCatalogVersion(row.program)
  await expect(archiveProgramCatalog(ownerId, row.programId, undefined, version)).rejects.toMatchObject({ status: 403 })
  await expect(writeProgramCatalog(adminId, { title: 'Bad', description: 'Bad', totalSessions: 10000000 }, row.programId)).rejects.toMatchObject({ status: 400 })
  await archiveProgramCatalog(adminId, row.programId, undefined, version)
  expect((await prisma.program.findUniqueOrThrow({ where: { id: row.programId } })).isActive).toBe(false)
  expect(await prisma.programEnrollment.findUnique({ where: { id: row.id } })).not.toBeNull()
})

function catalogFields(change: Record<string, unknown> = {}) {
  return { title: 'Reviewed program', slug: `reviewed-${randomUUID()}`, description: 'Professional program description', pricePaise: 19000, totalSessions: 3, sessionsPerWeek: 1, durationMinutes: 45, ...change }
}
async function unusedProgram() {
  const program = await prisma.program.create({ data: catalogFields() })
  programIds.push(program.id)
  return program
}
const catalogVersion = async (id: string) => programCatalogVersion(await prisma.program.findUniqueOrThrow({ where: { id } }))
async function waitingOnProgram(id: string, advisory = false) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const rows = advisory
      ? await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=72103::oid AND objid=(hashtext(${'catalog:' + id})::bigint & 4294967295)::oid) AS waiting`
      : await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.datname=current_database() AND NOT l.granted AND a.query LIKE ${'%FROM "Program"%FOR UPDATE%'}) AS waiting`
    if (rows[0].waiting) return true
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return false
}

test('reviewed program edits preserve purchased prices, schedules, reservations and payment records', async () => {
  const row = await fixture()
  await prisma.programSession.create({ data: { enrollmentId: row.id, healerId, sessionNumber: 1, durationMin: 60, scheduledAt: at(), status: 'SCHEDULED' } })
  const before = await prisma.programEnrollment.findUniqueOrThrow({ where: { id: row.id }, include: { sessions: true } })
  const payment = await prisma.payment.create({ data: { userId: ownerId, type: 'PROGRAM', gateway: 'razorpay', status: 'success', statusEnum: 'SUCCESS', amountPaise: 25000, metadata: { programId: row.programId, enrollmentId: row.id } } })
  const saved = await writeProgramCatalog(adminId, catalogFields(), row.programId, programCatalogVersion(row.program))
  expect(saved).toMatchObject({ title: 'Reviewed program', slug: row.program.slug, pricePaise: 19000, totalSessions: 3, durationMinutes: 45 })
  expect(await prisma.programEnrollment.findUniqueOrThrow({ where: { id: row.id }, include: { sessions: true } })).toEqual(before)
  expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toEqual(payment)
  const audit = await prisma.activityLog.findFirstOrThrow({ where: { entityId: row.programId, action: 'program_updated' } })
  expect(audit).toMatchObject({ userId: adminId, entityType: 'program', metadata: { priceBefore: 25000, priceAfter: 19000, sessionsBefore: 2, sessionsAfter: 3 } })
  expect(JSON.stringify(audit.metadata)).not.toContain('Professional program description')
})

test('creating and deleting an unused program produces atomic audits and rejects repeated deletion', async () => {
  const created = await writeProgramCatalog(adminId, catalogFields()); programIds.push(created.id)
  expect(await prisma.activityLog.count({ where: { entityId: created.id, action: 'program_created', userId: adminId } })).toBe(1)
  await archiveProgramCatalog(adminId, created.id, undefined, programCatalogVersion(created))
  expect(await prisma.program.findUnique({ where: { id: created.id } })).toBeNull()
  expect(await prisma.activityLog.count({ where: { entityId: created.id, action: 'program_deleted' } })).toBe(1)
  await expect(archiveProgramCatalog(adminId, created.id, undefined, programCatalogVersion(created))).rejects.toMatchObject({ code: 'PROGRAM_NOT_FOUND' })
})

test.each(['pending_payment', 'active', 'paused', 'completed', 'cancelled'] as const)('any %s enrollment requires archival and remains unchanged', async status => {
  const program = await unusedProgram()
  const enrollment = await prisma.programEnrollment.create({ data: { userId: ownerId, programId: program.id, status, pricePaise: 15000, schedule: buildProgramSchedule(2, 1, 60, at()).sessions } })
  expect(await archiveProgramCatalog(adminId, program.id, undefined, programCatalogVersion(program))).toMatchObject({ isActive: false })
  expect(await prisma.programEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).toEqual(enrollment)
  expect(await prisma.activityLog.findFirstOrThrow({ where: { entityId: program.id } })).toMatchObject({ action: 'program_archived', metadata: { enrollmentRecords: true, paymentRecords: false } })
})

test('a program with only legacy payment metadata is archived rather than erased', async () => {
  const program = await unusedProgram()
  const payment = await prisma.payment.create({ data: { userId: ownerId, type: 'PROGRAM', gateway: 'razorpay', status: 'failed', statusEnum: 'FAILED', amountPaise: 19000, metadata: { programId: program.id } } })
  expect(await archiveProgramCatalog(adminId, program.id, undefined, programCatalogVersion(program))).toMatchObject({ isActive: false })
  expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toEqual(payment)
  expect(await prisma.activityLog.findFirstOrThrow({ where: { entityId: program.id } })).toMatchObject({ action: 'program_archived', metadata: { enrollmentRecords: false, paymentRecords: true } })
})

test('same-timestamp edits invalidate old edit, toggle and deletion decisions', async () => {
  const program = await unusedProgram(), version = programCatalogVersion(program)
  const current = await prisma.program.update({ where: { id: program.id }, data: { description: 'Another reviewed description', updatedAt: program.updatedAt } })
  await expect(writeProgramCatalog(adminId, catalogFields(), program.id, version)).rejects.toMatchObject({ code: 'PROGRAM_CHANGED' })
  await expect(archiveProgramCatalog(adminId, program.id, true, version)).rejects.toMatchObject({ code: 'PROGRAM_CHANGED' })
  await expect(archiveProgramCatalog(adminId, program.id, undefined, version)).rejects.toMatchObject({ code: 'PROGRAM_CHANGED' })
  expect(await prisma.program.findUniqueOrThrow({ where: { id: program.id } })).toEqual(current)
  expect(await prisma.activityLog.count({ where: { entityId: program.id } })).toBe(0)
})

test('competing reviewed catalog saves commit only one change and one audit', async () => {
  const program = await unusedProgram(), version = programCatalogVersion(program)
  const results = await Promise.allSettled([writeProgramCatalog(adminId, catalogFields(), program.id, version), archiveProgramCatalog(adminId, program.id, true, version)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.objectContaining({ code: 'PROGRAM_CHANGED' }) })])
  expect(await prisma.activityLog.count({ where: { entityId: program.id } })).toBe(1)
})

test('toggles require the reviewed active state and reject repeats or forged state flags', async () => {
  const program = await unusedProgram(), version = programCatalogVersion(program)
  await expect(archiveProgramCatalog(adminId, program.id, false, version)).rejects.toMatchObject({ code: 'PROGRAM_CHANGED' })
  expect(await archiveProgramCatalog(adminId, program.id, true, version)).toMatchObject({ isActive: false })
  await expect(archiveProgramCatalog(adminId, program.id, true, version)).rejects.toMatchObject({ code: 'PROGRAM_CHANGED' })
  expect(await archiveProgramCatalog(adminId, program.id, false, await catalogVersion(program.id))).toMatchObject({ isActive: true })
  expect(await prisma.activityLog.count({ where: { entityId: program.id } })).toBe(2)
})

test('missing or malformed review versions never edit, toggle or remove a program', async () => {
  const program = await unusedProgram()
  for (const version of [undefined, '', 'not-a-version']) {
    await expect(writeProgramCatalog(adminId, catalogFields(), program.id, version)).rejects.toMatchObject({ code: 'INVALID_PROGRAM_VERSION' })
    await expect(archiveProgramCatalog(adminId, program.id, true, version)).rejects.toMatchObject({ code: 'INVALID_PROGRAM_VERSION' })
    await expect(archiveProgramCatalog(adminId, program.id, undefined, version)).rejects.toMatchObject({ code: 'INVALID_PROGRAM_VERSION' })
  }
  expect(await prisma.program.findUniqueOrThrow({ where: { id: program.id } })).toEqual(program)
})

test('ordinary, revoked and closed administrator accounts cannot create or change catalog entries', async () => {
  const program = await unusedProgram(), version = programCatalogVersion(program)
  const rejectActor = async (actorId: string) => {
    await expect(writeProgramCatalog(actorId, catalogFields())).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(writeProgramCatalog(actorId, catalogFields(), program.id, version)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(archiveProgramCatalog(actorId, program.id, true, version)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(archiveProgramCatalog(actorId, program.id, undefined, version)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  }
  await rejectActor(ownerId); await rejectActor(randomUUID())
  try {
    await prisma.user.update({ where: { id: adminId }, data: { role: 'USER' } }); await rejectActor(adminId)
    await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN', closedAt: new Date() } }); await rejectActor(adminId)
  } finally { await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN', closedAt: null } }) }
  expect(await prisma.program.findUniqueOrThrow({ where: { id: program.id } })).toEqual(program)
})

test('access revoked while waiting for enrollment catalog serialization is checked after the lock', async () => {
  const program = await unusedProgram()
  let acquired!: () => void, release!: () => void
  const locked = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve })
  const blocker = prisma.$transaction(async tx => {
    await lockTransaction(tx, 'program', `catalog:${program.id}`); acquired(); await unlock
    await tx.user.update({ where: { id: adminId }, data: { role: 'USER' } })
  }, { timeout: 15000 })
  await locked
  const editing = writeProgramCatalog(adminId, catalogFields(), program.id, programCatalogVersion(program)).then(() => null).catch((error: unknown) => error)
  try { expect(await waitingOnProgram(program.id, true)).toBe(true) }
  finally { release(); await blocker; await editing; await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } }) }
  expect(await editing).toMatchObject({ code: 'FORBIDDEN' })
  expect(await prisma.program.findUniqueOrThrow({ where: { id: program.id } })).toEqual(program)
})

test('an enrollment holding only its foreign-key lock commits before removal checks for purchases', async () => {
  const program = await unusedProgram()
  let acquired!: () => void, release!: () => void, enrollmentId = ''
  const locked = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve })
  const purchase = prisma.$transaction(async tx => {
    enrollmentId = (await tx.programEnrollment.create({ data: { userId: ownerId, programId: program.id, pricePaise: 19000, status: 'pending_payment' } })).id
    acquired(); await unlock
  }, { timeout: 15000 })
  await locked
  const removing = archiveProgramCatalog(adminId, program.id, undefined, programCatalogVersion(program)).then(value => ({ value, error: undefined })).catch((error: unknown) => ({ value: undefined, error }))
  try { expect(await waitingOnProgram(program.id)).toBe(true) }
  finally { release(); await purchase; await removing }
  expect((await removing).value).toMatchObject({ id: program.id, isActive: false })
  expect(await prisma.programEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).toMatchObject({ pricePaise: 19000, status: 'pending_payment', programId: program.id })
})

test('audit failure rolls back creation, edits, toggles and deletion', async () => {
  const program = await unusedProgram(), version = programCatalogVersion(program), fields = catalogFields()
  const constraint = `qa_program_${randomUUID().replaceAll('-', '')}`
  await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" ADD CONSTRAINT "${constraint}" CHECK ("entityType" <> 'program' OR "userId" <> '${adminId}') NOT VALID`)
  try {
    await expect(writeProgramCatalog(adminId, fields)).rejects.toThrow()
    expect(await prisma.program.count({ where: { slug: fields.slug } })).toBe(0)
    for (const saving of [() => writeProgramCatalog(adminId, fields, program.id, version), () => archiveProgramCatalog(adminId, program.id, true, version), () => archiveProgramCatalog(adminId, program.id, undefined, version)]) {
      await expect(saving()).rejects.toThrow()
      expect(await prisma.program.findUniqueOrThrow({ where: { id: program.id } })).toEqual(program)
    }
  } finally { await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" DROP CONSTRAINT "${constraint}"`) }
})

test('duplicate slugs roll back a second creation and return the existing uniqueness code', async () => {
  const fields = catalogFields(), program = await writeProgramCatalog(adminId, fields); programIds.push(program.id)
  await expect(writeProgramCatalog(adminId, fields)).rejects.toMatchObject({ code: 'P2002' })
  expect(await prisma.program.count({ where: { slug: fields.slug } })).toBe(1)
  expect(await prisma.activityLog.count({ where: { entityId: program.id } })).toBe(1)
})

test('successful catalog saves clear the local public-list cache so changed titles are discoverable', async () => {
  const title = `Catalog ${randomUUID()}`, program = await writeProgramCatalog(adminId, catalogFields({ title })); programIds.push(program.id)
  const lookup = () => publicPrograms(new NextRequest(`http://localhost/api/programs?${new URLSearchParams({ q: title })}`))
  expect((await (await lookup()).json()).items).toEqual(expect.arrayContaining([expect.objectContaining({ id: program.id })]))
  await writeProgramCatalog(adminId, catalogFields({ title: 'A different program title' }), program.id, programCatalogVersion(program))
  expect((await (await lookup()).json()).items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: program.id })]))
})
