type SearchValue = string | string[] | null | undefined

export function parseCatalogPrice(value: SearchValue): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return
  const price = Number(value)
  if (Number.isFinite(price) && price >= 0) return price
}

export function parseMinimumServiceRating(value: SearchValue): number | undefined {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim())) return
  const rating = Number(value)
  if (rating >= 1 && rating <= 5 && Math.round(rating * 10) / 10 === rating) return rating
}

/** Bound public service catalog pages to keep Prisma skip values predictable. */
export function parseCatalogPage(value: SearchValue): number {
  if (typeof value !== 'string' || !/^[1-9]\d{0,3}$/.test(value.trim())) return 1
  const page = Number(value.trim())
  return Number.isSafeInteger(page) && page <= 1000 ? page : 1
}

/** Public catalog sort options, shared by the server query and filter UI. */
export type ServiceCatalogSort = 'newest' | 'popular' | 'price_asc' | 'price_desc'

export function parseServiceCatalogSort(value: SearchValue): ServiceCatalogSort {
  if (value === 'popular' || value === 'price_asc' || value === 'price_desc') return value
  return 'newest'
}
