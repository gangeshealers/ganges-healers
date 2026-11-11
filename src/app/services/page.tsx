// app/services/page.tsx
import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'
import ServicesGrid from '@/components/services/ServicesGrid'
import EmptyState from '@/components/empty/EmptyState'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import ServicesFilter from '@/components/services/ServicesFilter'
import { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeServicesIndexCrumbs } from '@/lib/seo/breadcrumbs'
import { parseCatalogPage, parseCatalogPrice, parseMinimumServiceRating, parseServiceCatalogSort } from '@/lib/services/catalog-filters'
import { Prisma } from '@prisma/client'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Services | Ganges Healers',
    description: 'Explore our range of healing services including Reiki, Hypnotherapy, Yoga Therapy, and more.',
    alternates: { canonical: canonicalOf('/services') },
  }
}

// Keep this dynamic to ensure fresh filtering (or switch to awaited searchParams param style)
export const dynamic = 'force-dynamic'

interface RawService {
  id: string
  name: string
  slug: string
  description: string
  category: string
  image: string | null
  price: number
  duration: number
  _count: { bookings: number }
}

interface UiService {
  id: string
  name: string
  slug: string
  description: string
  category: string
  image?: string
  price: number
  duration: number
  averageRating: number | null
  totalSessions: number
  totalReviews: number
}

const PAGE_SIZE = 12

async function getServices(
  params: Record<string, string | string[] | undefined>,
  minimumRating: number | undefined,
): Promise<{ items: UiService[]; total: number; page: number; totalPages: number }> {
  const single = (value: string | string[] | undefined) => typeof value === 'string' ? value.trim() : ''
  const category = single(params.category)
  const search = (single(params.search) || single(params.q)).slice(0, 200)
  const minPrice = parseCatalogPrice(params.minPrice)
  const maxPrice = parseCatalogPrice(params.maxPrice)
  const requestedPage = parseCatalogPage(params.page)
  const sort = parseServiceCatalogSort(params.sort)
  const orderBy: Prisma.ServiceOrderByWithRelationInput[] = sort === 'popular'
    ? [{ popularity: 'desc' }, { name: 'asc' }, { id: 'asc' }]
    : sort === 'price_asc'
      ? [{ price: 'asc' }, { name: 'asc' }, { id: 'asc' }]
      : sort === 'price_desc'
        ? [{ price: 'desc' }, { name: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }]
  const where: Prisma.ServiceWhereInput = { isActive: true }

  if (category) where.category = category
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = { gte: minPrice, lte: maxPrice }
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]
  }

  // Rating thresholds are resolved before paging, not after, so a page cannot
  // appear empty while matching services are still waiting on later pages.
  const qualifying = minimumRating === undefined ? null : await prisma.review.groupBy({
    by: ['serviceId'],
    where: { service: where },
    having: { rating: { _avg: { gte: minimumRating } } },
    _avg: { rating: true },
    _count: { rating: true },
  })
  const filteredWhere: Prisma.ServiceWhereInput = qualifying
    ? { ...where, id: { in: qualifying.map(result => result.serviceId) } }
    : where
  const total = qualifying ? qualifying.length : await prisma.service.count({ where })
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1

  const services: RawService[] = total ? await prisma.service.findMany({
    where: filteredWhere,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      category: true,
      image: true,
      price: true,
      duration: true,
      _count: { select: { bookings: true } },
    },
  }) : []

  // For ordinary browsing aggregate only the current page. Rated queries reuse
  // the qualifying aggregate so they do not issue one query per service.
  const aggregates = qualifying ?? (services.length ? await prisma.review.groupBy({
    by: ['serviceId'],
    where: { serviceId: { in: services.map(service => service.id) } },
    _avg: { rating: true },
    _count: { rating: true },
  }) : [])
  const ratings = new Map(aggregates.map(row => [row.serviceId, row]))
  const items: UiService[] = services.map(service => ({
    id: service.id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    category: service.category,
    image: service.image ?? undefined,
    price: service.price,
    duration: service.duration,
    averageRating: ratings.get(service.id)?._avg.rating ?? null,
    totalSessions: service._count.bookings,
    totalReviews: ratings.get(service.id)?._count.rating ?? 0,
  })).filter(service => minimumRating === undefined || (service.averageRating !== null && service.averageRating >= minimumRating))
  return { items, total, page, totalPages }
}

export default async function ServicesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const minimumRating = parseMinimumServiceRating(params.minRating)
  const [catalog, categoryRows] = await Promise.all([
    getServices(params, minimumRating),
    prisma.service.findMany({ where: { isActive: true }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } }),
  ])
  const categories = categoryRows.map(row => row.category).filter(Boolean)
  const sort = parseServiceCatalogSort(params.sort)
  const filterKeys = ['category', 'search', 'q', 'minPrice', 'maxPrice'] as const
  const hasFilters = sort !== 'newest' || minimumRating !== undefined || filterKeys.some(key => Boolean(params[key]))
  const { items: services, total, page, totalPages } = catalog
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams()
    for (const key of ['category', 'search', 'q', 'minPrice', 'maxPrice', 'minRating']) {
      const value = params[key]
      if (typeof value === 'string' && value.trim()) query.set(key, value.trim())
    }
    if (sort !== 'newest') query.set('sort', sort)
    if (nextPage > 1) query.set('page', String(nextPage))
    return `/services${query.size ? `?${query}` : ''}`
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="container mx-auto px-4 py-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Our Healing Services
          </h1>
          <p className="text-xl text-purple-100 max-w-2xl">
            Discover transformative healing modalities guided by certified practitioners. 
            Your journey to wellness starts here.
          </p>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8">
        {(() => { const crumbs = makeServicesIndexCrumbs(); return (<>
          <Breadcrumbs crumbs={crumbs} />
          <BreadcrumbsLd crumbs={crumbs} />
        </>) })()}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters Sidebar */}
          <aside className="lg:w-64">
            <Suspense fallback={<div>Loading filters...</div>}>
              <ServicesFilter key={JSON.stringify([...filterKeys.map(key => params[key]), minimumRating, sort])} categories={categories} minimumRating={minimumRating} />
            </Suspense>
          </aside>
          
          {/* Services Grid */}
          <main className="flex-1">
            {services.length === 0 ? (
              <EmptyState
                title={hasFilters ? 'No matching services' : 'No services yet'}
                subtitle={hasFilters ? 'Try another search or clear the filters to see all available services.' : 'Check back soon.'}
                action={hasFilters ? <Link href="/services"><Button variant="secondary">Clear filters</Button></Link> : null}
              />
            ) : (
              <>
                <div className="mb-4 flex justify-between items-center">
                  <p className="text-gray-600">
                    Showing {services.length} of {total} service{total !== 1 ? 's' : ''}
                  </p>
                </div>
                <ServicesGrid services={services} />
                {totalPages > 1 && (
                  <nav aria-label="Service pages" className="mt-8 flex items-center justify-between gap-3">
                    {page > 1 ? (
                      <Link href={pageHref(page - 1)} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-purple-600">
                        Previous services
                      </Link>
                    ) : <span />}
                    <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
                    {page < totalPages ? (
                      <Link href={pageHref(page + 1)} className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white hover:bg-purple-800 focus-visible:ring-2 focus-visible:ring-purple-600">
                        Next services
                      </Link>
                    ) : <span />}
                  </nav>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
