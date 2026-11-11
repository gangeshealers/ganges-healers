import type { Prisma } from '@prisma/client'

export const HEALER_HISTORY_PAGE_SIZE = 20
export const HEALER_HISTORY_MAX_PAGE = 1000
export const HEALER_HISTORY_STATUSES = ['all', 'completed', 'cancelled'] as const
export type HealerHistoryStatus = (typeof HEALER_HISTORY_STATUSES)[number]

export function parseHealerHistory(input: { status?: unknown; q?: unknown; page?: unknown }) {
  const status: HealerHistoryStatus = typeof input.status === 'string' &&
    HEALER_HISTORY_STATUSES.includes(input.status as HealerHistoryStatus)
    ? input.status as HealerHistoryStatus : 'all'
  const query = typeof input.q === 'string' ? input.q.trim().slice(0, 80) : ''
  const page = typeof input.page === 'string' && /^[1-9]\d{0,3}$/.test(input.page)
    ? Math.min(Number(input.page), HEALER_HISTORY_MAX_PAGE) : 1
  return { status, query, page }
}

export function healerHistoryHref(status: HealerHistoryStatus, query = '', page = 1) {
  const qs = new URLSearchParams()
  if (status !== 'all') qs.set('status', status)
  if (query) qs.set('q', query)
  if (page > 1) qs.set('page', String(page))
  return '/healer/bookings/history' + (qs.size ? '?' + qs.toString() : '')
}

export function healerHistoryWhere(healerId: string, status: HealerHistoryStatus, query: string, now = new Date()): Prisma.BookingWhereInput {
  return {
    healerId,
    OR: [{ scheduledAt: { lt: now } }, { status: { in: ['COMPLETED', 'CANCELLED'] } }],
    ...(status !== 'all' ? { status: status.toUpperCase() as 'COMPLETED' | 'CANCELLED' } : {}),
    ...(query ? { service: { name: { contains: query, mode: 'insensitive' } } } : {}),
  }
}
