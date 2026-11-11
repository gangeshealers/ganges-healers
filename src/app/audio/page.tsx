import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { audioCatalogHref, parseAudioCatalogParams, type AudioCatalogParams, type AudioSort } from '@/lib/audio/catalog-queries'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
import Link from 'next/link'
import EmptyState from '@/components/empty/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Play, Music, Headphones } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Guided Healing Audio Library | Ganges Healers',
  description: 'Listen to hypnosis sessions, guided meditations, and healing audio tracks designed to support your transformation journey.',
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const PAGE_SIZE = 12

export default async function AudioLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = parseAudioCatalogParams(await searchParams)
  const { category, q, sort } = filters
  const where: Prisma.AudioTrackWhereInput = {
    isPublished: true,
    ...(category ? { category } : {}),
    ...(q ? { OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { category: { contains: q, mode: 'insensitive' } },
    ] } : {}),
  }

  // Explicit ID tiebreakers make next/previous pages deterministic.
  const orderBy: Prisma.AudioTrackOrderByWithRelationInput[] = sort === 'shortest'
    ? [{ duration: 'asc' }, { id: 'asc' }]
    : sort === 'longest'
      ? [{ duration: 'desc' }, { id: 'desc' }]
      : [{ createdAt: 'desc' }, { id: 'desc' }]

  const [total, categoriesRaw] = await Promise.all([
    prisma.audioTrack.count({ where }),
    prisma.audioTrack.findMany({
      where: { isPublished: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    }),
  ])
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const page = totalPages ? Math.min(filters.page, totalPages) : 1
  const tracks = total ? await prisma.audioTrack.findMany({
    where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
  }) : []
  const categories = categoriesRaw.map(({ category }) => category)

  function filterHref(changes: Partial<AudioCatalogParams> = {}) {
    return audioCatalogHref({ ...filters, ...changes, page: changes.page ?? 1 })
  }

  const sortOptions: { value: AudioSort; label: string }[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'shortest', label: 'Shortest' },
    { value: 'longest', label: 'Longest' },
  ]

  // Gradient palette for track thumbnails
  const gradients = [
    'from-violet-500 to-purple-600',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-rose-500 to-pink-500',
    'from-amber-500 to-orange-500',
    'from-indigo-500 to-blue-600',
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 text-white">
        <div className="container mx-auto px-4 py-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Guided Healing Audio Library
          </h1>
          <p className="text-xl text-violet-100 max-w-2xl mb-4">
            Listen to hypnosis sessions, guided meditations, and healing tracks
            designed to support your transformation journey.
          </p>
          <ul className="text-violet-200 space-y-1 text-sm">
            <li className="flex items-center gap-2"><Headphones className="w-4 h-4" /> Reduce stress and anxiety</li>
            <li className="flex items-center gap-2"><Music className="w-4 h-4" /> Reprogram subconscious patterns</li>
          </ul>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Search & Sort */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <form className="flex flex-1 max-w-md gap-2" action="/audio" method="get" role="search">
            {category && <input type="hidden" name="category" value={category} />}
            {sort && <input type="hidden" name="sort" value={sort} />}
            <input
              type="search"
              name="q"
              aria-label="Search audio tracks"
              defaultValue={q}
              maxLength={120}
              placeholder="Search tracks..."
              className="min-w-0 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-violet-600 focus:border-transparent"
            />
            <button type="submit" className="rounded-lg bg-violet-700 px-4 py-2 font-medium text-white hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">
              Search
            </button>
          </form>
          <div className="flex gap-2">
            {sortOptions.map((opt) => {
              const isActive = sort === opt.value
              return (
                <Link
                  key={opt.label}
                  href={filterHref({ sort: opt.value })}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    isActive ? 'bg-violet-600 text-white border-violet-600' : 'hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Category filter */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <Link
              href={filterHref({ category: undefined })}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                !category ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              All
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat}
                href={filterHref({ category: cat })}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  category === cat ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {cat}
              </Link>
            ))}
          </div>
        )}

        {/* Results count */}
        <p className="text-gray-600 mb-4 text-sm">
          Showing {tracks.length} of {total} track{total !== 1 ? 's' : ''}{category ? ` in ${category}` : ''}{q ? ` matching "${q}"` : ''}
        </p>

        {tracks.length === 0 ? (
          <EmptyState
            title="No audio tracks found"
            subtitle={q || category ? 'Try a different search or category.' : 'Check back soon — new tracks are being added.'}
            action={q || category || sort !== 'newest' ? (
              <Link href="/audio" className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">
                Clear filters
              </Link>
            ) : null}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tracks.map((track, i) => (
              <Link key={track.id} href={`/audio/${track.slug}`} className="group">
                <Card className="h-full hover:shadow-lg transition-all duration-300 overflow-hidden">
                  {/* Gradient thumbnail */}
                  <div className={`relative h-32 bg-gradient-to-br ${gradients[i % gradients.length]} flex items-center justify-center`}>
                    <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play className="w-7 h-7 text-white ml-1" />
                    </div>
                    {track.isPremium && (
                      <span className="absolute top-3 right-3 text-xs font-semibold bg-amber-400 text-amber-900 px-2.5 py-0.5 rounded-full">
                        Premium
                      </span>
                    )}
                  </div>
                  <CardContent className="pt-4 pb-5">
                    <h3 className="font-semibold text-lg group-hover:text-violet-600 transition-colors truncate">
                      {track.title}
                    </h3>
                    {track.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {track.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-0.5 rounded">{track.category}</span>
                      <span>{formatDuration(track.duration)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
        {totalPages > 1 ? (
          <nav aria-label="Audio pages" className="mt-10 flex items-center justify-center gap-5">
            {page > 1 ? (
              <Link href={filterHref({ page: page - 1 })} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">
                Previous tracks
              </Link>
            ) : <span className="text-sm text-gray-500">First page</span>}
            <span className="text-sm text-gray-700">Page {page} of {totalPages}</span>
            {page < totalPages ? (
              <Link href={filterHref({ page: page + 1 })} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">
                Next tracks
              </Link>
            ) : <span className="text-sm text-gray-500">Last page</span>}
          </nav>
        ) : null}
      </div>
    </div>
  )
}
