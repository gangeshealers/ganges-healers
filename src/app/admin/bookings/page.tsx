import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { prisma } from '@/lib/prisma'
import { bookingDeliveryState } from '@/lib/bookings/session-delivery'
import {
  ADMIN_BOOKING_MAX_PAGE, ADMIN_BOOKING_PAGE_SIZE, ADMIN_BOOKING_SCOPES,
  ADMIN_BOOKING_STATUSES, adminBookingHref, adminBookingWhere, parseAdminBookingFilters,
} from '@/lib/admin/booking-explorer'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Admin bookings | Ganges Healers', robots: { index: false, follow: false },
}
type Search = { scope?: string | string[]; status?: string | string[]; q?: string | string[]; page?: string | string[] }
const ist = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
})

/** Staff triage view; no hidden payment credentials, meeting URLs or booking mutations. */
export default async function AdminBookingsPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  await requireCurrentAdmin()

  const { scope, status, query, page: requestedPage } = parseAdminBookingFilters((await searchParams) ?? {})
  const where = adminBookingWhere(scope, status, query)
  const count = await prisma.booking.count({ where })
  const lastPage = Math.max(1, Math.ceil(count / ADMIN_BOOKING_PAGE_SIZE))
  const page = Math.min(requestedPage, lastPage, ADMIN_BOOKING_MAX_PAGE)
  const rows = count ? await prisma.booking.findMany({
    where,
    orderBy: scope === 'upcoming'
      ? [{ scheduledAt: 'asc' }, { id: 'asc' }]
      : [{ scheduledAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * ADMIN_BOOKING_PAGE_SIZE,
    take: ADMIN_BOOKING_PAGE_SIZE,
    select: {
      id: true, status: true, scheduledAt: true, durationMin: true, pricePaise: true,
      service: { select: { name: true } },
      user: { select: { name: true, email: true } },
      healer: { select: { user: { select: { name: true } } } },
      payment: { select: { status: true, statusEnum: true, amountPaise: true, gateway: true } },
    },
  }) : []

  return (
    <main className="container mx-auto max-w-6xl space-y-7 px-4 py-8">
      <header className="space-y-3">
        <Link href="/admin" className="text-sm font-medium text-primary hover:underline">Back to Admin workspace</Link>
        <h1 className="text-3xl font-bold">Booking operations</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Review the saved appointment schedule, confirmation state and payment signals.
          This page is read-only: refunds, cancellations and provider callbacks must use their separate reviewed workflows.
          All session times are shown in India Standard Time (IST).
        </p>
      </header>
      <form action="/admin/bookings" method="get" role="search" aria-label="Find a saved booking"
        className="flex flex-wrap gap-3 rounded-xl border bg-card p-4">
        {scope !== 'upcoming' && <input type="hidden" name="scope" value={scope} />}
        {status !== 'all' && <input type="hidden" name="status" value={status} />}
        <label htmlFor="booking-ref" className="sr-only">Exact booking reference</label>
        <input id="booking-ref" type="search" name="q" maxLength={100} defaultValue={query}
          placeholder="Exact booking reference" className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Find booking</button>
        {(query || scope !== 'upcoming' || status !== 'all') && <Link href="/admin/bookings" className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Reset filters</Link>}
      </form>
      <nav aria-label="Booking date filter" className="flex flex-wrap gap-2">
        {ADMIN_BOOKING_SCOPES.map(value => (
          <Link key={value} href={adminBookingHref(value, status, query)} aria-current={scope === value ? 'page' : undefined}
            className={'rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted ' + (scope === value ? 'border-primary bg-muted' : '')}>
            {value === 'upcoming' ? 'Upcoming' : value === 'past' ? 'Past' : 'All dates'}
          </Link>
        ))}
      </nav>
      <nav aria-label="Booking status filter" className="flex flex-wrap gap-2">
        {ADMIN_BOOKING_STATUSES.map(value => (
          <Link key={value} href={adminBookingHref(scope, value, query)} aria-current={status === value ? 'page' : undefined}
            className={'rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted ' + (status === value ? 'border-primary bg-muted' : '')}>
            {value === 'all' ? 'All statuses' : value[0].toUpperCase() + value.slice(1)}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">{count} {count === 1 ? 'booking' : 'bookings'} match</p>
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link href="/admin/booking-emails" className="text-primary hover:underline">Booking-email queue</Link>
          <Link href="/admin/payments" className="text-primary hover:underline">Payment reconciliation</Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <section className="space-y-3 rounded-xl border border-dashed p-8 text-center">
          <h2 className="text-lg font-semibold">No bookings match these filters</h2>
          <p className="text-sm text-muted-foreground">Try a different status, date scope or exact booking reference.</p>
          <Link href="/admin/bookings" className="inline-flex rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Show upcoming bookings</Link>
        </section>
      ) : (
        <section aria-label="Saved booking operations records" className="space-y-3">
          {rows.map(row => {
            const delivery = bookingDeliveryState(row)
            return (
              <article key={row.id} className="space-y-3 rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="font-semibold">{row.service.name}</h2>
                    <p className="text-sm text-muted-foreground">{ist.format(row.scheduledAt)} IST · {row.durationMin} min</p>
                    <p className="text-sm text-muted-foreground">Member: {row.user.name || row.user.email} · Practitioner: {row.healer.user.name || 'Practitioner'}</p>
                  </div>
                  <span className="rounded-full border px-3 py-1 text-xs font-semibold">{row.status}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>{delivery.confirmed ? 'Delivery confirmed' : 'Awaiting session confirmation'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{delivery.credit ? 'Session credit' : delivery.funded ? 'Matching captured payment' : delivery.free ? 'Free session' : 'Payment not verified for delivery'}</span>
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">Booking reference: {row.id}</p>
                <Link href={'/admin/bookings/' + encodeURIComponent(row.id)} className="inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline">
                  Review booking record
                </Link>
              </article>
            )
          })}
        </section>
      )}
      {count > ADMIN_BOOKING_PAGE_SIZE && (
        <nav aria-label="Booking operations pages" className="flex items-center justify-between gap-3">
          {page > 1 ? <Link href={adminBookingHref(scope, status, query, page - 1)}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Previous bookings</Link> : <span />}
          <span className="text-sm text-muted-foreground">Page {page} of {lastPage}</span>
          {page < lastPage && page < ADMIN_BOOKING_MAX_PAGE ? <Link href={adminBookingHref(scope, status, query, page + 1)}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Next bookings</Link> : <span />}
        </nav>
      )}
    </main>
  )
}
