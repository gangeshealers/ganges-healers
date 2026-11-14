"use client"

import { useEffect, useState, useId, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSession } from 'next-auth/react'
import type { NormalizedBooking } from '@/app/dashboard/bookings/page'
import { track } from '@/lib/analytics/client'
import { BOOKING_TIME_ZONE, clinicDate, clinicSlotInstant } from '@/lib/bookings/time'

type Props = {
  open: boolean
  ownerId: string
  onReload: () => void
  onOpenChange: (open: boolean) => void
  booking: NormalizedBooking
  onSuccess: (updated: NormalizedBooking) => void
}

type Slot = { iso: string; label: string }

export default function RescheduleModal(props: Props) {
  const { data, status } = useSession()
  if (!props.open || status !== 'authenticated' || data?.user?.id !== props.ownerId) return null
  return <RescheduleEditor key={`${props.ownerId}:${props.booking.id}`} {...props} />
}

function RescheduleEditor({ open, onOpenChange, booking, onSuccess, onReload }: Props) {
  const [reviewed] = useState(booking)
  const [stale, setStale] = useState(!booking.reviewVersion)
  const mounted = useRef(true), inFlight = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedDatetime, setSelectedDatetime] = useState<string>('')
  const [pending, setPending] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slots, setSlots] = useState<Slot[]>([])
  const [error, setError] = useState<string>('')
  const dateId = useId()
  const titleId = useId()

  // Preview the same owned-booking duration and conflicts checked by PUT.
  useEffect(() => {
    if (!open || !selectedDate || stale) {
      setSlots([])
      return
    }
    const controller = new AbortController()
    setLoadingSlots(true)
    setSlots([])
    setSelectedDatetime('')
    setError('')
    const query = new URLSearchParams({ healerId: reviewed.healerId, date: selectedDate, bookingId: reviewed.id })
    ;(async () => {
      try {
        const response = await fetch(`/api/availability?${query}`, { signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body?.error || 'Could not load available times')
        const available: unknown = body?.data?.slots
        if (!Array.isArray(available) || !available.every((slot: unknown): slot is { time: string; available: boolean } => Boolean(slot && typeof slot === 'object' && 'time' in slot && typeof slot.time === 'string' && /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(slot.time) && 'available' in slot && typeof slot.available === 'boolean'))) throw new Error('Available times could not be confirmed. Reload your bookings.')
        const earliest = Date.now() + 24 * 60 * 60 * 1000
        const options = available.filter(slot => slot.available).map(slot => {
          const instant = clinicSlotInstant(selectedDate, slot.time)
          return {
            iso: instant.toISOString(),
            label: instant.toLocaleTimeString('en-US', { timeZone: BOOKING_TIME_ZONE, hour: 'numeric', minute: '2-digit' }),
          }
        }).filter(slot => new Date(slot.iso).getTime() >= earliest)
        if (!controller.signal.aborted) setSlots(options)
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load available times')
      } finally {
        if (!controller.signal.aborted) setLoadingSlots(false)
      }
    })()
    return () => controller.abort()
  }, [open, selectedDate, reviewed.healerId, reviewed.id, stale])

  async function submit() {
    if (inFlight.current || stale || !reviewed.reviewVersion || !selectedDatetime || !slots.some(slot => slot.iso === selectedDatetime)) return
    if (!reviewed.isReschedulable || Date.parse(reviewed.startIso) - Date.now() < 24 * 60 * 60 * 1000 || Date.parse(selectedDatetime) - Date.now() < 24 * 60 * 60 * 1000) {
      setStale(true); setError('The rescheduling window changed. Reload your bookings before continuing.'); return
    }
    inFlight.current = true
    setPending(true)
    setError('')
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(reviewed.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': `"${reviewed.reviewVersion}"` },
        body: JSON.stringify({ scheduledAt: selectedDatetime }),
      })
      const body = await res.json().catch(() => null)
      if (!mounted.current) return
      if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Rescheduling could not be confirmed.')
      if (body?.success !== true || body?.data?.id !== reviewed.id || body?.data?.status !== 'RESCHEDULED'
        || typeof body.data.reviewVersion !== 'string' || !/^[a-f0-9]{64}$/.test(body.data.reviewVersion)
        || body.data.scheduledAt !== selectedDatetime) throw new Error('Rescheduling result could not be confirmed. Reload your bookings.')
      const newStart = new Date(body.data.scheduledAt)
      const now = Date.now()
      const hoursUntil = (newStart.getTime() - now) / 36e5
      const updated: NormalizedBooking = {
        ...reviewed,
        reviewVersion: body.data.reviewVersion,
        startIso: newStart.toISOString(),
        status: 'RESCHEDULED',
        meetingLink: body.data.meetingLink === null ? null : reviewed.meetingLink,
        needsConfirmation: typeof body.data.needsConfirmation === 'boolean' ? body.data.needsConfirmation : reviewed.needsConfirmation,
        isCancelable: hoursUntil >= 24,
        isReschedulable: hoursUntil >= 24,
      }
      onSuccess(updated)
      track('booking_reschedule_success', { bookingId: reviewed.id, serviceSlug: reviewed.serviceSlug, path: '/dashboard/bookings', ts: Date.now() })
      onOpenChange(false)
    } catch (e) {
      if (mounted.current) { setStale(true); setError(e instanceof Error && !(e instanceof TypeError) ? e.message : 'Rescheduling could not be confirmed. Reload your bookings to check the saved time before trying again.') }
    } finally {
      inFlight.current = false
      if (mounted.current) setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!inFlight.current) onOpenChange(value) }}>
      <DialogContent aria-labelledby={titleId}>
        <DialogHeader>
          <DialogTitle id={titleId}>Reschedule booking</DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">Pick a new time for your session</DialogDescription>

        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm space-y-1"><p className="font-medium">{reviewed.serviceName} with {reviewed.healerName}</p><p>Current time: {new Date(reviewed.startIso).toLocaleString('en-IN', { timeZone: BOOKING_TIME_ZONE })} IST</p><p>Status: {reviewed.status}</p></div>
          <div>
            <label htmlFor={dateId} className="text-sm font-medium">Select date</label>
            <input id={dateId} className="mt-1 w-full border rounded p-2" type="date" disabled={pending || stale} min={clinicDate(new Date(Date.now() + 24 * 60 * 60 * 1000))} value={selectedDate} onChange={(e) => { setSelectedDatetime(''); setSelectedDate(e.target.value) }} />
          </div>
          {selectedDate && (
            <div>
              <div className="text-sm mb-2">Available times (India time)</div>
              {loadingSlots ? <p>Loading available times...</p> : !slots.length && !error ? <p>No available times for this date.</p> : null}
              <div className="grid grid-cols-3 gap-2">
                {slots.map(s => (
                  <Button key={s.iso} type="button" disabled={pending || stale} variant={selectedDatetime === s.iso ? 'default' : 'outline'} onClick={() => setSelectedDatetime(s.iso)}>{s.label}</Button>
                ))}
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {stale && <p className="text-sm text-muted-foreground">Reload bookings to check the saved appointment before choosing another time. This does not repeat the reschedule.</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" disabled={pending} onClick={() => { if (!inFlight.current) onOpenChange(false) }}>Close</Button>
            <Button variant="outline" disabled={pending} onClick={() => { if (!inFlight.current) onReload() }}>Reload bookings</Button>
            <Button onClick={submit} disabled={!selectedDatetime || pending || loadingSlots || stale}>{pending ? 'Saving...' : 'Confirm'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
