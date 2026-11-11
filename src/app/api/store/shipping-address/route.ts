import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { staffShippingAddressSchema } from '@/lib/store/order-shipping'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

/**
 * Optional checkout convenience. Never returns another owner's order details,
 * pending checkout drafts, or an unvalidated shipping-address JSON value.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

    const orders = await prisma.order.findMany({
      where: {
        userId: session.user.id,
        user: { closedAt: null },
        status: { in: ['paid', 'shipped', 'delivered', 'fulfilled'] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: { shippingAddress: true },
    })
    for (const order of orders) {
      const valid = staffShippingAddressSchema.safeParse(order.shippingAddress)
      if (valid.success) return NextResponse.json({ address: valid.data }, { headers })
    }
    return NextResponse.json({ address: null }, { headers })
  } catch (error) {
    console.error('[store][shipping_address][lookup_failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Previous shipping address unavailable' }, { status: 500, headers })
  }
}
