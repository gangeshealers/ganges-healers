import type { Prisma } from '@prisma/client'

export const ADMIN_BOOKING_PAGE_SIZE = 25
export const ADMIN_BOOKING_MAX_PAGE = 1000
export const ADMIN_BOOKING_SCOPES = ['upcoming', 'past', 'all'] as const
export const ADMIN_BOOKING_STATUSES = ['all', 'pending', 'scheduled', 'confirmed', 'rescheduled', 'completed', 'cancelled'] as const

export type AdminBookingScope = (typeof ADMIN_BOOKING_SCOPES)[number]
export type AdminBookingStatus = (typeof ADMIN_BOOKING_STATUSES)[number]

export function parseAdminBookingFilters(input: { scope?: unknown; status?: unknown; q?: unknown; page?: unknown }) {
  const scope: AdminBookingScope = typeof input.scope === 'string' &&
    ADMIN_BOOKING_SCOPES.includes(input.scope as AdminBookingScope)
    ? input.scope as AdminBookingScope : 'upcoming'
  const status: AdminBookingStatus = typeof input.status === 'string' &&
    ADMIN_BOOKING_STATUSES.includes(input.status as AdminBookingStatus)
    ? input.status as AdminBookingStatus : 'all'
  const query = typeof input.q === 'string' ? input.q.trim().slice(0, 100) : ''
  const page = typeof input.page === 'string' && /^[1-9]\d{0,3}$/.test(input.page)
    ? Math.min(Number(input.page), ADMIN_BOOKING_MAX_PAGE) : 1
  return { scope, status, query, page }
}

export function adminBookingHref(scope: AdminBookingScope, status: AdminBookingStatus, query: string, page = 1) {
  const params = new URLSearchParams()
  if (scope !== 'upcoming') params.set('scope', scope)
  if (status !== 'all') params.set('status', status)
  if (query) params.set('q', query)
  if (page > 1) params.set('page', String(page))
  const suffix = params.toString()
  return '/admin/bookings' + (suffix ? '?' + suffix : '')
}

/**
 * Administrator-only query; the page must authorize with requireCurrentAdmin
 * BEFORE using this helper. q searches a booking ID exactly, not account PII.
 */
export function adminBookingWhere(scope: AdminBookingScope, status: AdminBookingStatus, query: string, now = new Date()): Prisma.BookingWhereInput {
  return {
    ...(scope === 'upcoming' ? { scheduledAt: { gte: now } } : scope === 'past' ? { scheduledAt: { lt: now } } : {}),
    ...(status !== 'all' ? { status: status.toUpperCase() as Exclude<Uppercase<AdminBookingStatus>, 'ALL'> } : {}),
    ...(query ? { id: query } : {}),
  }
}
