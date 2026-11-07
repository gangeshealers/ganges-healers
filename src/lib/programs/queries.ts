import { prisma } from '@/lib/prisma'
import type { Prisma, Program } from '@prisma/client'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { lockTransaction } from '@/lib/db/locks'
import { cacheDeleteByPrefix } from '@/lib/cache'
import { programFields } from './schedule'

export type ProgramListItem = {
  id: string
  slug: string
  title: string
  shortDescription: string
  sessionsCount: number
  sessionsPerWeek: number
  durationMinutes: number
  pricePaise: number
  heroImageUrl: string | null
  ratingAvg: number | null
}

export type ProgramDetail = ProgramListItem & {
  longDescription: string
  // Optional: if program is associated with a Service, expose its slug for UI-only navigation
  serviceSlug?: string | null
  // curriculum?: Array<{ title: string; minutes?: number }>
}

export async function listPrograms(params?: { serviceSlug?: string; q?: string; limit?: number; cursor?: string }): Promise<{ items: ProgramListItem[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(params?.limit ?? 20, 50))
  const q = params?.q?.trim()
  // Note: serviceSlug filtering omitted (no Program→Service relation in current schema)

  const where: any = { isActive: true } // eslint-disable-line @typescript-eslint/no-explicit-any
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ]
  }

  const cursor = params?.cursor ? { id: params.cursor } : undefined
  const rows = await prisma.program.findMany({
    where,
    orderBy: { id: 'asc' },
    ...(cursor ? { cursor, skip: 1 } : {}),
    take: limit,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      pricePaise: true,
      totalSessions: true,
      sessionsPerWeek: true,
      durationMinutes: true,
    },
  })

  const items: ProgramListItem[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    shortDescription: (r.description || '').slice(0, 180),
    sessionsCount: r.totalSessions,
    sessionsPerWeek: r.sessionsPerWeek,
    durationMinutes: r.durationMinutes,
    pricePaise: r.pricePaise,
    heroImageUrl: null,
    ratingAvg: null,
  }))
  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null
  return { items, nextCursor }
}

export async function getProgramBySlug(slug: string): Promise<ProgramDetail | null> {
  const r = await prisma.program.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      pricePaise: true,
      totalSessions: true,
      sessionsPerWeek: true,
      durationMinutes: true,
    },
  })
  if (!r) return null
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    shortDescription: (r.description || '').slice(0, 180),
    longDescription: r.description,
    sessionsCount: r.totalSessions,
    sessionsPerWeek: r.sessionsPerWeek,
    durationMinutes: r.durationMinutes,
    pricePaise: r.pricePaise,
    heroImageUrl: null,
    ratingAvg: null,
    serviceSlug: null,
  }
}

export class ProgramAdminError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); this.name = 'ProgramAdminError' }
}

const versionFields = ['id', 'slug', 'title', 'description', 'pricePaise', 'totalSessions', 'sessionsPerWeek', 'durationMinutes', 'isActive', 'createdAt', 'updatedAt'] as const satisfies readonly (keyof Program)[]
const reviewSchema = z.object({ id: z.string().min(1).max(200), version: z.string().regex(/^[a-f0-9]{64}$/) })

/** Include content so same-timestamp catalog edits also invalidate an open decision. */
export function programCatalogVersion(program: Program) {
  return createHash('sha256').update(JSON.stringify(versionFields.map(key => program[key]))).digest('hex')
}

async function currentProgramAdmin(tx: Prisma.TransactionClient, actorId: string) {
  const [actor] = await tx.$queryRaw<Array<{ role: string; closedAt: Date | null }>>`SELECT "role", "closedAt" FROM "User" WHERE "id" = ${actorId} FOR SHARE`
  if (actor?.role !== 'ADMIN' || actor.closedAt) throw new ProgramAdminError('Administrator access is required.', 403, 'FORBIDDEN')
}

async function reviewedProgram(tx: Prisma.TransactionClient, actorId: string, id: string, version?: string) {
  const parsed = reviewSchema.safeParse({ id, version })
  if (!parsed.success) throw new ProgramAdminError('Reload and review this program before saving.', 400, 'INVALID_PROGRAM_VERSION')
  await lockTransaction(tx, 'program', `catalog:${id}`)
  // Also wait for the key-share lock taken by enrollment FK inserts outside the app allocator.
  await tx.$queryRaw`SELECT "id" FROM "Program" WHERE "id" = ${id} FOR UPDATE`
  await currentProgramAdmin(tx, actorId)
  const program = await tx.program.findUnique({ where: { id } })
  if (!program) throw new ProgramAdminError('This program is no longer available. Reload the list.', 404, 'PROGRAM_NOT_FOUND')
  if (programCatalogVersion(program) !== version) throw new ProgramAdminError('This program changed. Reload and review the latest values before saving.', 409, 'PROGRAM_CHANGED')
  return program
}

function refreshProgramCaches() {
  cacheDeleteByPrefix('programs:'); cacheDeleteByPrefix('search:')
}

/** Validate, authorize and audit catalog writes without changing saved purchase terms. */
export async function writeProgramCatalog(actorId: string, input: unknown, id?: string, version?: string) {
  const parsed = (id !== undefined ? programFields.omit({ slug: true }) : programFields).safeParse(input)
  if (!parsed.success) throw new ProgramAdminError('Check the title, description and numbers. Use a positive program price, 1–366 sessions, 1–7 sessions per week and 1–1440 minutes per session.', 400, 'INVALID_PROGRAM_FIELDS')
  const saved = await prisma.$transaction(async tx => {
    const current = id !== undefined ? await reviewedProgram(tx, actorId, id, version) : null
    if (!current) await currentProgramAdmin(tx, actorId)
    const program = current
      ? await tx.program.update({ where: { id: current.id }, data: parsed.data })
      : await tx.program.create({ data: programFields.parse(input) })
    await tx.activityLog.create({ data: { userId: actorId, action: current ? 'program_updated' : 'program_created', entityType: 'program', entityId: program.id,
      metadata: { fields: Object.keys(parsed.data), priceBefore: current?.pricePaise ?? null, priceAfter: program.pricePaise, sessionsBefore: current?.totalSessions ?? null, sessionsAfter: program.totalSessions } } })
    return program
  }, { maxWait: 10000, timeout: 10000 })
  refreshProgramCaches()
  return saved
}

/** Remove only an unused reviewed program; enrollment/payment history requires archival. */
export async function archiveProgramCatalog(actorId: string, id: string, expectedActive?: boolean, version?: string) {
  const saved = await prisma.$transaction(async tx => {
    const program = await reviewedProgram(tx, actorId, id, version)
    if (expectedActive !== undefined) {
      if (program.isActive !== expectedActive) throw new ProgramAdminError('This program changed. Reload and review the latest values before saving.', 409, 'PROGRAM_CHANGED')
      const updated = await tx.program.update({ where: { id }, data: { isActive: !program.isActive } })
      await tx.activityLog.create({ data: { userId: actorId, action: updated.isActive ? 'program_activated' : 'program_deactivated', entityType: 'program', entityId: id, metadata: { from: program.isActive, to: updated.isActive } } })
      return updated
    }
    const [enrollmentRecords, paymentRecords] = await Promise.all([
      tx.programEnrollment.count({ where: { programId: id } }),
      tx.payment.count({ where: { type: 'PROGRAM', metadata: { path: ['programId'], equals: id } } }),
    ])
    const archived = enrollmentRecords > 0 || paymentRecords > 0
    const result = archived ? await tx.program.update({ where: { id }, data: { isActive: false } }) : await tx.program.delete({ where: { id } })
    await tx.activityLog.create({ data: { userId: actorId, action: archived ? 'program_archived' : 'program_deleted', entityType: 'program', entityId: id, metadata: { enrollmentRecords: enrollmentRecords > 0, paymentRecords: paymentRecords > 0 } } })
    return result
  }, { maxWait: 10000, timeout: 10000 })
  refreshProgramCaches()
  return saved
}
