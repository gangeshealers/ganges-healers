import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ORDER_HISTORY_PAGE_SIZE,
  ORDER_HISTORY_MAX_PAGE,
  ORDER_HISTORY_MAX_QUERY_LENGTH,
  orderHistoryHref,
  orderHistoryWhere,
  orderStatusFilters,
  parseOrderHistoryParams,
  type OrderHistorySearchParams,
} from "@/lib/store/order-history"

export const dynamic = "force-dynamic"

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_payment: { label: "Pending Payment", variant: "outline" },
  paid: { label: "Paid", variant: "default" },
  shipped: { label: "Shipped", variant: "secondary" },
  delivered: { label: "Delivered", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrderHistorySearchParams>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const { status: selectedStatus, q, page: selectedPage } = parseOrderHistoryParams(await searchParams)

  const orders = await prisma.order.findMany({
    where: orderHistoryWhere(session.user.id, selectedStatus, q),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (selectedPage - 1) * ORDER_HISTORY_PAGE_SIZE,
    take: ORDER_HISTORY_PAGE_SIZE + 1,
    select: {
      id: true,
      status: true,
      totalPaise: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          quantity: true,
          pricePaise: true,
          product: { select: { slug: true, title: true, imageUrl: true } },
        },
      },
    },
  })

  const hasNextPage = selectedPage < ORDER_HISTORY_MAX_PAGE && orders.length > ORDER_HISTORY_PAGE_SIZE
  const visibleOrders = orders.slice(0, ORDER_HISTORY_PAGE_SIZE)

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">My Orders</h1>

      <form action="/dashboard/orders" method="get" role="search" className="mt-5 space-y-2">
        <label htmlFor="order-history-search" className="block text-sm font-medium">Find an order</label>
        <div className="flex flex-wrap gap-2">
          <input
            id="order-history-search"
            name="q"
            type="search"
            maxLength={ORDER_HISTORY_MAX_QUERY_LENGTH}
            defaultValue={q}
            placeholder="Product name or exact order ID"
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus-ring"
          />
          {selectedStatus !== "all" && <input type="hidden" name="status" value={selectedStatus} />}
          <Button type="submit">Search orders</Button>
          {q && (
            <Button asChild variant="outline">
              <Link href={orderHistoryHref(selectedStatus, "")}>Clear search</Link>
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Search your purchases by product name or full order reference.</p>
      </form>

      <nav aria-label="Filter orders by status" className="mt-5 flex flex-wrap gap-2">
        {orderStatusFilters.map(filter => (
          <Button key={filter.value} asChild size="sm" variant={selectedStatus === filter.value ? "default" : "outline"}>
            <Link
              href={orderHistoryHref(filter.value, q)}
              aria-current={selectedStatus === filter.value ? "page" : undefined}
            >
              {filter.label}
            </Link>
          </Button>
        ))}
      </nav>

      {visibleOrders.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-muted-foreground">
            {selectedPage > 1
              ? "No orders found on this page."
              : q
                ? "No orders match your search."
                : selectedStatus === "all"
                  ? "You haven't placed any orders yet."
                  : "No orders match this status."}
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link href={selectedPage > 1
              ? orderHistoryHref(selectedStatus, q, selectedPage - 1)
              : q ? orderHistoryHref(selectedStatus, "") : selectedStatus === "all" ? "/store" : "/dashboard/orders"}>
              {selectedPage > 1 ? "Previous page" : q ? "Clear search" : selectedStatus === "all" ? "Browse Store" : "Show all orders"}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {q && <p role="status" className="text-sm text-muted-foreground">Showing orders matching “{q}”</p>}
          {visibleOrders.map((order) => {
            const s = statusLabels[order.status] || { label: order.status, variant: "outline" as const }
            return (
              <Card key={order.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                    <div className="mt-1 font-medium">₹{(order.totalPaise / 100).toFixed(2)}</div>
                  </div>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>

                <div className="mt-3 space-y-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      {item.product.imageUrl ? (
                        <Image
                          src={item.product.imageUrl}
                          alt={item.product.title}
                          width={40}
                          height={40}
                          className="w-10 h-10 object-cover rounded"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-muted rounded" />
                      )}
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/store/${encodeURIComponent(item.product.slug)}`}
                          className="text-sm hover:underline truncate block"
                        >
                          {item.product.title}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          Qty: {item.quantity} — ₹{(item.pricePaise / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="break-all text-xs text-muted-foreground">Order ID: {order.id}</span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/orders/${encodeURIComponent(order.id)}`}>View details</Link>
                  </Button>
                </div>
              </Card>
            )
          })}
          <nav aria-label="Order history pages" className="flex items-center justify-between gap-3 pt-3">
            {selectedPage > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={orderHistoryHref(selectedStatus, q, selectedPage - 1)}>Previous page</Link>
              </Button>
            ) : <span />}
            <span className="text-sm text-muted-foreground">Page {selectedPage}</span>
            {hasNextPage ? (
              <Button asChild variant="outline" size="sm">
                <Link href={orderHistoryHref(selectedStatus, q, selectedPage + 1)}>Next page</Link>
              </Button>
            ) : <span />}
          </nav>
        </div>
      )}
    </div>
  )
}
