import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import Link from 'next/link'
import { invoiceViewerHref } from '@/lib/invoices/viewer-link'
import { BILLING_PAGE_SIZE, BILLING_MAX_PAGE, BILLING_TYPES, billingPageHref, parseBillingFilters, type BillingSearchParams } from '@/lib/invoices/billing-filters'

export const dynamic = 'force-dynamic'

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const typeLabels: Record<(typeof BILLING_TYPES)[number], string> = {
  ALL: 'All purchases',
  SESSION: 'Sessions',
  PROGRAM: 'Programs',
  MEMBERSHIP: 'Memberships',
  STORE: 'Store',
  COURSE: 'Courses',
}

export default async function BillingPage({ searchParams }: { searchParams?: Promise<BillingSearchParams> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=%2Fdashboard%2Fbilling')

  const filters = parseBillingFilters((await searchParams) ?? {})
  const where: Prisma.InvoiceWhereInput = {
    payment: { userId: session.user.id, ...(filters.type !== 'ALL' ? { type: filters.type } : {}) },
    ...(filters.query ? { invoiceNumber: { contains: filters.query, mode: 'insensitive' } } : {}),
  }
  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
    skip: (filters.page - 1) * BILLING_PAGE_SIZE,
    take: BILLING_PAGE_SIZE + 1,
    select: {
      id: true,
      invoiceNumber: true,
      issuedAt: true,
      totalPaise: true,
      payment: { select: { type: true } },
    },
  })
  const hasNextPage = filters.page < BILLING_MAX_PAGE && invoices.length > BILLING_PAGE_SIZE
  const visible = invoices.slice(0, BILLING_PAGE_SIZE)

  return (
    <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">Back to dashboard</Link>
        <h1 className="text-2xl font-bold">Billing history</h1>
        <p className="text-sm text-muted-foreground">
          Find receipts for your sessions, programs, memberships, courses and store purchases.
          Invoices only appear once they have been issued.
        </p>
      </div>

      <form method="get" action="/dashboard/billing" role="search" aria-label="Filter billing history" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_12rem_auto_auto] sm:items-end">
        <div className="space-y-1">
          <label htmlFor="billing-query" className="block text-sm font-semibold">Invoice number</label>
          <input id="billing-query" name="q" type="search" maxLength={80} defaultValue={filters.query} placeholder="Search invoice number" className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="space-y-1">
          <label htmlFor="billing-type" className="block text-sm font-semibold">Purchase type</label>
          <select id="billing-type" name="type" defaultValue={filters.type} className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {BILLING_TYPES.map(type => <option key={type} value={type}>{typeLabels[type]}</option>)}
          </select>
        </div>
        <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Apply filters</button>
        <Link href="/dashboard/billing" className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-semibold hover:bg-muted">Clear</Link>
      </form>

      {visible.length === 0 ? (
        <section role="status" className="space-y-3 rounded-xl border border-dashed p-8 text-center">
          <h2 className="text-lg font-semibold">{filters.page > 1 ? 'No invoices on this page' : filters.query || filters.type !== 'ALL' ? 'No matching invoices' : 'No invoices yet'}</h2>
          <p className="text-sm text-muted-foreground">
            {filters.page > 1 ? 'Return to an earlier page of billing history.' : 'Issued invoices for completed payments will appear here.'}
          </p>
          <Link href={filters.page > 1 ? billingPageHref(filters, filters.page - 1) : '/dashboard/billing'} className="inline-flex rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">
            {filters.page > 1 ? 'Previous page' : 'Show all invoices'}
          </Link>
        </section>
      ) : (
        <section aria-labelledby="billing-results-heading" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="billing-results-heading" className="text-lg font-semibold">Invoices</h2>
            <p className="text-sm text-muted-foreground">Page {filters.page} · {visible.length} shown</p>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <caption className="sr-only">Your issued invoices, newest first</caption>
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-3">Issued</th>
                  <th scope="col" className="px-4 py-3">Invoice</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3 text-right">Amount</th>
                  <th scope="col" className="px-4 py-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(invoice => (
                  <tr key={invoice.id} className="border-t">
                    <td className="whitespace-nowrap px-4 py-3">
                      <time dateTime={invoice.issuedAt.toISOString()}>{invoice.issuedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
                    </td>
                    <td className="break-all px-4 py-3 font-medium">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3">{invoice.payment.type ? typeLabels[invoice.payment.type] : 'Other'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{currency.format(invoice.totalPaise / 100)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link href={invoiceViewerHref({ invoiceNumber: invoice.invoiceNumber, id: invoice.id })} className="font-semibold text-primary underline-offset-4 hover:underline">
                        View invoice
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Billing history pages" className="flex items-center justify-between gap-3">
            {filters.page > 1 ? <Link href={billingPageHref(filters, filters.page - 1)} className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Previous page</Link> : <span />}
            <span className="text-sm text-muted-foreground">Page {filters.page}</span>
            {hasNextPage ? <Link href={billingPageHref(filters, filters.page + 1)} className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Next page</Link> : <span />}
          </nav>
        </section>
      )}
    </main>
  )
}
