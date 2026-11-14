'use client'

import { useSearch } from '@/lib/search/useSearch'
import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { catalogSearchDestination, searchHubDestination, searchableCatalogs } from '@/lib/search/catalog-destinations'
import { Search } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SearchPageClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const q = (searchParams.get('q') || '').trim().slice(0, 200)
  const [input, setInput] = useState(q)
  useEffect(() => setInput(q), [q])
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (input.trim().length < 2) return
    router.push(searchHubDestination(input))
  }
  const { results, status, retry } = useSearch(q, true, 0)
  const loading = status === 'loading'

  const totalResults = results
    ? results.services.length +
      results.healers.length +
      results.programs.length +
      results.courses.length +
      results.products.length +
      results.blog.length +
      results.audio.length
    : 0

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Search Ganges Healers</h1>
      <form role="search" onSubmit={submit} className="mb-6 flex max-w-2xl gap-2">
        <label htmlFor="site-search-term" className="sr-only">Search the website</label>
        <input
          id="site-search-term" type="search" value={input}
          onChange={event => setInput(event.target.value.slice(0, 200))}
          maxLength={200} placeholder="Find services, healers, courses and more"
          className="min-w-0 flex-1 rounded-lg border px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
        />
        <button type="submit" disabled={input.trim().length < 2} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-3 font-semibold text-white hover:bg-violet-800 focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50">
          <Search aria-hidden="true" className="size-4" /> Search
        </button>
      </form>
      {q.length >= 2 && (
        <p className="text-muted-foreground mb-6" role="status">
          {loading ? 'Searching...' : status === 'error' ? 'Search unavailable' : `${totalResults} result${totalResults !== 1 ? 's' : ''} for "${q}"`}
        </p>
      )}

      {q.length < 2 && <p className="text-muted-foreground">Enter at least two characters to search, or browse the catalogs below.</p>}
      {q.length >= 2 && status === 'ready' && results && (
        <p className="mb-6 text-sm text-muted-foreground">Showing up to 10 matches in each category. Continue to a catalog to explore more.</p>
      )}
      {status === 'error' && <div role="alert" className="space-y-2 rounded border p-4"><p>Search could not be loaded. Please try again.</p><button type="button" onClick={retry} className="underline focus-ring">Try again</button></div>}

      {results && !loading && totalResults === 0 && (
        <p className="text-muted-foreground">No results found. Try a different search term.</p>
      )}

      {results && !loading && status !== 'error' && (
        <div className="space-y-8">
          {results.services.length > 0 && (
            <Section title="Services" browseHref={catalogSearchDestination('services', q)} browseLabel="Search services catalog">
              {results.services.map((s) => (
                <ResultCard key={s.id} href={`/services/${encodeURIComponent(s.slug)}`} title={s.name} subtitle={s.tagline || s.category} />
              ))}
            </Section>
          )}

          {results.healers.length > 0 && (
            <Section title="Healers" browseHref={catalogSearchDestination('healers', q)} browseLabel="Search healers catalog">
              {results.healers.map((h) => (
                <ResultCard
                  key={h.id}
                  href={`/healers/${encodeURIComponent(h.id)}`}
                  title={h.user.name || 'Healer'}
                  subtitle={h.specializations.length > 0 ? h.specializations.join(', ') : h.bio?.slice(0, 100) || undefined}
                />
              ))}
            </Section>
          )}

          {results.programs.length > 0 && (
            <Section title="Programs" browseHref={catalogSearchDestination('programs', q)} browseLabel="Search programs catalog">
              {results.programs.map((p) => (
                <ResultCard key={p.id} href={`/programs/${encodeURIComponent(p.slug)}`} title={p.title} subtitle={`₹${(p.pricePaise / 100).toFixed(2)}`} />
              ))}
            </Section>
          )}

          {results.courses.length > 0 && (
            <Section title="Courses" browseHref={catalogSearchDestination('courses', q)} browseLabel="Search courses catalog">
              {results.courses.map((c) => (
                <ResultCard key={c.id} href={`/courses/${encodeURIComponent(c.slug)}`} title={c.title} subtitle={`₹${(c.pricePaise / 100).toFixed(2)}`} />
              ))}
            </Section>
          )}

          {results.products.length > 0 && (
            <Section title="Products" browseHref={catalogSearchDestination('products', q)} browseLabel="Search products catalog">
              {results.products.map((p) => (
                <ResultCard key={p.id} href={`/store/${encodeURIComponent(p.slug)}`} title={p.title} subtitle={`₹${(p.pricePaise / 100).toFixed(2)}`} />
              ))}
            </Section>
          )}

          {results.blog.length > 0 && (
            <Section title="Blog" browseHref={catalogSearchDestination('blog', q)} browseLabel="Browse articles">
              {results.blog.map((b) => (
                <ResultCard key={b.id} href={`/blog/${encodeURIComponent(b.slug)}`} title={b.title} subtitle={b.excerpt || undefined} />
              ))}
            </Section>
          )}

          {results.audio.length > 0 && (
            <Section title="Audio" browseHref={catalogSearchDestination('audio', q)} browseLabel="Search audio catalog">
              {results.audio.map((a) => (
                <ResultCard
                  key={a.id}
                  href={`/audio/${encodeURIComponent(a.slug)}`}
                  title={a.title}
                  subtitle={`${a.category} · ${formatDuration(a.duration)}${a.isPremium ? ' · Premium' : ''}`}
                />
              ))}
            </Section>
          )}
        </div>
      )}
      <nav aria-label="Browse all catalogs" className="mt-10 rounded-xl border bg-slate-50 p-5">
        <h2 className="text-lg font-semibold">Explore complete catalogs</h2>
        <p className="mt-1 text-sm text-muted-foreground">Global search displays a limited preview from each section. These links open the corresponding catalogs.</p>
        <ul className="mt-4 flex flex-wrap gap-3">
          {(Object.keys(searchableCatalogs) as Array<keyof typeof searchableCatalogs>).map(kind => (
            <li key={kind}>
              <Link href={catalogSearchDestination(kind, q)} className="inline-flex rounded-full border bg-white px-4 py-2 text-sm font-medium hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">
                {searchableCatalogs[kind].title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

function Section({ title, children, browseHref, browseLabel }: { title: string; children: React.ReactNode; browseHref: string; browseLabel: string }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link href={browseHref} className="rounded-sm text-sm font-semibold text-violet-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">{browseLabel}</Link>
      </div>
      <div className="grid gap-2">{children}</div>
    </section>
  )
}

function ResultCard({ href, title, subtitle }: { href: string; title: string; subtitle?: string }) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="py-3">
          <p className="font-medium">{title}</p>
          {subtitle && <p className="text-sm text-muted-foreground line-clamp-1">{subtitle}</p>}
        </CardContent>
      </Card>
    </Link>
  )
}
