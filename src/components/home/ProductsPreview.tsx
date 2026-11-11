import Link from 'next/link'
import Image from 'next/image'
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowUpRight, ShoppingBag } from 'lucide-react'

/**
 * Promote only active, available store listings. All stock checks at checkout
 * remain authoritative; this preview does not reserve inventory.
 */
export default async function ProductsPreview() {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      stockStatus: { not: 'OUT' },
      OR: [{ stockCount: null }, { stockCount: { gt: 0 } }],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 4,
    select: {
      id: true,
      slug: true,
      title: true,
      shortDescription: true,
      pricePaise: true,
      imageUrl: true,
      chakra: true,
      isConsecrated: true,
    },
  })

  if (products.length === 0) return null

  return (
    <section aria-labelledby="featured-products-heading" className="py-16">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Explore the store</p>
        <h2 id="featured-products-heading" className="mt-3 text-3xl font-bold">
          Tools for Your Daily Practice
        </h2>
        <p className="mt-3 text-muted-foreground">
          Discover curated wellness tools and read their details before choosing what fits your practice.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {products.map(product => (
          <Link
            key={product.id}
            href={`/store/${product.slug}`}
            className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-lg">
              <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-amber-100 to-violet-100">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                ) : <ShoppingBag aria-hidden="true" className="size-12 text-violet-700/60" />}
                {product.isConsecrated ? (
                  <span className="absolute left-3 top-3 rounded-full bg-amber-950/90 px-2.5 py-1 text-xs font-semibold text-amber-50">
                    Consecrated
                  </span>
                ) : null}
              </div>
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                <h3 className="text-lg font-semibold leading-snug group-hover:text-primary">{product.title}</h3>
                <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">{product.shortDescription}</p>
                {product.chakra ? <p className="text-xs font-medium text-muted-foreground">{product.chakra} Chakra</p> : null}
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-lg font-semibold text-primary">₹{(product.pricePaise / 100).toLocaleString('en-IN')}</span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                    View product <ArrowUpRight aria-hidden="true" className="size-4" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Button asChild size="lg" className="focus-ring">
          <Link href="/store">Browse the Store</Link>
        </Button>
      </div>
    </section>
  )
}
