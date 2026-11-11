import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

export type CatalogOverviewItem = {
  label: string
  count: number
  href: string
  meaning: string
}

/**
 * Content inventory only. A published/active flag does not establish that
 * copy, availability, delivery providers or prices are launch-approved.
 */
export function AdminCatalogOverview({ items }: { items: CatalogOverviewItem[] }) {
  return (
    <section aria-labelledby="catalog-overview-heading" className="space-y-4">
      <div>
        <h2 id="catalog-overview-heading" className="text-xl font-semibold">Catalog overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Active or published entries in this database. Counts help you find missing content; they do not certify launch readiness.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(item => (
          <Card key={item.href} className="h-full">
            <CardContent className="flex h-full flex-col gap-3 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold">{item.label}</h3>
                <span className="text-3xl font-bold tabular-nums" aria-label={`${item.count} ${item.meaning}`}>{item.count}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {item.count === 0 ? 'No entries currently visible in this section.' : item.meaning}
              </p>
              <Link
                href={item.href}
                className="mt-auto inline-flex w-fit rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Manage {item.label}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
