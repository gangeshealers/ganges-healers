import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  BOOKING_HISTORY_PAGE_SIZE, BOOKING_HISTORY_MAX_PAGE, BOOKING_HISTORY_FILTERS,
  parseBookingHistoryFilters, bookingHistoryHref, bookingHistoryWhere, bookingHistoryExportHref,
} from '@/lib/bookings/history'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Booking history | Ganges Healers', robots: { index: false, follow: false } }

type Search = { page?: string | string[]; q?: string | string[]; status?: string | string[] }
const dateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
})

/** All historical appointments remain browsable without loading lifetime data into a browser. */
export default async function BookingHistoryPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=%2Fdashboard%2Fbookings%2Fhistory')

  const { status, query, page: requestedPage } = parseBookingHistoryFilters((await searchParams) ?? {})
  const where = bookingHistoryWhere(session.user.id, status, query)
  const total = await prisma.booking.count({ where })
  const lastPage = Math.max(1, Math.ceil(total / BOOKING_HISTORY_PAGE_SIZE))
  const page = Math.min(requestedPage, lastPage, BOOKING_HISTORY_MAX_PAGE)
  const bookings = total ? await prisma.booking.findMany({
    where,
    orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * BOOKING_HISTORY_PAGE_SIZE,
    take: BOOKING_HISTORY_PAGE_SIZE,
    select: {
      id: true, scheduledAt: true, status: true, durationMin: true,
      service: { select: { name: true, slug: true } },
      healer: { select: { user: { select: { name: true } } } },
    },
  }) : []

  return (
    <main className="container mx-auto max-w-5xl space-y-7 px-4 py-8">
      <header className="space-y-3">
        <Link href="/dashboard/bookings" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Back to My Bookings</Link>
        <h1 className="text-3xl font-bold">Booking history</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Browse older appointments, completed sessions, and cancellations without loading your entire booking history.
          Manage upcoming appointments and review cancellation outcomes in My Bookings.
          All dates and times below use India Standard Time (IST).
        </p>
      </header>
      <form action="/dashboard/bookings/history" method="get" role="search"
        aria-label="Search booking history" className="flex flex-wrap gap-3 rounded-xl border bg-card p-4">
        {status !== 'all' && <input type="hidden" name="status" value={status} />}
        <label htmlFor="booking-history-search" className="sr-only">Search service names</label>
        <input id="booking-history-search" type="search" name="q" maxLength={80} defaultValue={query}
          placeholder="Search service names" className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Search</button>
        {(query || status !== 'all') && <Link href="/dashboard/bookings/history" className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Clear filters</Link>}
      </form>
      <nav aria-label="Booking history status" className="flex flex-wrap gap-2">
        {BOOKING_HISTORY_FILTERS.map(value => (
          <Link key={value} href={bookingHistoryHref(value, query)}
            aria-current={status === value ? 'page' : undefined}
            className={'rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted ' + (status === value ? 'border-primary bg-muted' : '')}>
            {value === 'all' ? 'All history' : value === 'completed' ? 'Completed' : 'Cancelled'}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">{total} historical {total === 1 ? 'booking' : 'bookings'} match</p>
        <div className="flex flex-wrap items-center gap-3">
          <a href={bookingHistoryExportHref(status, query)} download="ganges-healers-booking-history.csv"
            className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Download history CSV</a>
          <Link href="/dashboard/billing" className="text-sm font-semibold text-primary hover:underline">View invoices and billing</Link>
        </div>
      </div>
      {bookings.length === 0 ? (
        <section className="space-y-3 rounded-xl border border-dashed p-8 text-center">
          <h2 className="text-lg font-semibold">{query || status !== 'all' ? 'No matching booking history' : 'No past appointments yet'}</h2>
          <p className="text-sm text-muted-foreground">Your previous sessions and cancellations will appear here when available.</p>
          <Link href={query || status !== 'all' ? '/dashboard/bookings/history' : '/dashboard/bookings'}
            className="inline-flex rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">
            {query || status !== 'all' ? 'Show all booking history' : 'Return to My Bookings'}
          </Link>
        </section>
      ) : (
        <section aria-label="Historical appointments" className="space-y-3">
          {bookings.map(booking => (
            <article key={booking.id} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-5">
              <div className="min-w-0 space-y-1">
                <h2 className="text-lg font-semibold">{booking.service.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {dateTime.format(booking.scheduledAt)} IST · {booking.durationMin} min
                </p>
                <p className="text-sm text-muted-foreground">Practitioner: {booking.healer.user.name || 'Practitioner'}</p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs font-semibold">
                {booking.status === 'COMPLETED' ? 'Completed' : booking.status === 'CANCELLED' ? 'Cancelled' : 'Past · ' + booking.status.toLowerCase()}
              </span>
            </article>
          ))}
        </section>
      )}
      {total > BOOKING_HISTORY_PAGE_SIZE && (
        <nav aria-label="Booking history pages" className="flex items-center justify-between gap-3">
          {page > 1 ? <Link href={bookingHistoryHref(status, query, page - 1)}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Previous bookings</Link> : <span />}
          <span className="text-sm text-muted-foreground">Page {page} of {lastPage}</span>
          {page < lastPage && page < BOOKING_HISTORY_MAX_PAGE ? <Link href={bookingHistoryHref(status, query, page + 1)}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Next bookings</Link> : <span />}
        </nav>
      )}
    </main>
  )
}
