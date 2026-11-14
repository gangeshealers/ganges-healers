import type { RazorpayResult } from '@/lib/payments/openRazorpayCheckout'

export const bookingCheckoutClosed = 'The appointment start time has passed. Checkout and session credits are closed.'

/** A browser receipt is retained evidence for server verification, never proof of settlement. */
export function decodeBookingPaymentProof(value: unknown): RazorpayResult | null {
  if (!value || typeof value !== 'object') return null
  const fields = value as Record<string, unknown>
  if (typeof fields.razorpay_order_id !== 'string' || fields.razorpay_order_id.length < 5 || fields.razorpay_order_id.length > 256
    || typeof fields.razorpay_payment_id !== 'string' || fields.razorpay_payment_id.length < 5 || fields.razorpay_payment_id.length > 256
    || typeof fields.razorpay_signature !== 'string' || !/^[a-f0-9]{64}$/i.test(fields.razorpay_signature)) return null
  return { razorpay_order_id: fields.razorpay_order_id, razorpay_payment_id: fields.razorpay_payment_id, razorpay_signature: fields.razorpay_signature }
}

/** Keep the established My Bookings key so either entry point can resume the same receipt. */
export function bookingPaymentProofKey(ownerId: string, bookingId: string) {
  return `ganges-booking-confirmation:${ownerId}:${bookingId}`
}

export function readBookingPaymentProof(ownerId: string, bookingId: string): RazorpayResult | null {
  try {
    const raw = sessionStorage.getItem(bookingPaymentProofKey(ownerId, bookingId))
    return raw && raw.length <= 4000 ? decodeBookingPaymentProof(JSON.parse(raw)) : null
  } catch { return null }
}

export function saveBookingPaymentProof(ownerId: string, bookingId: string, proof: RazorpayResult): boolean {
  try {
    const receipt = decodeBookingPaymentProof(proof)
    if (!ownerId || !bookingId || !receipt) return false
    sessionStorage.setItem(bookingPaymentProofKey(ownerId, bookingId), JSON.stringify(receipt))
    return true
  } catch { return false }
}

export function clearBookingPaymentProof(ownerId: string, bookingId: string) {
  try { sessionStorage.removeItem(bookingPaymentProofKey(ownerId, bookingId)) } catch { /* The server already confirmed this receipt. */ }
}
