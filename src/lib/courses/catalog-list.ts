type CatalogParams = Record<string, string | string[] | undefined>

/** Ignore repeated or malformed catalog query parameters. */
export function parseCourseCatalogParams(params: CatalogParams) {
  const rawQuery = params.q
  const query = typeof rawQuery === 'string' ? rawQuery.trim().slice(0, 120) : ''
  const rawPage = params.page
  const parsedPage = typeof rawPage === 'string' && /^[1-9]\d{0,3}$/.test(rawPage) ? Number(rawPage) : 1
  const page = Number.isSafeInteger(parsedPage) && parsedPage <= 1000 ? parsedPage : 1
  return { query, page }
}

/** Preserve a safe search term across pagination without leaking other query fields. */
export function courseCatalogHref(query: string, page: number) {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (page > 1) params.set('page', String(page))
  return `/courses${params.size ? `?${params}` : ''}`
}
