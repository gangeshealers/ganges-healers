import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Prisma, type BookingEmailKind } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BOOKING_TIME_ZONE } from '@/lib/bookings/time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export const dynamic = 'force-dynamic'

const path = '/admin/booking-emails'
const pageSize = 25
const maxPage = 1000
const queues = [
  { status: 'REVIEW', label: 'Needs review' },
  { status: 'PENDING', label: 'Pending' },
  { status: 'SENT', label: 'Provider accepted' },
  { status: 'SKIPPED', label: 'Skipped' },
] as const
const reasons = new Map([
  ['ATTEMPTS_EXHAUSTED', 'The automatic attempt limit was reached.'],
  ['BOOKING_CHANGED', 'The booking or recipient changed after the message was prepared.'],
  ['BOOKING_INACTIVE', 'The booking is no longer eligible for this message.'],
  ['PAYLOAD_INVALID', 'The saved message could not be validated.'],
  ['PROVIDER_UNCONFIRMED', 'The provider did not confirm acceptance.'],
  ['RECIPIENT_INVALID', 'The saved recipient address needs review.'],
  ['RETRY_WINDOW_EXPIRED', 'The automatic retry window ended.'],
])
const dateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: BOOKING_TIME_ZONE,
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
})

type DeliveryRow = {
  id: string
  bookingId: string
  kind: BookingEmailKind
  attempts: number
  reason: string | null
  updatedAt: Date
  nextAttemptAt: Date
  leaseUntil: Date | null
  sentAt: Date | null
  scheduledAt: Date
  serviceName: string
}

/** Staff can inspect recorded delivery outcomes without reading message bodies or sending email. */
export default async function AdminBookingEmailsPage({ searchParams }: {
  searchParams: Promise<{ status?: string | string[]; booking?: string | string[]; page?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')

  const query = await searchParams
  const queue = queues.find(item => item.status === query.status) ?? queues[0]
  const reference = typeof query.booking === 'string' ? query.booking.trim() : ''
  const invalidReference = Array.isArray(query.booking) || Boolean(reference && !/^[a-zA-Z0-9_-]{1,128}$/.test(reference))
  const requestedPage = typeof query.page === 'string' && /^\d+$/.test(query.page) ? Number(query.page) : 1
  const page = Math.min(Math.max(requestedPage, 1), maxPage)
  const order = queue.status === 'PENDING'
    ? Prisma.sql`e."nextAttemptAt" ASC, e.id ASC`
    : queue.status === 'REVIEW'
      ? Prisma.sql`e."createdAt" ASC, e.id ASC`
      : Prisma.sql`e."createdAt" DESC, e.id DESC`
  // React development responses can serialize awaited data. Project safe reason codes in SQL.
  const rows = invalidReference ? [] : await prisma.$queryRaw<DeliveryRow[]>(Prisma.sql`
    SELECT e.id, e."bookingId", e.kind::text AS kind, e.attempts, e."updatedAt",
      e."nextAttemptAt", e."leaseUntil", e."sentAt", b."scheduledAt", s.name AS "serviceName",
      CASE
        WHEN e."lastError" IN (${Prisma.join([...reasons.keys()])}) THEN e."lastError"
        WHEN e."lastError" IS NOT NULL THEN 'OTHER'
      END AS reason
    FROM "BookingEmail" e
    JOIN "Booking" b ON b.id = e."bookingId"
    JOIN "Service" s ON s.id = b."serviceId"
    WHERE e.status = ${queue.status}::"BookingEmailStatus"
      ${reference ? Prisma.sql`AND e."bookingId" = ${reference}` : Prisma.empty}
    ORDER BY ${order}
    LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}
  `).catch(() => {
    console.error('[bookings][email][admin_review_failed]')
    return null
  })

  function href(status: string, currentPage = 1, booking = invalidReference ? '' : reference) {
    const params = new URLSearchParams({ status })
    if (booking) params.set('booking', booking)
    if (currentPage > 1) params.set('page', String(currentPage))
    return `${path}?${params}`
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-5 px-4 py-8">
      <div>
        <Link href="/admin" prefetch={false} className="text-sm underline underline-offset-4">Admin dashboard</Link>
        <h1 className="mt-2 text-2xl font-semibold">Booking emails</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review booking notices and investigate uncertain sends using the delivery reference.</p>
      </div>
      <nav aria-label="Booking email queues" className="flex flex-wrap gap-2">
        {queues.map(item => (
          <Button key={item.status} asChild size="sm" variant={queue.status === item.status ? 'default' : 'outline'}>
            <Link href={href(item.status)} aria-current={queue.status === item.status ? 'page' : undefined}>{item.label}</Link>
          </Button>
        ))}
      </nav>
      <form action={path} method="get" aria-label="Filter booking emails" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="status" value={queue.status} />
        <label className="grid min-w-0 flex-1 gap-1 text-sm sm:max-w-xs">
          Booking reference
          <Input key={href(queue.status)} name="booking" maxLength={128} defaultValue={invalidReference ? '' : reference} />
        </label>
        <Button type="submit" variant="outline">Filter</Button>
        {(reference || invalidReference) && (
          <Button asChild variant="ghost"><Link href={href(queue.status, 1, '')}>Clear filter</Link></Button>
        )}
      </form>
      {queue.status === 'REVIEW' && (
        <p className="text-sm text-muted-foreground">Automatic retries have stopped for these notices. Check provider records before contacting the customer again.</p>
      )}
      {queue.status === 'SENT' && (
        <p className="text-sm text-muted-foreground">These notices have a provider acknowledgment. Check provider records for delivery or bounce status.</p>
      )}
      {invalidReference ? (
        <p role="alert" className="text-sm text-destructive">Enter one valid booking reference.</p>
      ) : rows === null ? (
        <p role="alert" className="text-sm text-destructive">Booking email activity could not be loaded. Submit the filter again to retry.</p>
      ) : rows.length ? (
        <ul aria-label="Booking email activity" className="space-y-3">
          {rows.slice(0, pageSize).map(row => {
            const eligibleAt = row.leaseUntil && row.leaseUntil > row.nextAttemptAt ? row.leaseUntil : row.nextAttemptAt
            return (
              <li key={row.id}>
                <Card className="gap-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{row.kind === 'REQUESTED' ? 'Booking request' : 'Booking confirmation'}</p>
                    <Badge variant={queue.status === 'REVIEW' ? 'destructive' : 'secondary'}>{queue.label}</Badge>
                  </div>
                  <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-muted-foreground">Booking reference</dt><dd className="break-all">{row.bookingId}</dd></div>
                    <div><dt className="text-muted-foreground">Scheduled session</dt><dd>{row.serviceName} · {dateTime.format(row.scheduledAt)}</dd></div>
                    <div><dt className="text-muted-foreground">Delivery reference</dt><dd className="break-all">booking-email/{row.id}</dd></div>
                    <div><dt className="text-muted-foreground">Attempts</dt><dd>{row.attempts}</dd></div>
                    <div><dt className="text-muted-foreground">Last updated</dt><dd>{dateTime.format(row.updatedAt)}</dd></div>
                    {queue.status === 'PENDING' && <div><dt className="text-muted-foreground">Eligible after</dt><dd>{dateTime.format(eligibleAt)}</dd></div>}
                    {queue.status === 'SENT' && row.sentAt && <div><dt className="text-muted-foreground">Accepted at</dt><dd>{dateTime.format(row.sentAt)}</dd></div>}
                  </dl>
                  {row.reason && <p className="text-sm">{reasons.get(row.reason) ?? 'Review this notice using its delivery reference.'}</p>}
                </Card>
              </li>
            )
          })}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No booking emails match this queue and filter.</p>}
      {rows && !invalidReference && (page > 1 || rows.length > pageSize && page < maxPage) && (
        <nav aria-label="Booking email pagination" className="flex flex-wrap gap-3">
          {page > 1 && <Button asChild variant="outline"><Link href={href(queue.status, page - 1)}>Previous page</Link></Button>}
          {rows.length > pageSize && page < maxPage && <Button asChild variant="outline"><Link href={href(queue.status, page + 1)}>Next page</Link></Button>}
        </nav>
      )}
    </div>
  )
}
