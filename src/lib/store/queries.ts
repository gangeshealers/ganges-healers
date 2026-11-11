import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export type ProductSort = 'default' | 'price_asc' | 'price_desc'

/** Invalid sort query values must not alter the public catalog's existing order. */
export function parseProductSort(value: unknown): ProductSort {
  return value === 'price_asc' || value === 'price_desc' ? value : 'default'
}

export type ProductCategoryRef = { slug: string; title: string }

export type ProductListItem = {
  id: string
  slug: string
  title: string
  shortDescription: string
  pricePaise: number
  imageUrl: string | null
  ratingAvg: number | null
  stockStatus: 'IN_STOCK' | 'LOW' | 'OUT'
  isConsecrated: boolean
  chakra: string | null
  category: ProductCategoryRef | null
}

export type ProductDetail = ProductListItem & {
  longDescription: string
  stockCount: number | null
  gallery?: string[]
  spiritualBenefits?: string[]
  ritualUse?: string[]
  consecrationStory?: string | null
  service?: { slug: string; title: string } | null
}

export async function listProducts(params?: { categorySlug?: string; chakra?: string; q?: string; limit?: number; cursor?: string; sort?: ProductSort }): Promise<{ items: ProductListItem[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(params?.limit ?? 20, 50))
  const q = params?.q?.trim()
  const categorySlug = params?.categorySlug?.trim()
  const chakra = params?.chakra?.trim()
  const cursor = params?.cursor ? { id: params.cursor } : undefined
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = params?.sort === 'price_asc'
    ? [{ pricePaise: 'asc' }, { id: 'asc' }]
    : params?.sort === 'price_desc'
      ? [{ pricePaise: 'desc' }, { id: 'asc' }]
      : [{ id: 'asc' }]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { shortDescription: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (categorySlug) {
    where.category = { slug: categorySlug }
  }
  if (chakra) {
    where.chakra = { equals: chakra, mode: 'insensitive' }
  }

  const rows = await prisma.product.findMany({
    where,
    orderBy,
    ...(cursor ? { cursor, skip: 1 } : {}),
    // Fetch an extra row to avoid advertising a next page that is empty.
    take: limit + 1,
    select: {
      id: true,
      slug: true,
      title: true,
      shortDescription: true,
      pricePaise: true,
      imageUrl: true,
      ratingAvg: true,
      stockStatus: true,
      isConsecrated: true,
      chakra: true,
      category: { select: { slug: true, title: true } },
    },
  })

  const pageRows = rows.slice(0, limit)
  const items: ProductListItem[] = pageRows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    shortDescription: r.shortDescription ?? '',
    pricePaise: r.pricePaise ?? 0,
    imageUrl: r.imageUrl ?? null,
    ratingAvg: r.ratingAvg ?? null,
    stockStatus: (r.stockStatus as ProductListItem['stockStatus']) ?? 'IN_STOCK',
    isConsecrated: r.isConsecrated,
    chakra: r.chakra ?? null,
    category: r.category ? { slug: r.category.slug, title: r.category.title } : null,
  }))
  const nextCursor = rows.length > limit ? pageRows[pageRows.length - 1].id : null
  return { items, nextCursor }
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const r = await prisma.product.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      shortDescription: true,
      longDescription: true,
      pricePaise: true,
      imageUrl: true,
      ratingAvg: true,
      stockStatus: true,
      stockCount: true,
      isConsecrated: true,
      chakra: true,
      spiritualBenefits: true,
      ritualUse: true,
      consecrationStory: true,
      gallery: true,
      category: { select: { slug: true, title: true } },
      service: { select: { slug: true, name: true } },
    },
  })
  if (!r) return null
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    shortDescription: r.shortDescription ?? '',
    longDescription: r.longDescription ?? '',
    pricePaise: r.pricePaise ?? 0,
    imageUrl: r.imageUrl ?? null,
    ratingAvg: r.ratingAvg ?? null,
    stockStatus: (r.stockStatus as ProductListItem['stockStatus']) ?? 'IN_STOCK',
    stockCount: r.stockCount ?? null,
    isConsecrated: r.isConsecrated,
    chakra: r.chakra ?? null,
    spiritualBenefits: Array.isArray(r.spiritualBenefits) ? r.spiritualBenefits as string[] : undefined,
    ritualUse: Array.isArray(r.ritualUse) ? r.ritualUse as string[] : undefined,
    consecrationStory: r.consecrationStory ?? null,
    gallery: Array.isArray(r.gallery) ? r.gallery as string[] : undefined,
    category: r.category ? { slug: r.category.slug, title: r.category.title } : null,
    service: r.service ? { slug: r.service.slug, title: r.service.name } : null,
  }
}
