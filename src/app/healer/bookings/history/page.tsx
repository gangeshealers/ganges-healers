import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { requireHealer } from '@/lib/auth/requireHealer'
import { prisma } from '@/lib/prisma'
import {
  HEALER_HISTORY_MAX_PAGE, HEALER_HISTORY_PAGE_SIZE, HEALER_HISTORY_STATUSES,
  parseHealerHistory, healerHistoryHref, healerHistoryWhere,
} from '@/lib/healer/booking-history'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Practitioner booking history | Ganges Healers', robots: { index: false, follow: false } }
type Search = { status?: string | string[]; q?: string | string[]; page?: string | string[] }
const ist = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
})

export default async function HealerBookingHistoryPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const { healer } = await requireHealer().catch(error => {
    if ((error as { status?: number }).status === 401) redirect('/auth/signin?callbackUrl=%2Fhealer%2Fbookings%2Fhistory')
    if ((error as { status?: number }).status === 403) redirect('/dashboard')
    throw error
  })
  const { status, query, page: requestedPage } = parseHealerHistory((await searchParams) ?? {})
  const where = healerHistoryWhere(healer.id, status, query)
  const count = await prisma.booking.count({ where })
  const lastPage = Math.max(1, Math.ceil(count / HEALER_HISTORY_PAGE_SIZE))
  const page = Math.min(requestedPage, lastPage, HEALER_HISTORY_MAX_PAGE)
  const bookings = count ? await prisma.booking.findMany({
    where,
    orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * HEALER_HISTORY_PAGE_SIZE,
    take: HEALER_HISTORY_PAGE_SIZE,
    select: {
      id: true, status: true, scheduledAt: true, durationMin: true,
      user: { select: { name: true } },
      service: { select: { name: true } },
    },
  }) : []

  return (
    <main className="space-y-7">
      <header className="space-y-2">
        <Link href="/healer/bookings" className="text-sm font-medium text-primary hover:underline">Back to Manage Bookings</Link>
        <h1 className="text-3xl font-bold">Practitioner booking history</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Browse completed, cancelled, and older assigned appointments. Times are shown in IST.
          Use Manage Bookings for current sessions, scheduling details and booking actions.
        </p>
      </header>
      <form action="/healer/bookings/history" role="search" method="get" aria-label="Search assigned booking history"
        className="flex flex-wrap gap-3 rounded-xl border bg-card p-4">
        {status !== 'all' && <input type="hidden" name="status" value={status} />}
        <label htmlFor="healer-history-search" className="sr-only">Search by service name</label>
        <input id="healer-history-search" type="search" name="q" defaultValue={query}
          maxLength={80} placeholder="Search service names" className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Search</button>
        {(query || status !== 'all') && <Link href="/healer/bookings/history" className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Clear filters</Link>}
      </form>
      <nav aria-label="Assigned booking status" className="flex flex-wrap gap-2">
        {HEALER_HISTORY_STATUSES.map(value => (
          <Link key={value} href={healerHistoryHref(value, query)} aria-current={status === value ? 'page' : undefined}
            className={'rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted ' + (value === status ? 'border-primary bg-muted' : '')}>
            {value === 'all' ? 'All history' : value === 'completed' ? 'Completed' : 'Cancelled'}
          </Link>
        ))}
      </nav>
      <p role="status" className="text-sm text-muted-foreground">{count} {count === 1 ? 'appointment' : 'appointments'} match this view</p>
      {bookings.length === 0 ? (
        <section className="space-y-3 rounded-xl border border-dashed p-7 text-center">
          <h2 className="text-lg font-semibold">{query || status !== 'all' ? 'No matching appointments' : 'No past appointments yet'}</h2>
          <p className="text-sm text-muted-foreground">Only appointments assigned to your practitioner profile appear here.</p>
          <Link href={status !== 'all' || query ? '/healer/bookings/history' : '/healer/bookings'}
            className="inline-flex rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">
            {status !== 'all' || query ? 'Show all history' : 'Return to Manage Bookings'}
          </Link>
        </section>
      ) : (
        <section aria-label="Historical practitioner appointments" className="space-y-3">
          {bookings.map(row => (
            <article key={row.id} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{row.service.name}</h2>
                <p className="text-sm text-muted-foreground">{ist.format(row.scheduledAt)} IST · {row.durationMin} min</p>
                <p className="text-sm text-muted-foreground">Member: {row.user.name || 'Member'}</p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs font-semibold">
                {row.status === 'COMPLETED' ? 'Completed' : row.status === 'CANCELLED' ? 'Cancelled' : 'Past · ' + row.status.toLowerCase()}
              </span>
            </article>
          ))}
        </section>
      )}
      {count > HEALER_HISTORY_PAGE_SIZE && (
        <nav aria-label="Practitioner booking history pages" className="flex items-center justify-between gap-3">
          {page > 1 ? <Link href={healerHistoryHref(status, query, page - 1)}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Previous appointments</Link> : <span />}
          <span className="text-sm text-muted-foreground">Page {page} of {lastPage}</span>
          {page < lastPage && page < HEALER_HISTORY_MAX_PAGE ? <Link href={healerHistoryHref(status, query, page + 1)}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Next appointments</Link> : <span />}
        </nav>
      )}
    </main>
  )
}
