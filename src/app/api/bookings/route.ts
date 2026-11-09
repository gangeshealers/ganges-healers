import { isTestMode } from '@/lib/test-mode'
// app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateBookingSlot } from '@/lib/availability'
import { lockTransaction } from '@/lib/db/locks'
import { storedCancellationRefund } from '@/lib/bookings/refund-policy'
import { BookingError, bookingReviewVersion } from '@/lib/bookings/transactions'
import { logActivity } from '@/lib/activity-log'
import { recordBookingEmail, dispatchBookingEmails } from '@/lib/bookings/email'
import { CreateBookingBody } from './types'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const allowedStatuses = ['PENDING','SCHEDULED','CONFIRMED','RESCHEDULED','CANCELLED','COMPLETED'] as const
    const where: { userId: string; status?: typeof allowedStatuses[number] } = { userId: session.user.id }
    if (status) {
      const upper = status.toUpperCase()
      if ((allowedStatuses as readonly string[]).includes(upper)) {
        where.status = upper as typeof allowedStatuses[number]
      }
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        review: { select: { id: true, rating: true, comment: true } },
        healer: {
          include: {
            user: {
              select: {
                name: true,
                image: true
              }
            }
          }
        },
        service: {
          select: {
            name: true,
            category: true,
            slug: true,
          }
        },
        payment: {
          select: {
            status: true, amountPaise: true, statusEnum: true, gateway: true, gatewayPaymentId: true,
            refunds: { select: { amountPaise: true, status: true, gatewayRefundId: true, reason: true } }
          }
        }
      },
      orderBy: {
        scheduledAt: 'desc'
      }
    })

    return NextResponse.json({
      success: true,
      data: bookings.map(booking => ({ ...booking, payment: booking.payment ? { status: booking.payment.status, amountPaise: booking.payment.amountPaise } : null, reviewVersion: bookingReviewVersion(booking), cancellationRefund: storedCancellationRefund(booking) }))
    }, { headers: { 'Cache-Control': 'private, no-store' } })

  } catch (error) {
    console.error('Get bookings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    // In TEST_MODE, allow an override via header for deterministic E2E API calls
    const testUserId = isTestMode() ? request.headers.get('x-test-user-id') : null
    const userId = session?.user?.id || testUserId
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    let json: Record<string, unknown>
    if (isTestMode()) {
      const raw = await request.text().catch(() => '')
      console.debug('[TEST_MODE] /api/bookings POST raw body:', raw || '(none)')
      try {
        json = raw ? JSON.parse(raw) : {}
      } catch (err) {
        console.error('[TEST_MODE] JSON parse failed for /api/bookings POST', err, 'raw:', raw)
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
      }
    } else {
      json = await request.json()
    }
    const parsed = CreateBookingBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const { healerId, serviceId, scheduledAt } = parsed.data
    const scheduledDate = new Date(scheduledAt)
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid scheduledAt date format' },
        { status: 400 }
      )
    }

    // Serialize all slot checks and reservations for this healer. The lock is
    // transaction-scoped, so a competing request rechecks after this commits.
    const booking = await prisma.$transaction(async tx => {
      await lockTransaction(tx, 'healer', healerId)
      const service = await tx.service.findUnique({
        where: { id: serviceId },
        select: { price: true, duration: true, name: true },
      })
      if (!service) throw new BookingError('Service not found or inactive', 409)
      const validation = await validateBookingSlot(healerId, serviceId, scheduledDate, {
        client: tx, durationMin: service.duration,
      })
      if (!validation.valid) throw new BookingError(validation.error || 'Time slot not available', 409)

      const created = await tx.booking.create({
        data: {
          userId,
          healerId,
          serviceId,
          scheduledAt: scheduledDate,
          durationMin: service.duration,
          status: 'PENDING',
          pricePaise: Math.round(service.price * 100),
        },
        include: {
          healer: { include: { user: { select: { name: true, image: true } } } },
          service: { select: { name: true, category: true, duration: true } },
        },
      })
      await recordBookingEmail(tx, created.id, 'REQUESTED')
      return created
    }, { maxWait: 10000, timeout: 10000, isolationLevel: 'ReadCommitted' })

    await dispatchBookingEmails(booking.id)

    await logActivity({ userId: session?.user?.id, action: 'booking_created', entityType: 'booking', entityId: booking.id, metadata: { serviceId: booking.serviceId, healerId: booking.healerId } })
    return NextResponse.json({
      success: true,
      data: booking,
      message: 'Booking created successfully'
    }, { status: 201 })

  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Create booking error:', error)
    
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Time slot already booked' },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
