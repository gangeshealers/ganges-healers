import type { Prisma } from '@prisma/client'

export const BOOKING_HISTORY_PAGE_SIZE = 20
export const BOOKING_HISTORY_MAX_PAGE = 1000
export const BOOKING_HISTORY_FILTERS = ['all', 'completed', 'cancelled'] as const
export type BookingHistoryFilter = (typeof BOOKING_HISTORY_FILTERS)[number]

export function parseBookingHistoryFilters(input: { status?: unknown; page?: unknown; q?: unknown }) {
  const status: BookingHistoryFilter =
    typeof input.status === 'string' && BOOKING_HISTORY_FILTERS.includes(input.status as BookingHistoryFilter)
      ? input.status as BookingHistoryFilter : 'all'
  const page = typeof input.page === 'string' && /^[1-9]\d{0,3}$/.test(input.page)
    ? Math.min(Number(input.page), BOOKING_HISTORY_MAX_PAGE) : 1
  const query = typeof input.q === 'string' ? input.q.trim().slice(0, 80) : ''
  return { status, page, query }
}

export function bookingHistoryHref(status: BookingHistoryFilter, query: string, page = 1) {
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)
  if (query) params.set('q', query)
  if (page > 1) params.set('page', String(page))
  const suffix = params.toString()
  return '/dashboard/bookings/history' + (suffix ? '?' + suffix : '')
}

/**
 * Booking history is owner-bound and read-only. It includes every appointment
 * whose scheduled start is past, plus terminal (cancelled/completed) bookings.
 * Active future appointments remain in the existing booking management page.
 */
export function bookingHistoryWhere(userId: string, status: BookingHistoryFilter, query: string, now = new Date()): Prisma.BookingWhereInput {
  return {
    userId,
    OR: [{ scheduledAt: { lt: now } }, { status: { in: ['COMPLETED', 'CANCELLED'] } }],
    ...(status !== 'all' ? { status: status.toUpperCase() as 'COMPLETED' | 'CANCELLED' } : {}),
    ...(query ? { service: { name: { contains: query, mode: 'insensitive' } } } : {}),
  }
}


export const BOOKING_HISTORY_EXPORT_LIMIT = 1000

export type BookingHistoryExportRow = {
  id: string
  scheduledAt: Date
  durationMin: number
  status: string
  service: { name: string }
  healer: { user: { name: string | null } }
}
function csvCell(value: string) {
  // Spreadsheet clients must not execute imported text as a formula.
  const escaped = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? "'" + value : value
  return '"' + escaped.replace(/"/g, '""') + '"'
}

/** Owner-readable booking metadata only; intentionally omits member PII and meeting URLs. */
export function bookingHistoryCsv(rows: BookingHistoryExportRow[]) {
  const header = ['Appointment At (UTC)', 'Service', 'Practitioner', 'Status', 'Duration (minutes)', 'Booking Reference']
  const data = rows.map(row => [
    row.scheduledAt.toISOString(), row.service.name, row.healer.user.name || 'Practitioner',
    row.status, String(row.durationMin), row.id,
  ].map(csvCell).join(','))
  return '\uFEFF' + [header.map(csvCell).join(','), ...data].join('\r\n') + '\r\n'
}

export function bookingHistoryExportHref(status: BookingHistoryFilter, query: string) {
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)
  if (query) params.set('q', query)
  const suffix = params.toString()
  return '/api/bookings/history/export' + (suffix ? '?' + suffix : '')
}
