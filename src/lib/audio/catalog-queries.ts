export type AudioSort = 'newest' | 'shortest' | 'longest'
type RawParams = Record<string, string | string[] | undefined>
export type AudioCatalogParams = { q: string; category: string; sort: AudioSort; page: number }

/**
 * Public catalog search uses single bounded values, never arbitrary arrays,
 * malformed page offsets, or user-selected Prisma ordering fields.
 */
export function parseAudioCatalogParams(params: RawParams): AudioCatalogParams {
  const single = (value: string | string[] | undefined) =>
    typeof value === 'string' ? value.trim() : ''
  const q = single(params.q).slice(0, 120)
  const category = single(params.category).slice(0, 80)
  const requestedSort = single(params.sort)
  const sort: AudioSort = requestedSort === 'shortest' || requestedSort === 'longest'
    ? requestedSort : 'newest'
  const rawPage = single(params.page)
  const page = /^[1-9]\d{0,3}$/.test(rawPage) && Number(rawPage) <= 1000 ? Number(rawPage) : 1
  return { q, category, sort, page }
}

/** Construct links from only the supported public audio filters. */
export function audioCatalogHref(params: AudioCatalogParams) {
  const values = new URLSearchParams()
  if (params.category) values.set('category', params.category)
  if (params.q) values.set('q', params.q)
  if (params.sort !== 'newest') values.set('sort', params.sort)
  if (params.page > 1) values.set('page', String(params.page))
  return `/audio${values.size ? `?${values}` : ''}`
}
