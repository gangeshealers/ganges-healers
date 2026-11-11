'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import BookingCard from '../../../components/bookings/BookingCard'
import RescheduleModal from '../../../components/bookings/RescheduleModal'
import CancelDialog from '../../../components/bookings/CancelDialog'
import { track } from '@/lib/analytics/client'
import { toast } from 'sonner'
import type { BookingReview } from '@/components/bookings/BookingReviewForm'
import { isCancellationRefund, type CancellationRefund } from '@/lib/bookings/refund-policy'
import { safeMeetingLink } from '@/lib/bookings/session-delivery'

type ApiBooking = {
  id: string
  reviewVersion?: string
  cancellationRefund?: unknown
  needsConfirmation?: boolean
  userId: string
  healerId: string
  serviceId: string
  scheduledAt: string
  status: 'PENDING'|'SCHEDULED'|'CONFIRMED'|'RESCHEDULED'|'CANCELLED'|'COMPLETED'
  durationMin?: number | null
  pricePaise?: number | null
  meetingLink?: string | null
  healer?: { userId?: string; user?: { name?: string | null } | null } | null
  service?: { name?: string | null; category?: string | null; slug?: string | null } | null
  payment?: { status?: string | null; amountPaise?: number | null } | null
  review?: BookingReview | null
}

export type NormalizedBooking = {
  id: string
  reviewVersion?: string
  cancellationRefund?: CancellationRefund
  serviceSlug: string
  serviceName: string
  healerName: string
  startIso: string
  status: ApiBooking['status']
  isCancelable: boolean
  isReschedulable: boolean
  healerId: string
  serviceId: string
  amountPaise: number
  needsConfirmation?: boolean
  hasPaymentInProgress?: boolean
  isFree?: boolean
  meetingLink?: string | null
  canReview?: boolean
  review?: BookingReview | null
}

export default function MyBookingsPage() {
  const { data: session, status: authStatus } = useSession()
  const userId = session?.user?.id ?? ''
  const [items, setItems] = useState<NormalizedBooking[]>([])
  const [itemsOwner, setItemsOwner] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [activeTab, setActiveTab] = useState('upcoming')

  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)

  const selectedForReschedule = useMemo(() => itemsOwner === userId ? items.find(i => i.id === rescheduleId) || null : null, [items, rescheduleId, itemsOwner, userId])
  const selectedForCancel = useMemo(() => itemsOwner === userId ? items.find(i => i.id === cancelId) || null : null, [items, cancelId, itemsOwner, userId])

  useEffect(() => {
    let mounted = true
    setItems([]); setItemsOwner(''); setRescheduleId(null); setCancelId(null)
    if (authStatus === 'loading') { setLoading(true); return () => { mounted = false } }
    if (!userId) { setLoading(false); setError('Sign in to view your bookings.'); return () => { mounted = false } }
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/bookings', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed to load (${res.status})`)
        const data = await res.json()
        const rows: ApiBooking[] = data?.data || []
        const now = Date.now()
        const normalized: NormalizedBooking[] = rows.map((b) => {
          const start = new Date(b.scheduledAt)
          const hoursUntil = (start.getTime() - now) / 36e5
          const status = b.status
          const active = status !== 'CANCELLED' && status !== 'COMPLETED'
          return {
            id: b.id,
            reviewVersion: typeof b.reviewVersion === 'string' && /^[a-f0-9]{64}$/.test(b.reviewVersion) ? b.reviewVersion : undefined,
            cancellationRefund: isCancellationRefund(b.cancellationRefund) ? b.cancellationRefund : undefined,
            serviceSlug: b.service?.slug || '',
            serviceName: b.service?.name || 'Service',
            healerName: b.healer?.user?.name || 'Healer',
            startIso: start.toISOString(),
            status,
            meetingLink: safeMeetingLink(b.meetingLink),
            isCancelable: active && hoursUntil >= 24,
            isReschedulable: active && hoursUntil >= 24,
            healerId: b.healerId,
            serviceId: b.serviceId,
            amountPaise: Number.isFinite(b.payment?.amountPaise) ? (b.payment?.amountPaise || 0) : (b.pricePaise || 0),
            needsConfirmation: typeof b.needsConfirmation === 'boolean' ? b.needsConfirmation : ['PENDING', 'SCHEDULED', 'RESCHEDULED'].includes(status) && !['success', 'SUCCESS', 'refunded', 'REFUNDED'].includes(b.payment?.status || ''),
            hasPaymentInProgress: Boolean(b.payment),
            isFree: b.pricePaise === 0 && !b.payment,
            canReview: status === 'COMPLETED' && start.getTime() + (b.durationMin ?? 60) * 60000 <= now && b.userId !== b.healer?.userId,
            review: b.review ?? null,
          }
        })
        if (mounted) { setItems(normalized); setItemsOwner(userId) }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load bookings')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [userId, authStatus, reloadVersion])

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    if (itemsOwner !== userId) return { upcoming: [], past: [] }
    const upcoming = items.filter(i => new Date(i.startIso).getTime() > now && i.status !== 'CANCELLED' && i.status !== 'COMPLETED')
    const past = items.filter(i => new Date(i.startIso).getTime() <= now || i.status === 'CANCELLED' || i.status === 'COMPLETED')
    return { upcoming, past }
  }, [items, itemsOwner, userId])

  function onRescheduleOpen(b: NormalizedBooking) {
    setRescheduleId(b.id)
    track('booking_reschedule_open', { bookingId: b.id, serviceSlug: b.serviceSlug, path: '/dashboard/bookings', ts: Date.now() })
  }
  function onCancelOpen(b: NormalizedBooking) {
    setCancelId(b.id)
    track('booking_cancel_open', { bookingId: b.id, serviceSlug: b.serviceSlug, path: '/dashboard/bookings', ts: Date.now() })
  }

  function reloadBookings() {
    setRescheduleId(null); setCancelId(null); setItems([]); setItemsOwner(''); setLoading(true)
    setReloadVersion(v => v + 1)
  }

  function applyUpdate(updated: NormalizedBooking) {
    setItems((prev) => prev.map(i => i.id === updated.id ? updated : i))
  }
  function applyCancel(id: string, cancellationRefund: CancellationRefund) {
    setItems((prev) => prev.map(i => i.id === id ? { ...i, status: 'CANCELLED', cancellationRefund, needsConfirmation: false, isCancelable: false, isReschedulable: false } : i))
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">My Bookings</h1>

      {loading ? (
        <Card aria-live="polite" className="p-6">Loading your bookings…</Card>
      ) : error ? (
        <Card role="alert" className="space-y-4 border-red-200 bg-red-50 p-6">
          <h2 className="font-semibold text-red-900">
            {userId ? 'Your bookings could not be loaded' : 'Sign in to view bookings'}
          </h2>
          <p className="text-sm text-red-800">
            {userId ? 'Please try refreshing your bookings. Your saved appointments have not been changed.' : 'Use your account to view upcoming and past appointments.'}
          </p>
          <div className="flex flex-wrap gap-3">
            {userId ? (
              <button type="button" onClick={reloadBookings} className="rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700">
                Try loading bookings again
              </button>
            ) : (
              <Link href="/auth/signin?callbackUrl=%2Fdashboard%2Fbookings" className="rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700">
                Sign in to see bookings
              </Link>
            )}
            <Link href="/services" className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-900 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700">
              Browse healing services
            </Link>
          </div>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming" className="mt-4 space-y-3">
            {upcoming.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Add your upcoming appointments to your calendar. This is a one-time snapshot; download again after changes.
                </p>
                <a href="/api/bookings/calendar" download="ganges-healers-upcoming.ics" className="inline-flex rounded-md border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Download upcoming calendar
                </a>
              </div>
            )}
            {upcoming.length === 0 ? (
              <Card className="space-y-3 p-6">
                <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
                <p className="text-sm text-muted-foreground">Find a healing service and select an available appointment to get started.</p>
                <Link href="/services" className="inline-flex rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">
                  Explore healing services
                </Link>
              </Card>
            ) : upcoming.map((b) => (
              <BookingCard key={b.id} booking={b} ownerId={userId} onConfirmed={reloadBookings} onReschedule={() => onRescheduleOpen(b)} onCancel={() => onCancelOpen(b)} onReviewSaved={review => applyUpdate({ ...b, review })} />
            ))}
          </TabsContent>
          <TabsContent value="past" className="mt-4 space-y-3">
            {past.length === 0 ? (
              <Card className="space-y-3 p-6">
                <p className="text-sm text-muted-foreground">No past bookings.</p>
                <p className="text-sm text-muted-foreground">Completed and cancelled appointments will appear here when available.</p>
                <Link href="/services" className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">
                  Discover healing sessions
                </Link>
              </Card>
            ) : past.map((b) => (
              <BookingCard key={b.id} booking={b} ownerId={userId} onConfirmed={reloadBookings} onReschedule={() => onRescheduleOpen(b)} onCancel={() => onCancelOpen(b)} onReviewSaved={review => applyUpdate({ ...b, review })} />
            ))}
          </TabsContent>
        </Tabs>
      )}

      {/* Reschedule Modal */}
      {selectedForReschedule && (
        <RescheduleModal
          open={!!selectedForReschedule}
          onOpenChange={(open: boolean) => { if (!open) setRescheduleId(null) }}
          ownerId={userId}
          onReload={reloadBookings}
          booking={selectedForReschedule}
          onSuccess={(updated: NormalizedBooking) => {
            applyUpdate(updated)
            setRescheduleId(null)
          }}
        />
      )}

      {/* Cancel Dialog */}
      {selectedForCancel && (
        <CancelDialog
          open={!!selectedForCancel}
          onOpenChange={(open: boolean) => { if (!open) setCancelId(null) }}
          ownerId={userId}
          onReload={reloadBookings}
          booking={selectedForCancel}
          onSuccess={(result) => {
            applyCancel(selectedForCancel.id, result)
            setCancelId(null)
            if (result.status === 'SUCCESS' || result.status === 'NOT_REQUIRED') {
              toast.success(result.message)
            } else if (result.status === 'PENDING') {
              toast.info(result.message)
            } else {
              toast.error(result.message)
            }
          }}
        />
      )}
    </div>
  )
}
