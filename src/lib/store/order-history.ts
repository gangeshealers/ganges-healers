import type { Prisma } from '@prisma/client'

export const ORDER_HISTORY_PAGE_SIZE = 50
export const ORDER_HISTORY_MAX_PAGE = 1000
export const ORDER_HISTORY_MAX_QUERY_LENGTH = 80

export const orderStatusFilters = [
  { value: 'all', label: 'All orders' },
  { value: 'pending_payment', label: 'Pending payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

export type OrderHistoryStatus = (typeof orderStatusFilters)[number]['value']

export type OrderHistorySearchParams = {
  status?: string | string[]
  page?: string | string[]
  q?: string | string[]
}

function single(value: string | string[] | undefined): string | undefined {
  // Ignore duplicate query keys rather than letting one untrusted value win.
  return typeof value === 'string' ? value : undefined
}

/** Normalize URL inputs so search and navigation cannot request unbounded pages. */
export function parseOrderHistoryParams(params: OrderHistorySearchParams) {
  const requestedStatus = single(params.status)
  const status = orderStatusFilters.find(item => item.value === requestedStatus)?.value ?? 'all'
  const q = (single(params.q) ?? '').trim().slice(0, ORDER_HISTORY_MAX_QUERY_LENGTH)
  const requestedPage = single(params.page)
  const parsedPage = requestedPage && /^\d+$/.test(requestedPage) ? Number(requestedPage) : 1
  const page = Number.isSafeInteger(parsedPage)
    ? Math.min(Math.max(parsedPage, 1), ORDER_HISTORY_MAX_PAGE)
    : 1
  return { status, q, page }
}

function escapeLikeLiteral(value: string): string {
  // Prisma's PostgreSQL contains filter uses LIKE; literal %, _ and \ must not act as wildcards.
  return value.replace(/[\\%_]/g, '\\$&')
}

/**
 * Build an owner-scoped order search. An order reference is matched exactly;
 * item search matches the current product title without disclosing other accounts.
 */
export function orderHistoryWhere(
  userId: string,
  status: OrderHistoryStatus,
  q: string,
): Prisma.OrderWhereInput {
  return {
    userId,
    ...(status === 'all' ? {} : { status }),
    ...(q
      ? {
          OR: [
            { id: q },
            {
              items: {
                some: {
                  product: { title: { contains: escapeLikeLiteral(q), mode: 'insensitive' } },
                },
              },
            },
          ],
        }
      : {}),
  }
}

/** Keep the user's search and status intact while navigating pages. */
export function orderHistoryHref(status: OrderHistoryStatus, q: string, page = 1) {
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)
  if (q) params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const suffix = params.toString()
  return '/dashboard/orders' + (suffix ? '?' + suffix : '')
}
