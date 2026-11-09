import { createHash } from 'node:crypto'
import type { Booking, Prisma } from '@prisma/client'
import { lockTransaction } from '@/lib/db/locks'

/** Booking failures retain the route's existing public error and status. */
export class BookingError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'BookingError'
  }
}

/** Lock the healer before an owned mutation; reviewed requests also hold the booking row. */
export async function lockOwnedBooking(client: Prisma.TransactionClient, id: string, userId: string, lockRow = false) {
  const booking = await client.booking.findFirst({ where: { id, userId }, select: { healerId: true } })
  if (!booking) throw new BookingError('Booking not found', 404)
  await lockTransaction(client, 'healer', booking.healerId)
  if (lockRow) await client.$queryRaw`SELECT id FROM "Booking" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE`
  return booking.healerId
}

/** Bind customer changes to the saved appointment, including same-timestamp edits. */
export function bookingReviewVersion(booking: Booking) {
  return createHash('sha256').update(JSON.stringify([
    booking.id, booking.userId, booking.healerId, booking.serviceId, booking.scheduledAt,
    booking.durationMin, booking.status, booking.pricePaise, booking.meetingLink,
    booking.createdAt, booking.updatedAt,
  ])).digest('hex')
}

/** Existing clients may omit If-Match; reviewed changes require one exact strong version. */
export function assertBookingReview(ifMatch: string | null, booking: Booking) {
  if (ifMatch === null) return
  if (!/^"[a-f0-9]{64}"$/.test(ifMatch)) throw new BookingError('Invalid booking review. Reload your bookings before trying again.', 400)
  if (ifMatch !== `"${bookingReviewVersion(booking)}"`) throw new BookingError('Booking changed. Reload your bookings and review the latest appointment before trying again.', 409)
}
