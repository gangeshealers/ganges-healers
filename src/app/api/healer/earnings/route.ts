import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'
import { healerActivityStart } from '@/lib/healer/payment-activity'

export async function GET() {
  try {
    const { healer } = await requireHealer()

    const now = new Date()
    const monthStart = healerActivityStart('month', now)!

    // Total earnings (all time)
    const totalAgg = await prisma.payment.aggregate({
      where: {
        booking: { healerId: healer.id },
        statusEnum: 'SUCCESS',
        currency: 'INR',
      },
      _sum: { amountPaise: true },
      _count: { id: true },
    })

    // This month earnings
    const monthAgg = await prisma.payment.aggregate({
      where: {
        booking: { healerId: healer.id },
        statusEnum: 'SUCCESS',
        currency: 'INR',
        createdAt: { gte: monthStart },
      },
      _sum: { amountPaise: true },
    })

    return NextResponse.json({
      success: true,
      data: {
        totalPaise: totalAgg._sum.amountPaise ?? 0,
        totalBookings: totalAgg._count.id,
        thisMonthPaise: monthAgg._sum.amountPaise ?? 0,
      },
    })
  } catch (error: unknown) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status },
      )
    }
    console.error('Healer earnings GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
