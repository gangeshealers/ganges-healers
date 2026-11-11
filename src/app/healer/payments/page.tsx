import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'
import {
  HEALER_ACTIVITY_MAX_PAGE, HEALER_ACTIVITY_PAGE_SIZE, HEALER_ACTIVITY_PERIODS,
  healerActivityFilters, healerActivityHref, healerActivityWhere,
} from '@/lib/healer/payment-activity'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Session payments | Ganges Healers', robots: { index: false, follow: false } }

type Search = { page?: string | string[]; period?: string | string[] }
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const dateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
})

export default async function HealerPaymentsPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const { healer } = await requireHealer().catch(error => {
    if ((error as { status?: number }).status === 401) redirect('/auth/signin?callbackUrl=%2Fhealer%2Fpayments')
    if ((error as { status?: number }).status === 403) redirect('/dashboard')
    throw error
  })
  const { period, page: requestedPage } = healerActivityFilters((await searchParams) ?? {})
  const where = healerActivityWhere(healer.id, period)
  const [count, aggregate] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where, _sum: { amountPaise: true } }),
  ])
  const finalPage = Math.max(1, Math.ceil(count / HEALER_ACTIVITY_PAGE_SIZE))
  const page = Math.min(requestedPage, finalPage, HEALER_ACTIVITY_MAX_PAGE)
  const rows = count ? await prisma.payment.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * HEALER_ACTIVITY_PAGE_SIZE,
    take: HEALER_ACTIVITY_PAGE_SIZE,
    select: {
      id: true, createdAt: true, amountPaise: true,
      booking: { select: { id: true, scheduledAt: true, service: { select: { name: true } } } },
    },
  }) : []
  const totalPaise = aggregate._sum.amountPaise ?? 0

  return (
    <main className="space-y-7">
      <header className="space-y-2">
        <Link href="/healer" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Back to practitioner dashboard</Link>
        <h1 className="text-3xl font-bold">Session payment activity</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Review gross captured INR payments for sessions assigned to your practitioner profile.
          These are customer payment amounts, <strong>not your payable earnings, commission, settled payouts or balance due</strong>.
          Refunded payments are excluded. Payout details require separate reconciliation by the Ganges Healers team.
        </p>
      </header>

      <nav aria-label="Session payment period" className="flex flex-wrap gap-2">
        {HEALER_ACTIVITY_PERIODS.map(value =>
          <Link key={value} href={healerActivityHref(value)} aria-current={period === value ? 'page' : undefined}
            className={'rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted ' + (period === value ? 'border-primary bg-muted' : '')}>
            {value === 'month' ? 'This month (IST)' : value === '90days' ? 'Last 90 days' : 'All time'}
          </Link>,
        )}
      </nav>

      <section aria-label="Gross session collections" className="grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Gross captured session payments</h2>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{money.format(totalPaise / 100)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Before platform fees, refunds in progress and any practitioner settlement calculation.</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Payments in this period</h2>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{count}</p>
          <p className="mt-1 text-xs text-muted-foreground">Only successfully captured, INR-denominated session booking records.</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Payment records</h2>
        <a href={'/api/healer/earnings/export?period=' + encodeURIComponent(period)}
          className="inline-flex rounded-md border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">
          Download payment CSV
        </a>
      </div>
      {rows.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed p-6">
          <p className="text-sm text-muted-foreground">No captured session payments were found for this period.</p>
          {period !== 'all' && <Link href={healerActivityHref('all')} className="text-sm font-medium text-primary hover:underline">View all payment activity</Link>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b bg-muted/50">
              <tr><th scope="col" className="px-4 py-3">Payment record (IST)</th><th scope="col" className="px-4 py-3">Session (IST)</th><th scope="col" className="px-4 py-3">Service</th><th scope="col" className="px-4 py-3 text-right">Gross amount</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(row => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-3">{dateTime.format(row.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{row.booking ? dateTime.format(row.booking.scheduledAt) : '—'}</td>
                  <td className="max-w-[280px] break-words px-4 py-3">{row.booking?.service.name ?? 'Session'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{money.format(row.amountPaise / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {count > HEALER_ACTIVITY_PAGE_SIZE && (
        <nav aria-label="Session payment pages" className="flex items-center justify-between gap-3">
          {page > 1 ? <Link href={healerActivityHref(period, page - 1)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Previous payments</Link> : <span />}
          <span className="text-sm text-muted-foreground">Page {page} of {finalPage}</span>
          {page < finalPage && page < HEALER_ACTIVITY_MAX_PAGE ? <Link href={healerActivityHref(period, page + 1)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Next payments</Link> : <span />}
        </nav>
      )}
    </main>
  )
}
