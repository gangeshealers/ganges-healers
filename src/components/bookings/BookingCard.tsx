"use client"

import type { NormalizedBooking } from '@/app/dashboard/bookings/page'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import BookingReviewForm, { type BookingReview } from './BookingReviewForm'
import { safeMeetingLink } from '@/lib/bookings/session-delivery'
import { BOOKING_TIME_ZONE } from '@/lib/bookings/time'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { openRazorpayCheckout, type RazorpayResult } from '@/lib/payments/openRazorpayCheckout'

type Props = {
  booking: NormalizedBooking
  onReschedule: () => void
  onCancel: () => void
  onReviewSaved?: (review: BookingReview) => void
  ownerId?: string
  onConfirmed?: () => void
}

function formatLocal(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-IN', { timeZone: BOOKING_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-IN', { timeZone: BOOKING_TIME_ZONE, hour: 'numeric', minute: '2-digit' })} IST`
}

export default function BookingCard({ booking, onReschedule, onCancel, onReviewSaved, ownerId, onConfirmed }: Props) {
  const { serviceName, healerName, startIso, status, isCancelable, isReschedulable } = booking
  const meeting = ['CONFIRMED', 'RESCHEDULED'].includes(status) && !booking.needsConfirmation ? safeMeetingLink(booking.meetingLink) : null

  return (
    <Card className="p-4 space-y-4" data-test="booking-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="font-medium">{serviceName}</div>
          <div className="text-sm text-muted-foreground">with {healerName}</div>
          <div className="text-sm">{formatLocal(startIso)}</div>
          <a className="text-sm underline" href={`/api/bookings/${encodeURIComponent(booking.id)}/calendar`}>Download calendar</a>
          {meeting ? <div><a className="inline-flex rounded-md border px-3 py-2 text-sm font-medium focus-ring" href={meeting} target="_blank" rel="noopener noreferrer">Join session</a></div>
            : ['CONFIRMED', 'RESCHEDULED'].includes(status) && !booking.needsConfirmation ? <p className="text-sm text-muted-foreground">Your practitioner will add the session link here.</p> : null}
          <div className={cn('text-xs inline-flex rounded px-2 py-0.5 border',
            status === 'CANCELLED' ? 'border-destructive text-destructive' : 'border-muted-foreground text-muted-foreground'
          )} aria-label={`status ${status}`}>{status}</div>
        </div>
        {['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(status) ? <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!isReschedulable} onClick={onReschedule} aria-disabled={!isReschedulable} title={!isReschedulable ? 'Cannot reschedule within 24h' : 'Reschedule'}>
            Reschedule
          </Button>
          <Button variant="destructive" disabled={!isCancelable} onClick={onCancel} aria-disabled={!isCancelable} title={!isCancelable ? 'Cannot cancel within 24h' : 'Cancel'}>
            Cancel
          </Button>
        </div> : null}
      </div>
      {status === 'CANCELLED' && booking.cancellationRefund ? <section aria-label="Cancellation outcome" className="space-y-2 border-t pt-3 text-sm"><p role="status">{booking.cancellationRefund.message}</p>{booking.cancellationRefund.refundPaise > 0 ? <p className="text-muted-foreground">{booking.cancellationRefund.status === 'SUCCESS' ? 'Confirmed refund' : booking.cancellationRefund.status === 'PENDING' ? 'Refund being processed' : 'Refund amount for review'}: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(booking.cancellationRefund.refundPaise / 100)}</p> : null}</section> : null}
      {['PENDING', 'SCHEDULED', 'RESCHEDULED'].includes(status) && booking.needsConfirmation && ownerId && onConfirmed ? (
        <PendingBookingPayment key={`${ownerId}:${booking.id}`} booking={booking} ownerId={ownerId} onConfirmed={onConfirmed} />
      ) : null}
      {status === 'COMPLETED' && (booking.canReview || booking.review) && onReviewSaved ? (
        <BookingReviewForm bookingId={booking.id} serviceName={serviceName} review={booking.review} onSaved={onReviewSaved} />
      ) : null}
    </Card>
  )
}

const checkoutClosed = 'The appointment start time has passed. Checkout and session credits are closed.'

/** Resume the saved booking; keep a paid proof across refreshes until verification succeeds. */
function PendingBookingPayment({ booking, ownerId, onConfirmed }: { booking: NormalizedBooking; ownerId: string; onConfirmed: () => void }) {
  const { data: session, status, update } = useSession()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [paymentStarted, setPaymentStarted] = useState(Boolean(booking.hasPaymentInProgress))
  const [restored, setRestored] = useState(false)
  const pending = useRef<RazorpayResult | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const currentOwner = useRef(session?.user?.id)
  currentOwner.current = session?.user?.id
  const permitted = status === 'authenticated' && session?.user?.id === ownerId
  const storageKey = `ganges-booking-confirmation:${ownerId}:${booking.id}`
  const startsAt = Date.parse(booking.startIso)
  const canStart = startsAt > Date.now()
  const canVerify = permitted && confirming
  const creditEligible = booking.status === 'PENDING' && session?.user?.vip && (session.user.freeSessionCredits ?? 0) > 0

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  useEffect(() => {
    if (!permitted) { setRestored(false); return }
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw || raw.length > 4000) return
      const value: unknown = JSON.parse(raw)
      if (value && typeof value === 'object' && 'razorpay_order_id' in value && 'razorpay_payment_id' in value && 'razorpay_signature' in value
        && typeof value.razorpay_order_id === 'string' && value.razorpay_order_id.length >= 5
        && typeof value.razorpay_payment_id === 'string' && value.razorpay_payment_id.length >= 5
        && typeof value.razorpay_signature === 'string' && /^[a-f0-9]{64}$/i.test(value.razorpay_signature)) {
        pending.current = { razorpay_order_id: value.razorpay_order_id, razorpay_payment_id: value.razorpay_payment_id, razorpay_signature: value.razorpay_signature }
        setConfirming(true)
      }
    } catch { /* In-memory confirmation remains available if browser storage is blocked. */ }
    finally { setRestored(true) }
  }, [storageKey, permitted])

  async function confirm(credit = false) {
    if (inFlight.current || !permitted || !restored || (credit && (pending.current || paymentStarted))) return
    if ((credit || !pending.current) && !(startsAt > Date.now())) {
      setError(checkoutClosed)
      return
    }
    inFlight.current = true
    setBusy(true); setError('')
    const checkOwner = () => { if (!mounted.current || currentOwner.current !== ownerId) throw new Error('Your account changed. Refresh your bookings before continuing.') }
    try {
      checkOwner()
      if (credit) {
        const response = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}/confirm-with-credits`, { method: 'POST' })
        const result = await response.json().catch(() => null)
        checkOwner()
        if (!response.ok || result?.ok !== true) throw new Error(result?.error === 'INVALID_STATE'
          ? 'This booking changed or already has a payment in progress. Refresh your bookings before continuing.'
          : 'A session credit could not be applied. Check your membership and refresh your bookings.')
      } else {
        let proof = pending.current
        if (!proof) {
          setPaymentStarted(true)
          const response = await fetch('/api/payments/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: booking.id }) })
          const quote = await response.json().catch(() => null)
          checkOwner()
          if (!response.ok) throw new Error(quote?.error || 'Payment could not be prepared. Try again.')
          if (!quote || typeof quote.orderId !== 'string' || !quote.orderId || typeof quote.key !== 'string' || !quote.key ||
            !Number.isSafeInteger(quote.amountPaise) || quote.amountPaise <= 0 || quote.currency !== 'INR') throw new Error('Payment could not be prepared. Try again.')
          if (!(startsAt > Date.now())) throw new Error(checkoutClosed)
          proof = await openRazorpayCheckout({ orderId: quote.orderId, amountPaise: quote.amountPaise, key: quote.key,
            description: 'Saved appointment', notes: { bookingId: booking.id }, prefill: { name: session?.user?.name || '', email: session?.user?.email || '' } })
          checkOwner()
          if (proof.razorpay_order_id !== quote.orderId) throw new Error('Payment does not match this booking.')
          pending.current = proof
          setConfirming(true)
          try { sessionStorage.setItem(storageKey, JSON.stringify(proof)) } catch { /* Keep the proof in memory. */ }
        }
        const response = await fetch('/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: proof.razorpay_order_id, paymentId: proof.razorpay_payment_id, signature: proof.razorpay_signature }) })
        const result = await response.json().catch(() => null)
        checkOwner()
        if (!response.ok || result?.verified !== true) throw new Error(result?.error || 'Payment confirmation is pending. Select Confirm payment to check again.')
        pending.current = null
        try { sessionStorage.removeItem(storageKey) } catch { /* Confirmation has already succeeded. */ }
      }
      checkOwner()
      setRestored(false)
      onConfirmed()
      void update?.().catch(() => {})
    } catch (error) {
      setError(pending.current && error instanceof TypeError ? 'We could not confirm your payment. Select Confirm payment to check again.'
        : error instanceof Error && error.message === 'Payment dismissed' ? 'Payment was cancelled. You can continue when ready.'
          : error instanceof Error ? error.message : 'Your booking could not be confirmed. Try again.')
    } finally { inFlight.current = false; setBusy(false) }
  }

  const showActions = canStart || canVerify
  if (!showActions && (!permitted || !error)) return null

  return (
    <div className="space-y-3 border-t pt-3">
      {showActions && <>
        <p className="text-sm text-muted-foreground">
          {canVerify ? 'Check the payment you already submitted for this appointment.' : <>Your appointment is awaiting confirmation. Saved price: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(booking.amountPaise / 100)}.</>}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !permitted || !restored} onClick={() => confirm()}>
            {busy ? 'Processing…' : canVerify ? 'Confirm payment' : 'Continue payment'}
          </Button>
          {canStart && creditEligible && !confirming && !paymentStarted && (
            <Button variant="outline" disabled={busy || !permitted || !restored} onClick={() => confirm(true)}>Use session credit</Button>
          )}
        </div>
      </>}
      {permitted && error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
