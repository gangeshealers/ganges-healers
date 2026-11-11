export type BlogCatalogInput = Record<string, string | string[] | undefined>

export function parseBlogCatalogParams(input: BlogCatalogInput) {
  const q = typeof input.q === 'string' ? input.q.trim().slice(0, 120) : ''
  const rawPage = input.page
  const page = typeof rawPage === 'string' && /^[1-9]\d{0,3}$/.test(rawPage) && Number(rawPage) <= 1000
    ? Number(rawPage) : 1
  return { q, page }
}

export function blogCatalogHref(q: string, page: number) {
  const values = new URLSearchParams()
  if (q) values.set('q', q)
  if (page > 1) values.set('page', String(page))
  return `/blog${values.size ? `?${values}` : ''}`
}
