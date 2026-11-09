import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { BOOKING_EMAIL_REVIEW_ACTION, bookingEmailReviewOutcomes } from '@/lib/bookings/email-review'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { BookingEmailReviewError, bookingEmailReasons, bookingEmailReviewRecord, loadBookingEmailReview, reconcileBookingEmail, type BookingEmailDecisionInput, type BookingEmailDecisionResult } from '@/lib/admin/booking-emails'
import { BookingEmailReviewForm } from '@/components/admin/booking-email-review-form'
import { Card } from '@/components/ui/card'
import { BOOKING_TIME_ZONE } from '@/lib/bookings/time'

export const dynamic = 'force-dynamic'

async function reloadOutcome(ownerId: string, id: string): Promise<BookingEmailDecisionResult> {
  'use server'
  try {
    const actor = await requireCurrentAdmin()
    if (actor.id !== ownerId) throw new BookingEmailReviewError('Your account changed. Reload this page before continuing.', 409, 'SESSION_CHANGED')
    const active = await prisma.user.findUnique({ where: { id: actor.id, role: 'ADMIN', closedAt: null }, select: { id: true } })
    if (!active) throw new BookingEmailReviewError('Administrator access is required.', 403, 'FORBIDDEN')
    if (!id || id.length > 200) throw new BookingEmailReviewError('This delivery record is unavailable.', 404, 'EMAIL_NOT_FOUND')
    const row = await loadBookingEmailReview(id)
    if (!row) throw new BookingEmailReviewError('This delivery record no longer exists.', 404, 'EMAIL_NOT_FOUND')
    return { success: true, record: bookingEmailReviewRecord(row) }
  } catch (error) {
    if (error instanceof BookingEmailReviewError) return { success: false, code: error.code, error: error.message }
    if ((error as { status?: number })?.status === 403) return { success: false, code: 'FORBIDDEN', error: 'Administrator access is required.' }
    console.error('[admin][booking-email][reload_failed]')
    return { success: false, code: 'REVIEW_FAILED', error: 'Delivery could not be loaded. Try reloading the message again.' }
  }
}

async function recordOutcome(input: BookingEmailDecisionInput): Promise<BookingEmailDecisionResult> {
  'use server'
  try {
    const actor = await requireCurrentAdmin()
    const record = await reconcileBookingEmail(actor.id, input)
    revalidatePath('/admin/booking-emails'); revalidatePath(`/admin/booking-emails/${record.id}`)
    return { success: true, record }
  } catch (error) {
    if (error instanceof BookingEmailReviewError) return { success: false, error: error.message, code: error.code }
    if ((error as { status?: number })?.status === 403) return { success: false, error: 'Administrator access is required.', code: 'FORBIDDEN' }
    console.error('[admin][booking-email][review_failed]')
    return { success: false, error: 'The outcome could not be confirmed. Reload this message and review its latest state.', code: 'REVIEW_FAILED' }
  }
}

const date = (value: Date | null) => value ? `${value.toLocaleString('en-IN', { timeZone: BOOKING_TIME_ZONE })} IST` : 'Not recorded'

export default async function BookingEmailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  const actor = await prisma.user.findUnique({ where: { id: session.user.id, closedAt: null }, select: { role: true } })
  if (actor?.role !== 'ADMIN') redirect('/')
  const { id } = await params
  if (!id || id.length > 200) notFound()
  const row = await loadBookingEmailReview(id)
  if (!row) notFound()
  const audit = await prisma.$queryRaw<{ id: string; action: string; createdAt: Date; reason: string | null; outcome: string | null; staffName: string | null }[]>(Prisma.sql`
    SELECT a.id, a.action, a."createdAt", CASE WHEN a.metadata ->> 'outcome' IN (${Prisma.join(bookingEmailReviewOutcomes.map(item => item.value))}) THEN a.metadata ->> 'outcome' END AS outcome, left(a.metadata ->> 'reason', 300) AS reason, u.name AS "staffName"
    FROM "ActivityLog" a LEFT JOIN "User" u ON u.id = a."userId"
    WHERE a."entityType" = 'booking_email' AND a."entityId" = ${row.id}
      AND a.action IN ('booking_email_acceptance_recorded', 'booking_email_retries_stopped', ${BOOKING_EMAIL_REVIEW_ACTION})
    ORDER BY a."createdAt" DESC, a.id DESC LIMIT 10
  `)
  const record = bookingEmailReviewRecord(row)
  return <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
    <Link href="/admin/booking-emails" className="text-sm underline">Back to booking emails</Link>
    <div><h1 className="text-2xl font-semibold">Booking email delivery</h1><p className="mt-2 break-all text-sm text-muted-foreground">Message {row.id}</p></div>
    <Card className="gap-4 p-5"><h2 className="text-lg font-medium">Delivery record</h2>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Message type</dt><dd>{row.kind === 'REQUESTED' ? 'Booking request' : 'Booking confirmation'}</dd></div>
        <div><dt className="text-muted-foreground">Delivery status</dt><dd>{row.status}</dd></div>
        <div><dt className="text-muted-foreground">Saved recipient</dt><dd className="break-all">{row.recipient ?? 'Saved recipient unavailable'}</dd></div>
        <div><dt className="text-muted-foreground">Attempts</dt><dd>{row.attempts}</dd></div>
        <div><dt className="text-muted-foreground">First attempt</dt><dd>{date(row.firstAttemptAt)}</dd></div>
        <div><dt className="text-muted-foreground">Next attempt</dt><dd>{row.status === 'PENDING' ? date(row.nextAttemptAt) : 'Not scheduled'}</dd></div>
        <div><dt className="text-muted-foreground">Acceptance recorded</dt><dd>{date(row.sentAt)}</dd></div>
        <div><dt className="text-muted-foreground">Provider message ID</dt><dd className="break-all">{row.providerMessageId ?? 'Not recorded'}</dd></div>
        <div><dt className="text-muted-foreground">Last outcome</dt><dd>{row.reason ? bookingEmailReasons.get(row.reason) ?? 'Review this notice using its delivery reference.' : 'Not recorded'}</dd></div>
        <div><dt className="text-muted-foreground">Active delivery lease</dt><dd>{record.leaseUntil ? date(new Date(record.leaseUntil)) : 'No active attempt'}</dd></div>
      </dl>
      <p className="break-all text-sm text-muted-foreground">Provider request key: booking-email/{row.id}</p>
      <p className="text-sm text-muted-foreground">Match the saved recipient, first-attempt time and request key to provider records before recording acceptance. A provider-accepted message may still bounce or fail to reach an inbox.</p>
    </Card>
    <Card className="gap-2 p-5"><h2 className="text-lg font-medium">Appointment context</h2><p>{row.serviceName} with {row.healerName || 'Healer'}</p><p className="text-sm">{row.customerName || 'Customer'} · {date(row.scheduledAt)} · {row.bookingStatus}</p><p className="break-all text-sm text-muted-foreground">Booking {row.bookingId}</p></Card>
    <Card className="gap-4 p-5"><h2 className="text-lg font-medium">Reconcile outcome</h2><BookingEmailReviewForm actorId={session.user.id} record={record} onSave={recordOutcome} onReload={reloadOutcome.bind(null, session.user.id, row.id)} /></Card>
    <Card className="gap-4 p-5"><h2 className="text-lg font-medium">Staff review history</h2>
      {audit.length ? <ol className="space-y-4">{audit.map(item => {
        return <li key={item.id} className="border-t pt-3 text-sm"><p>{item.action === BOOKING_EMAIL_REVIEW_ACTION ? bookingEmailReviewOutcomes.find(option => option.value === item.outcome)?.label ?? 'Staff follow-up recorded' : item.action === 'booking_email_acceptance_recorded' ? 'Provider acceptance recorded' : 'Automatic retries stopped'} · {item.staffName || 'Administrator'}</p><p className="text-muted-foreground">{date(item.createdAt)}</p>{item.reason ? <p className="mt-1 break-words">{item.reason}</p> : null}</li>
      })}</ol> : <p className="text-sm text-muted-foreground">No staff decisions recorded.</p>}
    </Card>
  </div>
}
