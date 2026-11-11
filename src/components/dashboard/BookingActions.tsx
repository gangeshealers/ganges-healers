import Link from 'next/link'

interface Props { bookingId: string }

/**
 * A dashboard preview is not an availability editor or a refund decision.
 * Route changes through the version-bound booking review dialogs instead.
 */
export default function BookingActions({ bookingId }: Props) {
  const id = encodeURIComponent(bookingId)
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={'/dashboard/bookings?reschedule=' + id}
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Reschedule
      </Link>
      <Link href={'/dashboard/bookings?cancel=' + id}
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Review cancellation
      </Link>
    </div>
  )
}
