import type { Prisma } from '@prisma/client'

export const ADMIN_MEMBERS_PAGE_SIZE = 50
export const ADMIN_MEMBERS_MAX_PAGE = 1000
export const ADMIN_MEMBERS_ROLES = ['all', 'user', 'healer', 'admin'] as const
export type AdminMembersRole = (typeof ADMIN_MEMBERS_ROLES)[number]

export function parseAdminMembersQuery(input: { q?: unknown; role?: unknown; page?: unknown }) {
  const query = typeof input.q === 'string' ? input.q.trim().slice(0, 100) : ''
  const role: AdminMembersRole = typeof input.role === 'string' &&
    ADMIN_MEMBERS_ROLES.includes(input.role as AdminMembersRole)
    ? input.role as AdminMembersRole : 'all'
  const page = typeof input.page === 'string' && /^[1-9]\d{0,3}$/.test(input.page)
    ? Math.min(Number(input.page), ADMIN_MEMBERS_MAX_PAGE) : 1
  return { query, role, page }
}

/** Escape SQL LIKE metacharacters passed via Prisma "contains" (case-insensitive). */
function literalContains(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

export function adminMembersWhere(query: string, role: AdminMembersRole): Prisma.UserWhereInput {
  return {
    ...(role !== 'all' ? { role: role.toUpperCase() as 'USER' | 'HEALER' | 'ADMIN' } : {}),
    ...(query ? { OR: [
      { id: query },
      { email: { contains: literalContains(query), mode: 'insensitive' } },
      { name: { contains: literalContains(query), mode: 'insensitive' } },
    ] } : {}),
  }
}

export function adminMembersHref(role: AdminMembersRole, query: string, page = 1) {
  const params = new URLSearchParams()
  if (role !== 'all') params.set('role', role)
  if (query) params.set('q', query)
  if (page > 1) params.set('page', String(page))
  const suffix = params.toString()
  return '/admin' + (suffix ? '?' + suffix : '')
}
