import type { Prisma } from '@prisma/client'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'

export const HEALER_ACTIVITY_PERIODS = ['month', '90days', 'all'] as const
export type HealerActivityPeriod = (typeof HEALER_ACTIVITY_PERIODS)[number]
export const HEALER_ACTIVITY_PAGE_SIZE = 20
export const HEALER_ACTIVITY_MAX_PAGE = 1000
export const HEALER_ACTIVITY_MAX_EXPORT = 1000

export function healerActivityFilters(input: { period?: unknown; page?: unknown }) {
  const period: HealerActivityPeriod = typeof input.period === 'string' &&
    HEALER_ACTIVITY_PERIODS.includes(input.period as HealerActivityPeriod)
    ? input.period as HealerActivityPeriod : 'month'
  const page = typeof input.page === 'string' && /^[1-9]\d{0,3}$/.test(input.page)
    ? Math.min(Number(input.page), HEALER_ACTIVITY_MAX_PAGE) : 1
  return { period, page }
}

export function healerActivityHref(period: HealerActivityPeriod, page = 1) {
  const params = new URLSearchParams({ period })
  if (page > 1) params.set('page', String(page))
  return '/healer/payments?' + params.toString()
}

/** Explicit India calendar month boundary: never depend on the deployment's server timezone. */
export function healerActivityStart(period: HealerActivityPeriod, now = new Date()): Date | undefined {
  if (period === 'all') return undefined
  if (period === '90days') return new Date(now.getTime() - 90 * 86400000)
  const month = clinicDate(now).slice(0, 7) + '-01'
  return clinicSlotInstant(month, '00:00')
}

/** These are gross INR collections for session bookings, NOT a healer payout/commission ledger. */
export function healerActivityWhere(healerId: string, period: HealerActivityPeriod, now = new Date()): Prisma.PaymentWhereInput {
  const start = healerActivityStart(period, now)
  return {
    booking: { healerId },
    statusEnum: 'SUCCESS',
    currency: 'INR',
    ...(start ? { createdAt: { gte: start } } : {}),
  }
}

export type HealerActivityRow = {
  id: string
  createdAt: Date
  amountPaise: number
  booking: { id: string; scheduledAt: Date; service: { name: string } } | null
}

function csvCell(value: string): string {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? "'" + value : value
  return '"' + safe.replace(/"/g, '""') + '"'
}
export function healerActivityCsv(rows: HealerActivityRow[]): string {
  const header = ['Payment Record Created (UTC)', 'Session At (UTC)', 'Service', 'Gross Amount (INR)', 'Booking Reference']
  const data = rows.map(row => [
    row.createdAt.toISOString(),
    row.booking?.scheduledAt.toISOString() ?? '',
    row.booking?.service.name ?? 'Session',
    (row.amountPaise / 100).toFixed(2),
    row.booking?.id ?? '',
  ].map(csvCell).join(','))
  return '\uFEFF' + [header.map(csvCell).join(','), ...data].join('\r\n') + '\r\n'
}
