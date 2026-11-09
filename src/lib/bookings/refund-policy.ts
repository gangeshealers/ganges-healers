export type RefundBand = 'FULL' | 'HALF' | 'NONE'

export function computeRefund(bookingStart: Date, cancelAt: Date, pricePaise: number): { band: RefundBand; refundPaise: number } {
  const diffMs = bookingStart.getTime() - cancelAt.getTime()
  const hours = diffMs / (1000 * 60 * 60)
  if (hours >= 48) {
    return { band: 'FULL', refundPaise: Math.max(0, Math.floor(pricePaise)) }
  }
  if (hours >= 24) {
    return { band: 'HALF', refundPaise: Math.max(0, Math.floor(pricePaise / 2)) }
  }
  return { band: 'NONE', refundPaise: 0 }
}


export type CancellationRefundStatus = 'NOT_REQUIRED' | 'UNAVAILABLE' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN'
export type CancellationRefund = { band: RefundBand; refundPaise: number; status: CancellationRefundStatus; message: string }

/** Normalize the existing provider/refund status vocabulary without treating simulations as success. */
export function refundStatusFromStored(value: string | null | undefined): CancellationRefundStatus {
  switch ((value || '').toUpperCase()) {
    case 'SUCCESS': case 'PROCESSED': return 'SUCCESS'
    case 'PENDING': return 'PENDING'
    case 'FAILED': return 'FAILED'
    case 'SIMULATED': case 'UNAVAILABLE': return 'UNAVAILABLE'
    default: return 'UNKNOWN'
  }
}

/** Keep cancellation messages shared by mutations and read-only recovery. */
export function cancellationRefundMessage(status: CancellationRefundStatus) {
  switch (status) {
    case 'SUCCESS': return 'Booking cancelled. Razorpay confirmed the refund.'
    case 'PENDING': return 'Booking cancelled. The refund is pending Razorpay confirmation.'
    case 'FAILED': return 'Booking cancelled, but Razorpay reported that the refund failed. Contact support.'
    case 'UNKNOWN': return 'Booking cancelled, but the refund status could not be confirmed. Contact support; do not submit another refund.'
    case 'UNAVAILABLE': return 'Booking cancelled, but an automatic refund is unavailable. Contact support for review.'
    case 'NOT_REQUIRED': return 'Booking cancelled. No cash refund is due for this booking.'
  }
}

/** Validate customer-facing acknowledgments without trusting an HTTP success alone. */
export function isCancellationRefund(value: unknown): value is CancellationRefund {
  if (!value || typeof value !== 'object') return false
  return 'band' in value && (value.band === 'FULL' || value.band === 'HALF' || value.band === 'NONE')
    && 'refundPaise' in value && typeof value.refundPaise === 'number' && Number.isSafeInteger(value.refundPaise) && value.refundPaise >= 0
    && 'status' in value && typeof value.status === 'string' && ['NOT_REQUIRED', 'UNAVAILABLE', 'PENDING', 'SUCCESS', 'FAILED', 'UNKNOWN'].includes(value.status)
    && 'message' in value && typeof value.message === 'string'
}

/** Describe saved cancellation/refund records only; never submit, retry or fetch a provider refund. */
export function storedCancellationRefund(booking: {
  status: string; scheduledAt: Date; updatedAt: Date; pricePaise: number
  payment?: { status: string; statusEnum?: string | null; amountPaise: number; gateway?: string; gatewayPaymentId?: string | null
    refunds?: { amountPaise: number; status: string | null; gatewayRefundId: string | null; reason: string | null }[] } | null
}): CancellationRefund | undefined {
  if (booking.status !== 'CANCELLED') return undefined
  const policy = computeRefund(booking.scheduledAt, booking.updatedAt, booking.pricePaise)
  const payment = booking.payment
  const captured = payment && (payment.statusEnum ? ['SUCCESS', 'REFUNDED'].includes(payment.statusEnum) : ['success', 'refunded'].includes(payment.status.toLowerCase()))
  let status: CancellationRefundStatus = 'NOT_REQUIRED'
  if (!payment || payment.amountPaise <= 0 || policy.refundPaise <= 0 || !captured) {
    return { ...policy, refundPaise: 0, status, message: cancellationRefundMessage(status) }
  }
  status = 'UNAVAILABLE'
  if (payment.amountPaise === booking.pricePaise && payment.gateway?.toLowerCase() === 'razorpay' && payment.gatewayPaymentId) {
    const rows = payment.refunds ?? []
    const successful = rows.filter(row => refundStatusFromStored(row.status) === 'SUCCESS' && row.gatewayRefundId).reduce((sum, row) => sum + row.amountPaise, 0)
    const active = rows.filter(row => ['PENDING', 'UNKNOWN'].includes(refundStatusFromStored(row.status)) || refundStatusFromStored(row.status) === 'SUCCESS' && !row.gatewayRefundId)
    if (active.length) status = active.every(row => refundStatusFromStored(row.status) === 'PENDING' && row.gatewayRefundId) ? 'PENDING' : 'UNKNOWN'
    else if (successful >= policy.refundPaise) status = 'SUCCESS'
    else if (rows.some(row => row.reason === 'booking-cancellation' && refundStatusFromStored(row.status) === 'FAILED')) status = 'FAILED'
  }
  return { ...policy, status, message: cancellationRefundMessage(status) }
}
