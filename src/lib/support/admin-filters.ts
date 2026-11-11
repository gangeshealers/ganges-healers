import type { Prisma, SupportTicketStatus } from '@prisma/client'

export const ADMIN_SUPPORT_PAGE_SIZE = 30
export const ADMIN_SUPPORT_MAX_PAGE = 1000
export const ADMIN_SUPPORT_MAX_QUERY = 80
export const ADMIN_SUPPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ALL'] as const
export type AdminSupportStatus = typeof ADMIN_SUPPORT_STATUSES[number]
export type AdminSupportParams = Record<string, string | string[] | undefined>

export function parseAdminSupportFilters(params: AdminSupportParams) {
  const statusInput = typeof params.status === 'string' ? params.status : 'OPEN'
  // Preserve the queue's existing default (OPEN), with "ALL" and unknown explicit values unfiltered.
  const status: AdminSupportStatus = ADMIN_SUPPORT_STATUSES.includes(statusInput as AdminSupportStatus)
    ? statusInput as AdminSupportStatus : 'ALL'
  const q = (typeof params.q === 'string' ? params.q : '').trim().slice(0, ADMIN_SUPPORT_MAX_QUERY)
  const rawPage = typeof params.page === 'string' ? params.page : ''
  const page = /^[1-9]\d{0,3}$/.test(rawPage) && Number(rawPage) <= ADMIN_SUPPORT_MAX_PAGE
    ? Number(rawPage) : 1
  return { status, q, page }
}

/** Escape SQL LIKE wildcard tokens before passing a literal search to Prisma. */
export function escapeSupportTextSearch(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

/** Admin authorization is required *before* calling this read-only predicate. */
export function adminSupportWhere(status: AdminSupportStatus, q: string): Prisma.SupportTicketWhereInput {
  const text = escapeSupportTextSearch(q)
  return {
    ...(status === 'ALL' ? {} : { status: status as SupportTicketStatus }),
    ...(q ? {
      OR: [
        { subject: { contains: text, mode: 'insensitive' } },
        { user: { email: { contains: text, mode: 'insensitive' } } },
        { user: { name: { contains: text, mode: 'insensitive' } } },
      ],
    } : {}),
  }
}

/** Only allow known queue paths and bounded query fields in return navigation. */
export function adminSupportHref(status: AdminSupportStatus, q: string, page = 1, notice?: { updated?: boolean; error?: string }) {
  const params = new URLSearchParams()
  // Explicit ALL must survive navigation; an absent status defaults to OPEN.
  params.set('status', status)
  if (q) params.set('q', q)
  if (page > 1) params.set('page', String(page))
  if (notice?.updated) params.set('updated', '1')
  if (notice?.error && ['stale', 'invalid', 'save'].includes(notice.error)) params.set('error', notice.error)
  const suffix = params.toString()
  return '/admin/support' + (suffix ? '?' + suffix : '')
}
