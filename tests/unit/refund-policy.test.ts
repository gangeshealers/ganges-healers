import { computeRefund, storedCancellationRefund } from '@/lib/bookings/refund-policy'

describe('refund policy bands', () => {
  const price = 10000 // ₹100

  test('<24h => NONE', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const start = new Date(now.getTime() + 23 * 60 * 60 * 1000)
    expect(computeRefund(start, now, price)).toEqual({ band: 'NONE', refundPaise: 0 })
  })

  test('=24h => HALF', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const start = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    expect(computeRefund(start, now, price)).toEqual({ band: 'HALF', refundPaise: 5000 })
  })

  test('<48h => HALF', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const start = new Date(now.getTime() + 36 * 60 * 60 * 1000)
    expect(computeRefund(start, now, price)).toEqual({ band: 'HALF', refundPaise: 5000 })
  })

  test('=48h => FULL', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const start = new Date(now.getTime() + 48 * 60 * 60 * 1000)
    expect(computeRefund(start, now, price)).toEqual({ band: 'FULL', refundPaise: 10000 })
  })

  test('>48h => FULL', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const start = new Date(now.getTime() + 72 * 60 * 60 * 1000)
    expect(computeRefund(start, now, price)).toEqual({ band: 'FULL', refundPaise: 10000 })
  })
})


describe('saved cancellation outcome', () => {
  const cancelledAt = new Date('2026-01-01')
  const booking = { status: 'CANCELLED', scheduledAt: new Date('2026-01-04'), updatedAt: cancelledAt, pricePaise: 10000 }
  const payment = { status: 'success', statusEnum: 'SUCCESS', amountPaise: 10000, gateway: 'razorpay', gatewayPaymentId: 'private-payment-id' }
  const refund = { amountPaise: 10000, status: 'SUCCESS', gatewayRefundId: 'private-refund-id', reason: 'booking-cancellation' }
  test('unpaid/credit and active bookings do not claim a cash refund', () => {
    expect(storedCancellationRefund({ ...booking, status: 'CONFIRMED' })).toBeUndefined()
    expect(storedCancellationRefund(booking)).toMatchObject({ status: 'NOT_REQUIRED', refundPaise: 0 })
    expect(storedCancellationRefund({ ...booking, payment: { ...payment, gateway: 'credits', amountPaise: 0 } })).toMatchObject({ status: 'NOT_REQUIRED', refundPaise: 0 })
  })
  test('only sufficient confirmed saved amounts establish success, with no private references returned', () => {
    const result = storedCancellationRefund({ ...booking, payment: { ...payment, refunds: [refund] } })
    expect(result).toMatchObject({ status: 'SUCCESS', refundPaise: 10000 })
    expect(JSON.stringify(result)).not.toMatch(/private-|gateway|reason/)
    expect(storedCancellationRefund({ ...booking, payment: { ...payment, refunds: [{ ...refund, amountPaise: 5000 }] } })).toMatchObject({ status: 'UNAVAILABLE' })
  })
  test.each(['PENDING', 'UNKNOWN', 'FAILED', 'SIMULATED'] as const)('%s stays distinct from confirmed delivery', status => {
    expect(storedCancellationRefund({ ...booking, payment: { ...payment, refunds: [{ ...refund, status }] } })).toMatchObject({ status: status === 'SIMULATED' ? 'UNAVAILABLE' : status })
  })
  test('missing receipts, conflicting open records and legacy cancellation remain reviewable', () => {
    expect(storedCancellationRefund({ ...booking, payment })).toMatchObject({ status: 'UNAVAILABLE' })
    expect(storedCancellationRefund({ ...booking, payment: { ...payment, refunds: [{ ...refund, status: 'PENDING', gatewayRefundId: null }] } })).toMatchObject({ status: 'UNKNOWN' })
    expect(storedCancellationRefund({ ...booking, payment: { ...payment, refunds: [refund, { ...refund, status: 'UNKNOWN', gatewayRefundId: null }] } })).toMatchObject({ status: 'UNKNOWN' })
    expect(storedCancellationRefund({ ...booking, payment: { ...payment, amountPaise: 5000, refunds: [refund] } })).toMatchObject({ status: 'UNAVAILABLE' })
    expect(storedCancellationRefund({ ...booking, payment: { ...payment, refunds: [{ ...refund, status: 'SUCCESS', gatewayRefundId: null }] } })).toMatchObject({ status: 'UNKNOWN' })
  })
})
