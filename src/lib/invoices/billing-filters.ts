/** Bounded, shareable filters for a member's invoice history. */
export const BILLING_PAGE_SIZE = 25
export const BILLING_MAX_PAGE = 1000

export const BILLING_TYPES = ['ALL', 'SESSION', 'PROGRAM', 'MEMBERSHIP', 'STORE', 'COURSE'] as const
export type BillingType = (typeof BILLING_TYPES)[number]

export type BillingSearchParams = {
  page?: string | string[]
  type?: string | string[]
  q?: string | string[]
}

export function parseBillingFilters(params: BillingSearchParams = {}) {
  const requestedType = typeof params.type === 'string' ? params.type.toUpperCase() : ''
  const type: BillingType = BILLING_TYPES.find(value => value === requestedType) ?? 'ALL'
  const requestedPage = typeof params.page === 'string' && /^[1-9][0-9]{0,3}$/.test(params.page)
    ? Number(params.page) : 1
  const page = Math.min(requestedPage, BILLING_MAX_PAGE)
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 80) : ''
  return { type, page, query }
}

export function billingPageHref(filters: ReturnType<typeof parseBillingFilters>, page = 1): string {
  const params = new URLSearchParams()
  if (filters.type !== 'ALL') params.set('type', filters.type)
  if (filters.query) params.set('q', filters.query)
  if (page > 1) params.set('page', String(Math.min(Math.max(page, 1), BILLING_MAX_PAGE)))
  const query = params.toString()
  return '/dashboard/billing' + (query ? '?' + query : '')
}

/** Export the complete matching history, not just the visible pagination window. */
export function billingExportHref(filters: ReturnType<typeof parseBillingFilters>): string {
  const params = new URLSearchParams()
  if (filters.type !== 'ALL') params.set('type', filters.type)
  if (filters.query) params.set('q', filters.query)
  const query = params.toString()
  return '/api/invoices/me/export' + (query ? '?' + query : '')
}
