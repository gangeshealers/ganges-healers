import { bookingPaymentProofKey, decodeBookingPaymentProof, readBookingPaymentProof, saveBookingPaymentProof, clearBookingPaymentProof } from '@/lib/bookings/payment-recovery'

const proof = { razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: 'a'.repeat(64) }
test.each([null, {}, { ...proof, razorpay_signature: 'invalid' }, { ...proof, razorpay_order_id: 'x' }, { ...proof, razorpay_payment_id: 'p'.repeat(257) }])('rejects an invalid browser receipt (%#)', value => {
  expect(decodeBookingPaymentProof(value)).toBeNull()
})
test('retains only the required receipt fields and preserves the established owner-scoped key', () => {
  expect(decodeBookingPaymentProof({ ...proof, metadata: 'private provider data' })).toEqual(proof)
  expect(bookingPaymentProofKey('owner', 'booking')).toBe('ganges-booking-confirmation:owner:booking')
  expect(bookingPaymentProofKey('other', 'booking')).not.toBe(bookingPaymentProofKey('owner', 'booking'))
})
test('missing browser storage cannot throw or pretend a receipt was retained', () => {
  expect(readBookingPaymentProof('owner', 'booking')).toBeNull()
  expect(saveBookingPaymentProof('owner', 'booking', proof)).toBe(false)
  expect(() => clearBookingPaymentProof('owner', 'booking')).not.toThrow()
})
