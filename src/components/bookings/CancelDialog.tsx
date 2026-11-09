"use client"

import { useState, useId, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSession } from 'next-auth/react'
import { BOOKING_TIME_ZONE } from '@/lib/bookings/time'
import type { NormalizedBooking } from '@/app/dashboard/bookings/page'
import { isCancellationRefund, type CancellationRefund } from '@/lib/bookings/refund-policy'
import { track } from '@/lib/analytics/client'

type Props = {
  open: boolean
  ownerId: string
  onReload: () => void
  onOpenChange: (open: boolean) => void
  booking: NormalizedBooking
  onSuccess: (result: CancellationRefund) => void
}

export default function CancelDialog(props: Props) {
  const { data, status } = useSession()
  if (!props.open || status !== 'authenticated' || data?.user?.id !== props.ownerId) return null
  return <CancellationEditor key={`${props.ownerId}:${props.booking.id}`} {...props} />
}

function CancellationEditor({ open, onOpenChange, booking, onSuccess, onReload }: Props) {
  const [reviewed] = useState(booking)
  const [stale, setStale] = useState(!booking.reviewVersion)
  const mounted = useRef(true), inFlight = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>('')
  const titleId = useId()

  async function confirm() {
    if (inFlight.current || stale || !reviewed.reviewVersion) return
    if (!reviewed.isCancelable || Date.parse(reviewed.startIso) - Date.now() < 24 * 60 * 60 * 1000) {
      setStale(true); setError('The cancellation window changed. Reload your bookings before continuing.'); return
    }
    inFlight.current = true
    setPending(true)
    setError('')
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(reviewed.id)}`, { method: 'DELETE', headers: { 'If-Match': `"${reviewed.reviewVersion}"` } })
      const j: unknown = await res.json().catch(() => null)
      if (!mounted.current) return
      if (!res.ok) throw new Error(j && typeof j === 'object' && 'error' in j && typeof j.error === 'string' ? j.error : 'Cancellation could not be confirmed.')
      if (!j || typeof j !== 'object' || !('success' in j) || j.success !== true || !('data' in j) || !j.data || typeof j.data !== 'object' || !('id' in j.data) || j.data.id !== reviewed.id || !('status' in j.data) || j.data.status !== 'CANCELLED') {
        throw new Error('Cancellation result could not be confirmed. Reload your bookings.')
      }
      if (!('refund' in j) || !isCancellationRefund(j.refund)) throw new Error('Cancellation result could not be confirmed. Reload your bookings.')
      const result = j.refund
      onSuccess(result)
      track('booking_cancel_success', { bookingId: reviewed.id, serviceSlug: reviewed.serviceSlug, path: '/dashboard/bookings', ts: Date.now() })
      onOpenChange(false)
    } catch (e) {
      if (mounted.current) { setStale(true); setError(e instanceof Error && !(e instanceof TypeError) ? e.message : 'Cancellation could not be confirmed. Reload your bookings to check its current status before trying again.') }
    } finally {
      inFlight.current = false
      if (mounted.current) setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!inFlight.current) onOpenChange(value) }}>
      <DialogContent aria-labelledby={titleId}>
        <DialogHeader>
          <DialogTitle id={titleId}>Cancel booking</DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">Confirm cancellation and review refund policy</DialogDescription>
        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm space-y-1"><p className="font-medium">{reviewed.serviceName} with {reviewed.healerName}</p><p>{new Date(reviewed.startIso).toLocaleString('en-IN', { timeZone: BOOKING_TIME_ZONE })} IST</p><p>Status: {reviewed.status}</p></div>
          <p>Refund eligibility is calculated from your saved booking and payment. Paid Razorpay bookings are eligible for a full refund at least 48 hours before the session, or 50% at least 24 hours before. Unpaid and credit bookings do not receive a cash refund; provider processing may require review.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {stale && <p className="text-sm text-muted-foreground">Reload bookings to check the saved appointment and refund outcome before making another decision. This does not repeat the cancellation.</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" disabled={pending} onClick={() => { if (!inFlight.current) onOpenChange(false) }}>Close</Button>
            <Button variant="outline" disabled={pending} onClick={() => { if (!inFlight.current) onReload() }}>Reload bookings</Button>
            <Button variant="destructive" onClick={confirm} disabled={pending || stale}>{pending ? 'Cancelling...' : 'Confirm cancel'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
