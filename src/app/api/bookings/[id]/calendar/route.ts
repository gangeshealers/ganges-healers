import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { Prisma } from '@prisma/client'
import { calendarResponse } from '@/lib/bookings/calendar'
import { bookingDeliveryState } from '@/lib/bookings/session-delivery'
export const dynamic = 'force-dynamic'
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const where: Prisma.BookingWhereInput = { id: (await params).id, ...(session.user.role === 'ADMIN' ? {} : session.user.role === 'HEALER' ? { OR: [{ userId: session.user.id }, { healer: { userId: session.user.id, isActive: true } }] } : { userId: session.user.id }) }
    const row = await prisma.booking.findFirst({ where, select: { id: true, scheduledAt: true, durationMin: true, status: true, updatedAt: true, meetingLink: true, pricePaise: true, payment: { select: { status: true, statusEnum: true, amountPaise: true, gateway: true } }, service: { select: { name: true } }, healer: { select: { user: { select: { name: true } } } } } })
    if (!row) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    const delivery = bookingDeliveryState(row)
    return calendarResponse({ id: `booking-${row.id}`, title: `Ganges Healers · ${row.service.name}`, description: `Session with ${row.healer.user.name || 'your practitioner'}. Status: ${row.status}. Check My Bookings for current details.`, start: row.scheduledAt, durationMin: row.durationMin, updatedAt: row.updatedAt, meetingLink: delivery.confirmed ? row.meetingLink : null, status: row.status === 'CANCELLED' ? 'CANCELLED' : delivery.confirmed || row.status === 'COMPLETED' ? 'CONFIRMED' : 'TENTATIVE' })
  } catch {
    console.error('[bookings][calendar][failed]')
    return NextResponse.json({ error: 'Could not export appointment' }, { status: 500 })
  }
}
