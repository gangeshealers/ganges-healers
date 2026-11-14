import { getPublishedBlogPage } from '@/lib/blog/queries'
import { blogCatalogHref, parseBlogCatalogParams } from '@/lib/blog/catalog'
import { canonicalOf } from '@/config/site'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import EmptyState from '@/components/empty/EmptyState'
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Search } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Wellness Articles | Ganges Healers',
  description: 'Discover articles, insights and practical perspectives on healing practices and holistic well-being.',
  alternates: { canonical: canonicalOf('/blog') },
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { q, page: requestedPage } = parseBlogCatalogParams((await searchParams) ?? {})
  const { posts, total, page, totalPages } = await getPublishedBlogPage({ q, page: requestedPage })

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white">
        <div className="container mx-auto px-4 py-14">
          <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-emerald-100">
            <BookOpen className="size-4" aria-hidden="true" />
            Ideas & perspectives
          </span>
          <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Wellness Articles</h1>
          <p className="mt-4 max-w-2xl text-lg text-emerald-100">
            Read about healing practices, mindfulness, and conscious living.
          </p>
        </div>
      </header>

      <div className="container mx-auto space-y-8 px-4 py-8">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
          <Link href="/" className="hover:underline">Home</Link>
          <span aria-hidden="true" className="mx-2">/</span>
          <span aria-current="page" className="font-medium text-slate-900">Articles</span>
        </nav>

        <section aria-label="Find wellness articles" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <form role="search" action="/blog" method="get" className="flex w-full max-w-xl gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <label className="sr-only" htmlFor="article-search">Search published articles</label>
              <input
                id="article-search" type="search" name="q" defaultValue={q}
                maxLength={120} placeholder="Search wellness articles..."
                className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-3 text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              />
            </div>
            <button type="submit" className="rounded-lg bg-slate-950 px-5 py-3 font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">Search</button>
          </form>
          <p role="status" className="text-sm text-slate-600">
            {total} {total === 1 ? 'article' : 'articles'} {q ? 'matching your search' : 'available'}
          </p>
        </section>

        {!posts.length ? (
          <EmptyState
            title={q ? 'No matching articles' : 'No articles yet'}
            subtitle={q ? 'Try another search term or return to the complete article catalog.' : 'Check back soon — new content is being published.'}
            action={q ? <Link href="/blog" className="inline-flex rounded-lg border px-4 py-2 font-medium hover:bg-slate-50">Clear article search</Link> : null}
          />
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {posts.map(post => (
                <Link
                  key={post.id}
                  href={`/blog/${encodeURIComponent(post.slug)}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  <div className="relative flex h-48 items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-700">
                    {post.imageUrl ? (
                      <Image
                        src={post.imageUrl}
                        alt={post.title}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    ) : <BookOpen className="size-12 text-white/80" aria-hidden="true" />}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-xl font-semibold text-slate-950 group-hover:text-emerald-700">{post.title}</h2>
                    {post.excerpt ? <p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">{post.excerpt}</p> : <div className="flex-1" />}
                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <time dateTime={post.createdAt.toISOString()} className="text-xs text-slate-500">
                        {format(post.createdAt, 'dd MMM yyyy')}
                      </time>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                        Read article <ArrowRight aria-hidden="true" className="size-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <nav aria-label="Article pages" className="flex flex-wrap items-center justify-center gap-5 py-3">
                {page > 1 ? (
                  <Link href={blogCatalogHref(q, page - 1)} className="inline-flex items-center gap-1 rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-600">
                    <ChevronLeft aria-hidden="true" className="size-4" /> Previous articles
                  </Link>
                ) : <span className="text-xs text-slate-500">First page</span>}
                <span className="text-sm text-slate-700">Page {page} of {totalPages}</span>
                {page < totalPages ? (
                  <Link href={blogCatalogHref(q, page + 1)} className="inline-flex items-center gap-1 rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-600">
                    Next articles <ChevronRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : <span className="text-xs text-slate-500">Last page</span>}
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  )
}
