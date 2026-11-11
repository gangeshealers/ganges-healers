import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { prisma } from '@/lib/prisma'
import { bookingDeliveryState } from '@/lib/bookings/session-delivery'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Admin booking review | Ganges Healers', robots: { index: false, follow: false },
}
const ist = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
})
const money = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Private, read-only operational review of a specific saved appointment. */
export default async function AdminBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  await requireCurrentAdmin()
  const { id } = await params
  if (!id || id.length > 200) notFound()

  const booking = await prisma.booking.findFirst({
    where: { id },
    select: {
      id: true, status: true, scheduledAt: true, durationMin: true, pricePaise: true,
      createdAt: true, updatedAt: true,
      service: { select: { name: true } },
      user: { select: { name: true, email: true } },
      healer: { select: { user: { select: { name: true } } } },
      payment: { select: {
        status: true, statusEnum: true, amountPaise: true, gateway: true, currency: true,
        refunds: { select: { id: true, status: true, amountPaise: true, createdAt: true } },
      } },
      emails: {
        orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, kind: true, status: true, attempts: true, sentAt: true, nextAttemptAt: true },
      },
    },
  })
  if (!booking) notFound()

  const delivery = bookingDeliveryState(booking)
  const payment = booking.payment
  const amountLabel = payment
    ? payment.currency == null || payment.currency === 'INR'
      ? money(payment.amountPaise)
      : payment.amountPaise + ' minor units (' + payment.currency + ')'
    : null

  return (
    <main className="container mx-auto max-w-4xl space-y-7 px-4 py-8">
      <header className="space-y-2">
        <Link href="/admin/bookings" className="text-sm font-medium text-primary hover:underline">Back to Booking operations</Link>
        <h1 className="text-3xl font-bold">Review booking record</h1>
        <p className="text-sm text-muted-foreground">
          Read-only operational details. This view does not cancel, refund, confirm, email or modify an appointment.
          Provider acceptance and refunds require separate reconciliation.
        </p>
      </header>
      <section aria-labelledby="appointment-details" className="space-y-3 rounded-xl border bg-card p-5">
        <h2 id="appointment-details" className="text-xl font-semibold">{booking.service.name}</h2>
        <p className="break-all font-mono text-xs text-muted-foreground">Booking reference: {booking.id}</p>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="font-medium">Status</dt><dd>{booking.status}</dd></div>
          <div><dt className="font-medium">Session time</dt><dd>{ist.format(booking.scheduledAt)} IST · {booking.durationMin} minutes</dd></div>
          <div><dt className="font-medium">Member</dt><dd>{booking.user.name || 'Member'} ({booking.user.email})</dd></div>
          <div><dt className="font-medium">Practitioner</dt><dd>{booking.healer.user.name || 'Practitioner'}</dd></div>
          <div><dt className="font-medium">Scheduled price</dt><dd>{money(booking.pricePaise)}</dd></div>
          <div><dt className="font-medium">Delivery readiness</dt><dd>{delivery.confirmed ? 'Confirmed for delivery' : 'Not yet confirmed for delivery'}</dd></div>
          <div><dt className="font-medium">Record created</dt><dd>{ist.format(booking.createdAt)} IST</dd></div>
          <div><dt className="font-medium">Record updated</dt><dd>{ist.format(booking.updatedAt)} IST</dd></div>
        </dl>
      </section>
      <section aria-labelledby="payment-review" className="space-y-3 rounded-xl border bg-card p-5">
        <h2 id="payment-review" className="text-xl font-semibold">Payment reconciliation signals</h2>
        {payment ? (
          <>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="font-medium">Recorded payment status</dt><dd>{payment.statusEnum || payment.status}</dd></div>
              <div><dt className="font-medium">Recorded amount</dt><dd>{amountLabel}</dd></div>
              <div><dt className="font-medium">Payment route</dt><dd>{payment.gateway === 'vip_credit' ? 'Session credit' : payment.gateway}</dd></div>
              <div><dt className="font-medium">Funding matches appointment</dt><dd>{delivery.funded ? 'Yes' : 'Not confirmed'}</dd></div>
            </dl>
            <h3 className="font-semibold">Recorded refund attempts</h3>
            {payment.refunds.length === 0 ? <p className="text-sm text-muted-foreground">No refund record attached to this payment.</p> : (
              <ul className="space-y-2">
                {payment.refunds.map(refund => (
                  <li key={refund.id} className="rounded-lg border p-3 text-sm">
                    {payment.currency && payment.currency !== 'INR' ? refund.amountPaise + ' minor units (' + payment.currency + ')' : money(refund.amountPaise)} · {refund.status || 'Status unavailable'} · recorded {ist.format(refund.createdAt)} IST
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : <p className="text-sm text-muted-foreground">No payment record attached. A free booking may not require payment.</p>}
        <p className="text-xs text-muted-foreground">These are saved application records, not a bank settlement statement or proof of an external refund reaching its recipient.</p>
      </section>
      <section aria-labelledby="booking-email-review" className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="booking-email-review" className="text-xl font-semibold">Booking email outbox</h2>
          <Link href="/admin/booking-emails" className="text-sm font-semibold text-primary hover:underline">Review email queue</Link>
        </div>
        {booking.emails.length === 0 ? <p className="text-sm text-muted-foreground">No booking email events recorded.</p> : (
          <ul className="space-y-2">
            {booking.emails.map(email => (
              <li key={email.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <span>{email.kind} · {email.status} · {email.attempts} attempts</span>
                <span className="text-muted-foreground">{email.sentAt ? 'Sent at ' + ist.format(email.sentAt) + ' IST' : 'Not confirmed sent · next attempt ' + ist.format(email.nextAttemptAt) + ' IST'}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">A queued event is not evidence of email provider acceptance. Provider receipts and worker state need separate verification.</p>
      </section>
      <nav aria-label="Related admin reviews" className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/admin/payments" className="text-primary hover:underline">Payment reconciliation</Link>
        <Link href="/admin/booking-emails" className="text-primary hover:underline">Booking emails</Link>
        <Link href="/admin/support" className="text-primary hover:underline">Support requests</Link>
      </nav>
    </main>
  )
}
