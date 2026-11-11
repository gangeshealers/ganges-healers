import type { Prisma } from '@prisma/client'

export const ADMIN_STORE_ORDER_PAGE_SIZE = 25
export const ADMIN_STORE_ORDER_MAX_PAGE = 1000
export const ADMIN_STORE_ORDER_QUEUES = [
  { status: 'paid', label: 'Awaiting shipment' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'delivered', label: 'Delivered' },
  { status: 'all', label: 'All statuses' },
] as const

export type AdminStoreQueue = (typeof ADMIN_STORE_ORDER_QUEUES)[number]['status']
export function parseAdminStoreOrders(input: { status?: unknown; page?: unknown; q?: unknown }) {
  const queue: AdminStoreQueue = typeof input.status === 'string' &&
    ADMIN_STORE_ORDER_QUEUES.some(x => x.status === input.status)
    ? input.status as AdminStoreQueue : 'paid'
  const page = typeof input.page === 'string' && /^[1-9]\d{0,3}$/.test(input.page)
    ? Math.min(Number(input.page), ADMIN_STORE_ORDER_MAX_PAGE) : 1
  // Order ID is an exact reference; never interpret it as customer-email or SQL syntax.
  const query = typeof input.q === 'string' ? input.q.trim().slice(0, 200) : ''
  return { queue, page, query }
}

export function adminStoreOrdersWhere(queue: AdminStoreQueue, query: string): Prisma.OrderWhereInput {
  return {
    ...(queue === 'paid' || queue === 'shipped' ? { status: queue }
      : queue === 'delivered' ? { status: { in: ['delivered', 'fulfilled'] } } : {}),
    ...(query ? { id: query } : {}),
  }
}

export function adminStoreOrdersHref(queue: AdminStoreQueue, query = '', page = 1) {
  const params = new URLSearchParams()
  if (queue !== 'paid') params.set('status', queue)
  if (query) params.set('q', query)
  if (page > 1) params.set('page', String(page))
  const suffix = params.toString()
  return '/admin/orders' + (suffix ? '?' + suffix : '')
}
