// components/booking/BookingModal.tsx
'use client'

import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Button } from '@/components/ui/button'
import { Calendar, User, CheckCircle, AlertCircle } from 'lucide-react'
import { openRazorpayCheckout, type RazorpayResult } from '@/lib/payments/openRazorpayCheckout'
import { bookingCheckoutClosed, decodeBookingPaymentProof, saveBookingPaymentProof, clearBookingPaymentProof } from '@/lib/bookings/payment-recovery'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'
import { authPathWithCallback } from '@/lib/auth/callback-url'

interface Healer {
  id: string
  user: {
    name: string
    image?: string
  }
  experienceYears: number
  rating: number
}

interface TimeSlot {
  time: string
  available: boolean
}

interface BookingModalProps {
  isOpen: boolean
  onClose: () => void
  healer: Healer
  serviceId: string
  serviceName: string
  programSlug?: string
  productSlug?: string
}

type SavedBooking = { id: string; ownerId: string; scheduledAt: string; pricePaise: number }
type BookingAttempt = SavedBooking & { credit: boolean; paymentStarted: boolean; proof: RazorpayResult | null }

export default function BookingModal(props: BookingModalProps) {
  const { data: session, status } = useSession()
  const ownerId = session?.user?.id || ''
  if (status === 'loading' && !ownerId) return <Dialog open={props.isOpen} onOpenChange={open => { if (!open) props.onClose() }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{props.serviceName ? `Book ${props.serviceName}` : 'Book a session'}</DialogTitle><DialogDescription>Checking your account before booking.</DialogDescription></DialogHeader><p role="status">Loading your account…</p></DialogContent></Dialog>
  return <BookingFlow key={`${ownerId || 'guest'}:${props.healer.id}:${props.serviceId}:${props.isOpen}`} {...props} />
}

function BookingFlow({
  isOpen,
  onClose,
  healer,
  serviceId,
  serviceName,
  programSlug,
  productSlug,
}: BookingModalProps) {
  const { data: session, status: sessionStatus, update } = useSession()
  const router = useRouter()
  
  const [step, setStep] = useState<'date' | 'time' | 'confirm' | 'processing' | 'success' | 'requested' | 'recovery'>('date')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [savedBooking, setSavedBooking] = useState<SavedBooking | null>(null)
  const [hasProof, setHasProof] = useState(false)
  const [proofStored, setProofStored] = useState(true)
  const attempt = useRef<BookingAttempt | null>(null)
  const inFlight = useRef(false)
  const requiresReview = useRef(false)
  const mounted = useRef(true)
  const currentOwner = useRef(session?.user?.id || '')
  currentOwner.current = session?.user?.id || ''
  const currentAuthStatus = useRef(sessionStatus)
  currentAuthStatus.current = sessionStatus
  const selectedDateRef = useRef(selectedDate)
  selectedDateRef.current = selectedDate
  const availabilityVersion = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const dateId = useId()
  const titleId = useId()
  const titleText = serviceName ? `Book ${serviceName}` : 'Book a session'

  // (Replaced by shared helper openRazorpayCheckout)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('date')
      setSelectedDate('')
      setSelectedTime('')
      setAvailableSlots([])
      setError('')
      // Focus the date input when opening
      setTimeout(() => {
        dateInputRef.current?.focus()
      }, 0)
    }
  }, [isOpen])

  const fetchAvailability = useCallback(async () => {
    const version = ++availabilityVersion.current
    const current = () => mounted.current && version === availabilityVersion.current && selectedDateRef.current === selectedDate
    setAvailableSlots([])
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch(
        `/api/availability?healerId=${encodeURIComponent(healer.id)}&date=${selectedDate}&serviceId=${encodeURIComponent(serviceId)}`
      )
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch availability')
      }

      const data = await response.json()
      if (!current()) return
      const slots: unknown = data?.data?.slots
      if (!Array.isArray(slots) || !slots.every(slot => slot && typeof slot.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.time) && typeof slot.available === 'boolean')) throw new Error('Available times could not be confirmed. Select the date again.')
      setAvailableSlots(slots.filter((slot: TimeSlot) => slot.available))
      
      if (slots.filter((slot: TimeSlot) => slot.available).length === 0) {
        setError('No available slots for this date. Please select another date.')
      }
    } catch (err) {
      if (current()) { setAvailableSlots([]); setError(err instanceof Error ? err.message : 'Failed to load availability') }
    } finally {
      if (current()) setLoading(false)
    }
  }, [healer.id, selectedDate, serviceId])

  // Fetch availability when date is selected
  useEffect(() => {
    if (selectedDate && healer.id) {
      fetchAvailability()
    }
  }, [selectedDate, healer.id, fetchAvailability])

  const handleDateSelect = (date: string) => {
    selectedDateRef.current = date
    setAvailableSlots([])
    setSelectedDate(date)
    setSelectedTime('')
    setStep(date ? 'time' : 'date')
    if (!date) setLoading(false)
  }

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time)
    setStep('confirm')
  }

  const handleBooking = async () => {
    if (inFlight.current || requiresReview.current || sessionStatus === 'loading') return
    const isTest = process.env.NEXT_PUBLIC_TEST_MODE === '1' || process.env.TEST_MODE === '1'
    const ownerId = session?.user?.id || ''
    if (!ownerId && !isTest) {
      const params = new URLSearchParams(window.location.search)
      params.set('openBooking', '1'); params.set('healerId', healer.id)
      if (programSlug) params.set('programSlug', programSlug)
      if (productSlug) params.set('productSlug', productSlug)
      router.push(authPathWithCallback('/auth/signin', `${window.location.pathname}?${params}`))
      return
    }
    const checkOwner = () => {
      if (!mounted.current || currentOwner.current !== ownerId || (ownerId && currentAuthStatus.current !== 'authenticated')) throw new Error('Your account changed. Open My Bookings before continuing.')
    }
    const markConfirmed = () => {
      checkOwner()
      if (attempt.current?.proof) clearBookingPaymentProof(attempt.current.ownerId, attempt.current.id)
      setStep('success')
      if (isTest) (window as unknown as { __e2eBookingConfirmed?: boolean }).__e2eBookingConfirmed = true
      if (ownerId) {
        router.refresh?.()
        void Promise.resolve(update?.()).catch(() => {})
      }
    }
    inFlight.current = true
    setLoading(true); setError('')
    let stage: 'create' | 'credit' | 'order' | 'checkout' | 'verify' = attempt.current ? 'order' : 'create'
    let creationSubmitted = false, creationRejected = false
    try {
      checkOwner()
      if (!attempt.current) {
        const scheduledAt = clinicSlotInstant(selectedDate, selectedTime).toISOString()
        if (!availableSlots.some(slot => slot.time === selectedTime)) throw new Error('Select an available time before requesting this appointment.')
        if (!(Date.parse(scheduledAt) > Date.now())) throw new Error(bookingCheckoutClosed)
        if (isTest && !ownerId) {
          const login = await fetch('/api/test/login?role=USER&vip=1&credits=5', { method: 'GET' })
          checkOwner()
          if (!login.ok) throw new Error('Test sign-in failed')
        }
        creationSubmitted = true
        const response = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ healerId: healer.id, serviceId, scheduledAt }) })
        checkOwner()
        const data = await response.json().catch(() => null)
        checkOwner()
        if (!response.ok) {
          creationRejected = response.status >= 400 && response.status < 500
          throw new Error(data?.error || 'The booking request could not be confirmed.')
        }
        const row = data?.data
        if (!row || typeof row.id !== 'string' || !row.id || row.status !== 'PENDING' || row.scheduledAt !== scheduledAt
          || !Number.isSafeInteger(row.pricePaise) || row.pricePaise < 0 || typeof row.userId !== 'string' || !row.userId || (ownerId && row.userId !== ownerId)) throw new Error('The booking request could not be confirmed.')
        const saved: SavedBooking = { id: row.id, ownerId: ownerId || row.userId, scheduledAt, pricePaise: row.pricePaise }
        attempt.current = { ...saved, credit: !!(session?.user?.vip && (session.user.freeSessionCredits ?? 0) > 0) || (isTest && !ownerId), paymentStarted: false, proof: null }
        setSavedBooking(saved)
        if (isTest) (window as unknown as { __e2eBookingId?: string }).__e2eBookingId = saved.id
        if (saved.pricePaise === 0) { setStep('requested'); return }
      }
      const saved = attempt.current
      if (!saved.proof && !(Date.parse(saved.scheduledAt) > Date.now())) throw new Error(bookingCheckoutClosed)
      setStep('processing')
      if (saved.credit && !saved.paymentStarted) {
        stage = 'credit'
        const response = await fetch(`/api/bookings/${encodeURIComponent(saved.id)}/confirm-with-credits`, { method: 'POST' })
        const body = await response.json().catch(() => null)
        checkOwner()
        if (!response.ok || body?.ok !== true) throw new Error('The session credit result could not be confirmed. Check My Bookings before continuing.')
        markConfirmed()
        return
      }
      if (!saved.proof) {
        stage = 'order'; saved.paymentStarted = true
        const response = await fetch('/api/payments/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: saved.id }) })
        const quote = await response.json().catch(() => null)
        checkOwner()
        if (!response.ok) throw new Error(quote?.error || 'Payment could not be prepared. Try again for this saved appointment.')
        if (!quote || typeof quote.orderId !== 'string' || !quote.orderId || typeof quote.key !== 'string' || !quote.key
          || !Number.isSafeInteger(quote.amountPaise) || quote.amountPaise <= 0 || quote.amountPaise !== saved.pricePaise || quote.currency !== 'INR') { requiresReview.current = true; throw new Error('The saved payment quote could not be confirmed. Open My Bookings before continuing.') }
        if (!(Date.parse(saved.scheduledAt) > Date.now())) throw new Error(bookingCheckoutClosed)
        stage = 'checkout'
        const result = await openRazorpayCheckout({ orderId: quote.orderId, amountPaise: quote.amountPaise, key: quote.key, notes: { bookingId: saved.id }, prefill: { email: session?.user?.email || '', name: session?.user?.name || '' }, description: 'Session payment' })
        const proof = decodeBookingPaymentProof(result)
        if (!proof || proof.razorpay_order_id !== quote.orderId) { requiresReview.current = true; throw new Error('The payment receipt does not match this appointment. Open My Bookings before continuing.') }
        // Retain a submitted receipt under its ORIGINAL owner even if the dialog/account changed.
        saved.proof = proof
        const stored = saveBookingPaymentProof(saved.ownerId, saved.id, proof)
        if (mounted.current) { setHasProof(true); setProofStored(stored) }
        checkOwner()
      }
      stage = 'verify'
      const proof = saved.proof!
      const response = await fetch('/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: proof.razorpay_order_id, paymentId: proof.razorpay_payment_id, signature: proof.razorpay_signature }) })
      const body = await response.json().catch(() => null)
      checkOwner()
      if (!response.ok || body?.verified !== true) throw new Error('Payment confirmation is pending. Select Confirm payment to check the submitted receipt again.')
      markConfirmed()
    } catch (err) {
      if (!mounted.current || currentOwner.current !== ownerId) return
      if ((stage === 'create' && creationSubmitted && !creationRejected && !attempt.current) || stage === 'credit' || requiresReview.current) {
        requiresReview.current = true
        setStep('recovery')
        setError(stage === 'credit' ? 'The session credit result could not be confirmed. Check My Bookings before requesting or paying for another appointment.' : stage === 'create' ? 'The booking request could not be confirmed. Check My Bookings before requesting another appointment.' : err instanceof Error ? err.message : 'The payment result could not be confirmed. Open My Bookings before continuing.')
      } else {
        setStep('confirm')
        setError(attempt.current?.proof && err instanceof TypeError ? 'We could not confirm your payment. Select Confirm payment to check the submitted receipt again.'
          : err instanceof Error && err.message === 'Payment dismissed' ? 'Payment was cancelled. Your appointment request is saved; you can continue payment when ready.'
            : err instanceof Error ? err.message : 'Your appointment could not be confirmed.')
      }
    } finally {
      inFlight.current = false
      if (mounted.current && currentOwner.current === ownerId) setLoading(false)
    }
  }

  const handleClose = () => { if (!inFlight.current) onClose() }
  const viewBookings = () => { if (!inFlight.current) { onClose(); router.push('/dashboard/bookings') } }

  const formatDate = (dateStr: string) => {
    return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    })
  }

  const formatTime = (timeStr: string) => {
    return new Date(`2000-01-01T${timeStr}:00`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent className="sm:max-w-md" aria-labelledby={titleId}>
        <DialogHeader>
          {/* Exactly one title, always present. Visible with serviceName, otherwise visually hidden */}
          {serviceName ? (
            <DialogTitle id={titleId}>{titleText}</DialogTitle>
          ) : (
            <VisuallyHidden asChild>
              <DialogTitle id={titleId}>{titleText}</DialogTitle>
            </VisuallyHidden>
          )}
          {(programSlug || productSlug) ? (
            <div className="mt-1">
              {programSlug ? (<span className="text-xs text-muted-foreground">Context: program {programSlug}</span>) : null}
              {productSlug ? (<span className="ml-2 text-xs text-muted-foreground">Context: product {productSlug}</span>) : null}
            </div>
          ) : null}
        </DialogHeader>
        <DialogDescription className="sr-only">
          Select a date and time, then confirm your booking.
        </DialogDescription>

        <div className="space-y-6">
          {/* Healer Info */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold">{healer.user.name}</h3>
              <p className="text-sm text-gray-600">
                {healer.experienceYears} years experience{healer.rating > 0 ? ` • ⭐ ${healer.rating.toFixed(1)}` : ' • No reviews yet'}
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p role="alert" className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Step 1: Date Selection */}
          {step === 'date' && (
            <div className="space-y-3">
              <label className="text-sm font-medium" htmlFor={dateId}>Select Date</label>
              <div className="flex items-center gap-2 p-3 border rounded-lg">
                <Calendar className="w-4 h-4 text-gray-500" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateSelect(e.target.value)}
                  min={clinicDate(new Date())}
                  max={clinicDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))}
                  className="flex-1 outline-none"
                  ref={dateInputRef}
                  id={dateId}
                />
              </div>
            </div>
          )}

          {/* Step 2: Time Selection */}
          {step === 'time' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Available times for {formatDate(selectedDate)} (India time)
                </label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setStep('date')}
                >
                  Change Date
                </Button>
              </div>
              
              {loading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto"></div>
                  <p className="text-sm text-gray-600 mt-2">Loading available times...</p>
                </div>
              ) : availableSlots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {availableSlots.map((slot) => (
                    <Button
                      key={slot.time}
                      variant="outline"
                      className="text-sm"
                      onClick={() => handleTimeSelect(slot.time)}
                    >
                      {formatTime(slot.time)}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <h3 className="font-medium">Confirm Booking</h3>
              <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Service:</span>
                  <span className="font-medium">{serviceName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Healer:</span>
                  <span className="font-medium">{healer.user.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Date:</span>
                  <span className="font-medium">{formatDate(selectedDate)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Time (India):</span>
                  <span className="font-medium">{formatTime(selectedTime)}</span>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setStep('time')} 
                  className="flex-1"
                  disabled={loading || !!savedBooking}
                >
                  Back
                </Button>
                <Button onClick={handleBooking} disabled={loading || sessionStatus === 'loading'} className="flex-1">
                  {loading ? 'Processing...' : hasProof ? 'Confirm payment' : savedBooking ? 'Continue payment' : 'Confirm & Pay'}
                </Button>
              </div>
            </div>
          )}

          {savedBooking && step === 'confirm' ? <div className="space-y-2 text-sm"><p role="status">Your appointment request is saved. Continue with this appointment or open My Bookings to review it.</p><p>Saved price: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(savedBooking.pricePaise / 100)}.</p>{hasProof && !proofStored ? <p role="alert">Your browser could not retain the payment receipt. Keep this window open while confirming payment.</p> : null}<Button variant="outline" onClick={viewBookings}>View My Bookings</Button></div> : null}
          {step === 'recovery' ? <Button onClick={viewBookings} className="w-full">View My Bookings</Button> : null}

          {/* Step 4: Processing Payment / Credits */}
          {step === 'processing' && (
            <div className="text-center space-y-4 py-8">
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Processing...</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {hasProof ? 'Checking the payment receipt you already submitted' : session?.user?.vip && (session.user.freeSessionCredits ?? 0) > 0 ? 'Applying VIP credit' : 'Opening secure payment gateway'}
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Success */}
          {step === 'requested' && (
            <div className="text-center space-y-4">
              <h3 className="text-lg font-semibold">Booking request received</h3>
              <p role="status" className="text-sm text-gray-600">This free appointment is awaiting practitioner confirmation. No payment or session credit is required. Check My Bookings for updates.</p>
              <Button onClick={viewBookings} className="w-full">View My Bookings</Button>
            </div>
          )}
          {step === 'success' && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="w-16 h-16 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-green-700">Booking Confirmed!</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Your booking for {formatDate(selectedDate)} at {formatTime(selectedTime)} has been confirmed.
                </p>
              </div>
              <Button onClick={handleClose} className="w-full">
                Done
              </Button>
            </div>
          )}

          {/* Cancel Button for date/time steps */}
          {(step === 'date' || step === 'time') && (
            <Button variant="outline" onClick={handleClose} className="w-full">
              Cancel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
