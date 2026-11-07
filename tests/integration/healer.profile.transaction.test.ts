import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PATCH } from '@/app/api/healer/profile/route'
import { healerCatalogVersion, writeHealerCatalog } from '@/lib/healers/admin'

let mockUser = '', mockRole = 'HEALER'
jest.mock('@/lib/auth', () => ({ auth: async () => mockUser ? { user: { id: mockUser, role: mockRole } } : null }))
let userId = '', healerId = '', adminId = ''
const hours = { monday: { start: '09:00', end: '17:00' } }
function save(body: unknown) { return PATCH(new NextRequest('http://localhost/api/healer/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })) }
beforeEach(async () => {
  userId = (await prisma.user.create({ data: { email: `healer-bio-${randomUUID()}@example.test`, name: 'Practitioner', role: 'HEALER', password: 'preserved-credential' } })).id
  healerId = (await prisma.healer.create({ data: { userId, bio: 'Previous bio', experienceYears: 3, availability: hours, certifications: [{ name: 'Saved certificate', issuer: 'Saved issuer' }], isVerified: true } })).id
  adminId = (await prisma.user.create({ data: { email: `healer-admin-${randomUUID()}@example.test`, role: 'ADMIN' } })).id
  mockUser = userId; mockRole = 'HEALER'
})
afterEach(async () => {
  await prisma.activityLog.deleteMany({ where: { userId: { in: [userId, adminId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [userId, adminId] } } })
})
afterAll(async () => { await prisma.$disconnect() })

test('the actual editor payload can clear a bio while saving the other professional fields', async () => {
  const before = await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })
  const account = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const response = await save({ bio: null, experienceYears: 7, certifications: [{ name: 'Updated certificate' }], specializations: ['Reiki', 'Sound Healing'] })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ success: true, data: { id: healerId, bio: null, experienceYears: 7, specializations: ['Reiki', 'Sound Healing'] } })
  const saved = await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })
  expect(saved).toEqual({ ...before, bio: null, experienceYears: 7, certifications: [{ name: 'Updated certificate' }], specializations: ['Reiki', 'Sound Healing'], updatedAt: saved.updatedAt })
  expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(account)
})
test('omitted bios retain the saved text and the existing maximum still rejects oversized drafts', async () => {
  expect((await save({ experienceYears: 5 })).status).toBe(200)
  expect((await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).bio).toBe('Previous bio')
  expect((await save({ bio: 'x'.repeat(2001), experienceYears: 10 })).status).toBe(400)
  expect(await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).toMatchObject({ bio: 'Previous bio', experienceYears: 5 })
})
test('clearing a bio retains the existing owner and current-role checks', async () => {
  mockUser = ''
  expect((await save({ bio: null })).status).toBe(401)
  mockUser = userId; mockRole = 'USER'
  expect((await save({ bio: null })).status).toBe(403)
  mockRole = 'HEALER'
  await prisma.user.update({ where: { id: userId }, data: { role: 'USER' } })
  expect((await save({ bio: null })).status).toBe(403)
  expect((await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).bio).toBe('Previous bio')
})

const operations = ['profile', 'active', 'verified'] as const
async function reviewedForm(change: Record<string, string> = {}) {
  const healer = await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })
  const form = new FormData()
  for (const [key, value] of Object.entries({ id: healerId, ownerId: adminId, version: healerCatalogVersion(healer), bio: '', experienceYears: '9', specializations: 'Yoga, Reiki', ...change })) form.set(key, value)
  return form
}

test('reviewed staff edits preserve credentials, professional extras and approval flags with a safe atomic audit', async () => {
  const before = await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })
  const account = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const saved = await writeHealerCatalog(adminId, await reviewedForm(), 'profile')
  expect(saved).toEqual({ ...before, bio: null, experienceYears: 9, specializations: ['Yoga', 'Reiki'], updatedAt: saved.updatedAt })
  expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(account)
  const audit = await prisma.activityLog.findFirstOrThrow({ where: { entityId: healerId } })
  expect(audit).toMatchObject({ userId: adminId, action: 'healer_profile_updated', entityType: 'healer', metadata: {
    fields: ['bio', 'experienceYears', 'specializations'], activeBefore: true, activeAfter: true, verifiedBefore: true, verifiedAfter: true,
  } })
  expect(JSON.stringify(audit.metadata)).not.toContain('Yoga')
  expect(JSON.stringify(audit.metadata)).not.toContain('Previous bio')
})

test('toggles derive their next value from the reviewed saved state and reject replay', async () => {
  for (const [operation, property, action] of [['active', 'isActive', 'healer_deactivated'], ['verified', 'isVerified', 'healer_unverified']] as const) {
    const form = await reviewedForm({ [property]: 'false' })
    expect(await writeHealerCatalog(adminId, form, operation)).toHaveProperty(property, false)
    await expect(writeHealerCatalog(adminId, form, operation)).rejects.toMatchObject({ code: 'HEALER_CHANGED' })
    expect(await prisma.activityLog.count({ where: { entityId: healerId, action } })).toBe(1)
    expect(await writeHealerCatalog(adminId, await reviewedForm(), operation)).toHaveProperty(property, true)
  }
  expect(await prisma.activityLog.count({ where: { entityId: healerId } })).toBe(4)
})

test('actual practitioner edits invalidate all open staff decisions, even at the same timestamp', async () => {
  const form = await reviewedForm(), before = await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })
  expect((await save({ bio: 'Practitioner draft', certifications: [{ name: 'Updated credential' }] })).status).toBe(200)
  await prisma.healer.update({ where: { id: healerId }, data: { updatedAt: before.updatedAt } })
  const current = await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })
  for (const operation of operations) await expect(writeHealerCatalog(adminId, form, operation)).rejects.toMatchObject({ code: 'HEALER_CHANGED', status: 409 })
  expect(await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).toEqual(current)
  expect(await prisma.activityLog.count({ where: { entityId: healerId } })).toBe(0)
})

test('competing staff decisions commit once and leave one audit', async () => {
  const form = await reviewedForm()
  const results = await Promise.allSettled([writeHealerCatalog(adminId, form, 'profile'), writeHealerCatalog(adminId, form, 'verified')])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.objectContaining({ code: 'HEALER_CHANGED' }) })])
  expect(await prisma.activityLog.count({ where: { entityId: healerId } })).toBe(1)
})

test.each(['', '1.5', '-1', '101', '10years', '1e1', '0x10'])('staff experience rejects malformed or out-of-range values (%s)', async experienceYears => {
  await expect(writeHealerCatalog(adminId, await reviewedForm({ experienceYears }), 'profile')).rejects.toMatchObject({ code: 'INVALID_HEALER_FIELDS' })
  expect((await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).experienceYears).toBe(3)
  expect(await prisma.activityLog.count({ where: { entityId: healerId } })).toBe(0)
})

test('missing, malformed and foreign-account review tokens never write', async () => {
  for (const change of [{ id: '' }, { version: '' }, { version: 'not-a-version' }, { ownerId: userId }] as Record<string, string>[]) {
    for (const operation of operations) await expect(writeHealerCatalog(adminId, await reviewedForm(change), operation)).rejects.toMatchObject({ status: expect.any(Number) })
  }
  for (const operation of operations) await expect(writeHealerCatalog(adminId, await reviewedForm({ id: randomUUID() }), operation)).rejects.toMatchObject({ code: 'HEALER_NOT_FOUND' })
  expect(await prisma.activityLog.count({ where: { entityId: healerId } })).toBe(0)
})

test('ordinary, missing, revoked and closed actors cannot change healer catalog records', async () => {
  const before = await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })
  for (const actor of [userId, randomUUID()]) for (const operation of operations) {
    await expect(writeHealerCatalog(actor, await reviewedForm({ ownerId: actor }), operation)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  }
  for (const change of [{ role: 'USER' as const }, { role: 'ADMIN' as const, closedAt: new Date() }]) {
    await prisma.user.update({ where: { id: adminId }, data: change })
    for (const operation of operations) await expect(writeHealerCatalog(adminId, await reviewedForm(), operation)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  }
  expect(await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).toEqual(before)
})

test('closed or no-longer-healer accounts cannot be reactivated, verified or edited', async () => {
  const form = await reviewedForm()
  for (const change of [{ role: 'USER' as const }, { role: 'HEALER' as const, closedAt: new Date() }]) {
    await prisma.user.update({ where: { id: userId }, data: change })
    for (const operation of operations) await expect(writeHealerCatalog(adminId, form, operation)).rejects.toMatchObject({ code: 'HEALER_ACCOUNT_CHANGED' })
  }
  expect(await prisma.activityLog.count({ where: { entityId: healerId } })).toBe(0)
})

test('administrator access revoked while waiting for the real profile row lock is checked again', async () => {
  const form = await reviewedForm()
  let acquired!: () => void, release!: () => void
  const locked = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve })
  const blocker = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Healer" WHERE "id" = ${healerId} FOR UPDATE`
    acquired(); await unlock
    await tx.user.update({ where: { id: adminId }, data: { role: 'USER' } })
  }, { timeout: 15000 })
  await locked
  const editing = writeHealerCatalog(adminId, form, 'profile').then(() => null).catch((error: unknown) => error)
  try {
    let waiting = false
    for (let attempt = 0; attempt < 200 && !waiting; attempt++) {
      const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.datname=current_database() AND NOT l.granted AND a.query LIKE ${'%FROM "Healer"%FOR UPDATE%'}) AS waiting`
      waiting = rows[0].waiting
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(waiting).toBe(true)
  } finally { release(); await blocker; await editing }
  expect(await editing).toMatchObject({ code: 'FORBIDDEN' })
  expect(await prisma.activityLog.count({ where: { entityId: healerId } })).toBe(0)
})

test('audit failures roll back every healer catalog mutation', async () => {
  const before = await prisma.healer.findUniqueOrThrow({ where: { id: healerId } }), form = await reviewedForm()
  const constraint = `qa_healer_${randomUUID().replaceAll('-', '')}`
  await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" ADD CONSTRAINT "${constraint}" CHECK ("entityId" <> '${healerId}') NOT VALID`)
  try {
    for (const operation of operations) {
      await expect(writeHealerCatalog(adminId, form, operation)).rejects.toThrow()
      expect(await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).toEqual(before)
    }
  } finally { await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" DROP CONSTRAINT "${constraint}"`) }
})
