import Link from 'next/link'
import { listHealers, getHealerServiceOptions } from '@/lib/healers/queries'
import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeHealersIndexCrumbs } from '@/lib/seo/breadcrumbs'
import EmptyState from '@/components/empty/EmptyState'
import { Button } from '@/components/ui/button'
import { clearSearchParams } from '@/lib/utils'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Healers | Ganges Healers',
    description: 'Browse our directory of certified healers across modalities like Yoga, Reiki, Tarot, and more.',
    alternates: { canonical: canonicalOf('/healers') },
  }
}

export default async function HealersPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await searchParams) || {}
  const q = typeof sp.q === 'string' ? sp.q : undefined
  const serviceSlug = typeof sp.serviceSlug === 'string' ? sp.serviceSlug : undefined
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : undefined
  const [{ items, nextCursor }, availableServices] = await Promise.all([
    listHealers({ q, serviceSlug, cursor, limit: 20 }),
    getHealerServiceOptions(),
  ])
  const services = [...availableServices].sort((a, b) => a.name.localeCompare(b.name))
  const unavailableService = Boolean(serviceSlug && !services.some(service => service.slug === serviceSlug))

  return (
    <div className="container mx-auto p-6 space-y-6">
      {(() => { const crumbs = makeHealersIndexCrumbs(); return (<>
        <Breadcrumbs crumbs={crumbs} />
        <BreadcrumbsLd crumbs={crumbs} />
      </>) })()}
      <h1 className="text-2xl font-semibold">Healers</h1>
      <form action="/healers" method="get" aria-label="Find healers" className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="healer-search">Search healers</label>
        <input id="healer-search" name="q" defaultValue={q} placeholder="Search healers" className="min-w-0 w-full border rounded px-3 py-2 sm:flex-1 focus-ring" />
        <label className="sr-only" htmlFor="healer-service">Service</label>
        <select id="healer-service" name="serviceSlug" defaultValue={serviceSlug || ''} aria-invalid={unavailableService || undefined} className="min-w-0 w-full max-w-full border rounded px-3 py-2 sm:w-auto sm:max-w-xs focus-ring">
          <option value="">All services</option>
          {unavailableService ? <option value={serviceSlug}>Unavailable service</option> : null}
          {services.map(service => <option key={service.slug} value={service.slug}>{service.name}</option>)}
        </select>
        <button type="submit" className="shrink-0 border rounded px-3 py-2 focus-ring">Search</button>
      </form>
      {items.length === 0 ? (
        <EmptyState
          title="No healers found"
          subtitle="Adjust filters or search."
          action={(() => {
            const hasFilters = Boolean(q || serviceSlug)
            if (!hasFilters) return null
            const qs = new URLSearchParams(Object.entries({ q: q || '', serviceSlug: serviceSlug || '' }).filter(([,v]) => v))
            const href = clearSearchParams('/healers' + (qs.toString() ? `?${qs.toString()}` : ''), ['q','serviceSlug'])
            return <Link href={href}><Button variant="secondary">Clear filters</Button></Link>
          })()}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(h => (
            <div key={h.id} className="border rounded p-4">
              <div className="font-medium text-lg"><Link href={`/healers/${h.slug}`}>{h.name}</Link></div>
              <div className="text-sm text-muted-foreground">{h.title || 'Healer'} • {h.yearsExperience} yrs • {h.reviewCount > 0 ? `⭐ ${h.ratingAvg.toFixed(1)} (${h.reviewCount} ${h.reviewCount === 1 ? 'review' : 'reviews'})` : 'No reviews yet'}</div>
              <div className="mt-2 text-sm line-clamp-3">{h.shortBio}</div>
              {h.services?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {h.services.map(s => (
                    <Link key={s.slug} href={`/services/${s.slug}`} className="text-xs rounded bg-gray-100 px-2 py-1 text-gray-600 focus-ring">{s.title}</Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {nextCursor ? (
        <div className="pt-2">
          <Link href={`/healers?${new URLSearchParams({ ...(q ? { q } : {}), ...(serviceSlug ? { serviceSlug } : {}), cursor: nextCursor }).toString()}`} className="border rounded px-3 py-2 inline-block focus-ring">Load more</Link>
        </div>
      ) : null}
    </div>
  )
}
