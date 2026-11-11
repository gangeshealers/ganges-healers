import { listPrograms } from '@/lib/programs/queries'
import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeProgramsIndexCrumbs } from '@/lib/seo/breadcrumbs'
import EmptyState from '@/components/empty/EmptyState'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { clearSearchParams } from '@/lib/utils'
import { Clock, CalendarDays, Layers, ArrowRight } from 'lucide-react'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Transformational Healing Programs | Ganges Healers',
    description: 'Structured multi-session healing programs designed to create lasting emotional, mental, and behavioral transformation.',
    alternates: { canonical: canonicalOf('/programs') },
  }
}

export default async function ProgramsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await searchParams) || {}
  const q = typeof sp?.q === 'string' ? sp.q.trim().slice(0, 120) : undefined
  // Program IDs are opaque cursors supplied only by the previous listing.
  const cursor = typeof sp.cursor === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(sp.cursor) ? sp.cursor : undefined
  const { items, nextCursor } = await listPrograms({ limit: 20, q, cursor })
  const linkTo = (next?: string) => {
    const search = new URLSearchParams()
    if (q) search.set('q', q)
    if (next) search.set('cursor', next)
    const qs = search.toString()
    return `/programs${qs ? `?${qs}` : ''}`
  }
  const crumbs = makeProgramsIndexCrumbs()
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
        <div className="container mx-auto px-4 py-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Transformational Healing Programs
          </h1>
          <p className="text-xl text-emerald-100 max-w-2xl">
            Structured multi-session journeys designed to create lasting emotional,
            mental, and behavioral change.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs crumbs={crumbs} />
        <BreadcrumbsLd crumbs={crumbs} />

        {/* Search */}
        <form className="mb-8 max-w-md" action="/programs">
          <div className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search programs..."
              className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
            <Button type="submit">Search</Button>
          </div>
        </form>

        {items.length === 0 ? (
          <EmptyState
            title="No programs found"
            subtitle="Try a different search or check back soon."
            action={(() => {
              const hasFilters = Boolean(sp?.q || sp?.serviceSlug || cursor)
              if (!hasFilters) return null
              const qs = new URLSearchParams(Object.entries(sp).flatMap(([k,v]) => Array.isArray(v) ? v.map((vv) => [k, String(vv)]) : v ? [[k, String(v)]] : []))
              const href = clearSearchParams('/programs' + (qs.toString() ? `?${qs.toString()}` : ''), ['q','serviceSlug'])
              return <Link href={href}><Button variant="secondary">Clear filters</Button></Link>
            })()}
          />
        ) : (
          <>
            <p className="text-gray-600 mb-6">
              Showing {items.length} program{items.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((p) => {
                const totalWeeks = p.sessionsPerWeek > 0 ? Math.ceil(p.sessionsCount / p.sessionsPerWeek) : null
                return (
                  <Link key={p.id} href={`/programs/${p.slug}`} className="group">
                    <Card className="h-full hover:shadow-lg transition-all duration-300 overflow-hidden">
                      {/* Gradient banner */}
                      <div className="h-3 bg-gradient-to-r from-emerald-500 to-teal-500" />
                      <CardHeader>
                        <CardTitle className="text-xl group-hover:text-emerald-600 transition-colors">
                          {p.title}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {p.shortDescription}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Program structure */}
                        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Layers className="w-4 h-4 text-emerald-600" />
                            <span>{p.sessionsCount} sessions</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4 text-emerald-600" />
                            <span>{p.durationMinutes} min each</span>
                          </div>
                          {totalWeeks && (
                            <div className="flex items-center gap-1">
                              <CalendarDays className="w-4 h-4 text-emerald-600" />
                              <span>{totalWeeks} week{totalWeeks !== 1 ? 's' : ''}</span>
                            </div>
                          )}
                        </div>

                        {/* Price and CTA */}
                        <div className="flex items-center justify-between pt-2 border-t">
                          <span className="text-2xl font-bold text-emerald-600">
                            ₹{(p.pricePaise / 100).toLocaleString('en-IN')}
                          </span>
                          <span className="text-emerald-600 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1 text-sm font-medium">
                            View Program
                            <ArrowRight className="w-4 h-4" />
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
            {nextCursor || cursor ? (
              <nav aria-label="Program pages" className="mt-8 flex items-center justify-between gap-3">
                {cursor ? (
                  <Link href={linkTo()} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                    Back to first page
                  </Link>
                ) : <span />}
                {nextCursor ? (
                  <Link href={linkTo(nextCursor)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                    Next programs <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : <span className="text-sm text-gray-500">End of results</span>}
              </nav>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
