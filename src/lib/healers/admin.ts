import { createHash } from 'node:crypto'
import type { Healer, Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { healerProfileFields } from './profile-schema'
import { lockTransaction } from '@/lib/db/locks'

export class HealerAdminError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); this.name = 'HealerAdminError' }
}

const reviewedHealer = z.object({ id: z.string().min(1).max(200), version: z.string().regex(/^[a-f0-9]{64}$/) })
const versionFields = ['id', 'userId', 'bio', 'experienceYears', 'rating', 'certifications', 'availability', 'specializations', 'isActive', 'isVerified', 'createdAt', 'updatedAt'] as const satisfies readonly (keyof Healer)[]

/** Bind staff decisions to the reviewed profile, including same-timestamp changes. */
export function healerCatalogVersion(healer: Healer) {
  return createHash('sha256').update(JSON.stringify(versionFields.map(key => healer[key]))).digest('hex')
}

function profileFromForm(form: FormData) {
  const bio = form.get('bio'), experience = form.get('experienceYears'), specializations = form.get('specializations')
  const parsed = healerProfileFields.safeParse({
    bio: typeof bio === 'string' ? bio || null : undefined,
    experienceYears: typeof experience === 'string' && /^\d+$/.test(experience.trim()) ? Number(experience) : undefined,
    specializations: typeof specializations === 'string' ? specializations.split(',').map(value => value.trim()).filter(Boolean) : undefined,
  })
  if (!parsed.success) throw new HealerAdminError('Enter 0–100 whole years of experience, a bio of up to 2,000 characters, and up to 20 specializations of 100 characters each.', 400, 'INVALID_HEALER_FIELDS')
  return parsed.data
}

async function currentAccount(tx: Prisma.TransactionClient, id: string) {
  const [account] = await tx.$queryRaw<Array<{ role: string; closedAt: Date | null }>>`SELECT "role", "closedAt" FROM "User" WHERE "id" = ${id} FOR SHARE`
  return account
}

/** Save only the reviewed catalog decision, preserving delivery records and atomic audits. */
export async function writeHealerCatalog(actorId: string, form: FormData, operation: 'profile' | 'active' | 'verified') {
  if (form.get('ownerId') !== actorId) throw new HealerAdminError('Your account changed. Reload this page before saving.', 409, 'SESSION_CHANGED')
  const input = reviewedHealer.safeParse({ id: form.get('id'), version: form.get('version') })
  if (!input.success) throw new HealerAdminError('Reload and review this healer before saving.', 400, 'INVALID_HEALER_VERSION')
  const fields = operation === 'profile' ? profileFromForm(form) : null
  return prisma.$transaction(async tx => {
    await lockTransaction(tx, 'healer', input.data.id)
    await tx.$queryRaw`SELECT "id" FROM "Healer" WHERE "id" = ${input.data.id} FOR UPDATE`
    const actor = await currentAccount(tx, actorId)
    if (actor?.role !== 'ADMIN' || actor.closedAt) throw new HealerAdminError('Administrator access is required.', 403, 'FORBIDDEN')
    const healer = await tx.healer.findUnique({ where: { id: input.data.id } })
    if (!healer) throw new HealerAdminError('This healer profile no longer exists. Reload the list.', 404, 'HEALER_NOT_FOUND')
    const account = await currentAccount(tx, healer.userId)
    if (account?.role !== 'HEALER' || account.closedAt) throw new HealerAdminError('This account is no longer available for healer catalog changes. Reload the list.', 409, 'HEALER_ACCOUNT_CHANGED')
    if (healerCatalogVersion(healer) !== input.data.version) throw new HealerAdminError('This healer profile changed. Reload and review the latest values before saving.', 409, 'HEALER_CHANGED')
    const data = fields ?? (operation === 'active' ? { isActive: !healer.isActive } : { isVerified: !healer.isVerified })
    const saved = await tx.healer.update({ where: { id: healer.id }, data })
    const action = operation === 'profile' ? 'healer_profile_updated' : operation === 'active'
      ? saved.isActive ? 'healer_activated' : 'healer_deactivated'
      : saved.isVerified ? 'healer_verified' : 'healer_unverified'
    await tx.activityLog.create({ data: { userId: actorId, action, entityType: 'healer', entityId: healer.id,
      metadata: { fields: Object.keys(data), activeBefore: healer.isActive, activeAfter: saved.isActive, verifiedBefore: healer.isVerified, verifiedAfter: saved.isVerified } } })
    return saved
  }, { maxWait: 10000, timeout: 10000 })
}
