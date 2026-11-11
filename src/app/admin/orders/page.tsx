import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  ADMIN_STORE_ORDER_PAGE_SIZE, ADMIN_STORE_ORDER_MAX_PAGE, ADMIN_STORE_ORDER_QUEUES,
  parseAdminStoreOrders, adminStoreOrdersWhere, adminStoreOrdersHref,
} from '@/lib/admin/order-lookup'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Store order operations | Ganges Healers', robots: { index: false, follow: false } }

type Search = { status?: string | string[]; page?: string | string[]; q?: string | string[] }
const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' })
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  await requireCurrentAdmin()

  const { queue, page: requestedPage, query } = parseAdminStoreOrders(await searchParams)
  const currentQueue = ADMIN_STORE_ORDER_QUEUES.find(x => x.status === queue)!
  const where = adminStoreOrdersWhere(queue, query)
  const count = await prisma.order.count({ where })
  const lastPage = Math.max(1, Math.ceil(count / ADMIN_STORE_ORDER_PAGE_SIZE))
  const page = Math.min(requestedPage, lastPage, ADMIN_STORE_ORDER_MAX_PAGE)
  const sorting = queue === 'paid' ? 'asc' : 'desc'
  const rows = count ? await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: sorting }, { id: sorting }],
    skip: (page - 1) * ADMIN_STORE_ORDER_PAGE_SIZE,
    take: ADMIN_STORE_ORDER_PAGE_SIZE,
    select: {
      id: true, totalPaise: true, status: true, createdAt: true,
      _count: { select: { items: true } },
    },
  }) : []

  return (
    <main className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <Link href="/admin" className="text-sm font-semibold text-primary hover:underline">Back to Admin workspace</Link>
        <h1 className="text-2xl font-semibold">Store orders</h1>
        <p className="text-sm text-muted-foreground">
          Find a saved order across payment and fulfillment states. Only confirmed paid orders can be moved through the existing shipment and delivery workflow.
        </p>
      </header>

      <form action="/admin/orders" method="get" role="search" aria-label="Search saved store orders"
        className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <input type="hidden" name="status" value="all" />
        <label htmlFor="admin-order-reference" className="sr-only">Exact order reference</label>
        <input id="admin-order-reference" name="q" type="search" maxLength={200} defaultValue={query}
          placeholder="Exact order reference"
          className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Find order</button>
        {(query || queue !== 'paid') &&
          <Link href="/admin/orders" className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Clear filters</Link>}
      </form>

      <nav className="flex flex-wrap gap-2" aria-label="Order fulfillment queues">
        {ADMIN_STORE_ORDER_QUEUES.map(item => (
          <Button key={item.status} asChild size="sm" variant={queue === item.status ? 'default' : 'outline'}>
            <Link href={adminStoreOrdersHref(item.status, query)} aria-current={queue === item.status ? 'page' : undefined}>
              {item.label}
            </Link>
          </Button>
        ))}
      </nav>
      <p role="status" className="text-sm text-muted-foreground">
        {count} matching {count === 1 ? 'order' : 'orders'} · Page {page} of {lastPage}
      </p>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map(row => (
            <li key={row.id}>
              <Card className="flex flex-row flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0 space-y-1">
                  <Link href={'/admin/orders/' + encodeURIComponent(row.id)}
                    className="break-all font-medium underline-offset-4 hover:underline">Order {row.id}</Link>
                  <p className="text-sm text-muted-foreground">
                    {date.format(row.createdAt)} · {row._count.items} order lines · {money.format(row.totalPaise / 100)}
                  </p>
                </div>
                <Badge variant="secondary">
                  {row.status === 'paid' ? 'Awaiting shipment' : row.status === 'fulfilled' ? 'Delivered' : row.status.replaceAll('_', ' ')}
                </Badge>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-3 rounded-xl border border-dashed p-7 text-center">
          <p className="text-sm text-muted-foreground">No saved orders match this status or reference.</p>
          <Link href={adminStoreOrdersHref('all')} className="text-sm font-semibold text-primary hover:underline">Show orders across all statuses</Link>
        </div>
      )}
      {count > ADMIN_STORE_ORDER_PAGE_SIZE && (
        <nav aria-label="Order queue pagination" className="flex items-center justify-between gap-3">
          {page > 1 ? <Button asChild variant="outline">
            <Link href={adminStoreOrdersHref(queue, query, page - 1)}>Previous page</Link>
          </Button> : <span />}
          <span className="text-sm text-muted-foreground">Page {page} of {lastPage}</span>
          {page < lastPage && page < ADMIN_STORE_ORDER_MAX_PAGE ? <Button asChild variant="outline">
            <Link href={adminStoreOrdersHref(queue, query, page + 1)}>Next page</Link>
          </Button> : <span />}
        </nav>
      )}
      <p className="text-xs text-muted-foreground">
        Orders and their recorded states are not proof of bank settlement or successful shipment. Confirm those outcomes in the relevant provider and fulfillment records.
      </p>
    </main>
  )
}
