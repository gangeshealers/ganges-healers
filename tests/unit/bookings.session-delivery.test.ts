import { bookingDeliveryState, healerBookingCapabilities, safeMeetingLink, type DeliveryBooking } from '@/lib/bookings/session-delivery'

const now = Date.parse('2030-01-01T00:00:00Z')
const booking: DeliveryBooking = { scheduledAt: '2030-01-02T00:00:00Z', durationMin: 60, status: 'CONFIRMED', pricePaise: 1000, payment: null }
test.each(['javascript:alert(1)', 'http://meeting.example.test', '//meeting.example.test', 'data:text/html,test', 'https://user:secret@meeting.example.test', 'https://meeting.example.test/a\r\nSUMMARY:bad', '', null])('rejects unsafe meeting link %s', value => { expect(safeMeetingLink(value)).toBeNull() })
test('normalizes a public HTTPS link without fetching it', () => { expect(safeMeetingLink(' https://meeting.example.test ')).toBe('https://meeting.example.test/') })
test('future confirmed appointments accept links and cannot be prematurely completed', () => {
  expect(healerBookingCapabilities(booking, now)).toMatchObject({ canSetMeetingLink: true, canComplete: false })
})
test.each(['CONFIRMED', 'RESCHEDULED'])('an ended %s appointment can be completed at its exact end', status => {
  expect(healerBookingCapabilities({ ...booking, scheduledAt: '2029-12-31T23:00:00Z', status, payment: { status: 'success', amountPaise: 1000 } }, now)).toMatchObject({ canComplete: true, canSetMeetingLink: false })
})
test.each([0, -1, 1441, Number.NaN])('invalid stored duration %s cannot authorize session delivery', durationMin => {
  expect(healerBookingCapabilities({ ...booking, durationMin }, now)).toMatchObject({ canComplete: false, canSetMeetingLink: false })
})
test('unpaid positive-price bookings cannot be confirmed; explicit free appointments can', () => {
  expect(healerBookingCapabilities({ ...booking, status: 'PENDING' }, now).canConfirm).toBe(false)
  expect(healerBookingCapabilities({ ...booking, status: 'PENDING', pricePaise: 0 }, now).canConfirm).toBe(true)
})
test('captured payments must match the saved price, and an enum cannot be bypassed by a legacy status string', () => {
  const payment = { status: 'success', statusEnum: 'SUCCESS', amountPaise: 1000, gateway: 'razorpay' }
  expect(healerBookingCapabilities({ ...booking, status: 'PENDING', payment }, now)).toMatchObject({ canConfirm: true, canCancel: false, cancellationNeedsReview: true })
  expect(healerBookingCapabilities({ ...booking, status: 'PENDING', payment: { ...payment, amountPaise: 1 } }, now).canConfirm).toBe(false)
  expect(healerBookingCapabilities({ ...booking, status: 'PENDING', payment: { ...payment, statusEnum: 'REFUNDED' } }, now).canConfirm).toBe(false)
})
test('applied VIP credits are preserved by the cancellation guard even for an ambiguous legacy enum', () => {
  const payment = { status: 'success', statusEnum: 'PENDING', amountPaise: 0, gateway: 'vip_credit' }
  expect(healerBookingCapabilities({ ...booking, payment }, now)).toMatchObject({ canCancel: false, cancellationNeedsReview: true })
})
test.each(['CANCELLED', 'COMPLETED'])('terminal %s bookings cannot be revived or given a join link', status => {
  expect(healerBookingCapabilities({ ...booking, status }, now)).toEqual({ canConfirm: false, canComplete: false, canCancel: false, canSetMeetingLink: false, cancellationNeedsReview: false })
})

test.each([
  null,
  { status: 'pending', statusEnum: 'PENDING', amountPaise: 1000 },
  { status: 'success', statusEnum: 'PENDING', amountPaise: 1000 },
  { status: 'success', statusEnum: 'REFUNDED', amountPaise: 1000 },
  { status: 'success', statusEnum: 'SUCCESS', amountPaise: 1 },
  { status: 'success', statusEnum: 'PENDING', amountPaise: 0, gateway: 'vip_credit' },
])('a reschedule with unverified funding cannot authorize delivery (%#)', payment => {
  const row = { ...booking, status: 'RESCHEDULED', payment }
  expect(bookingDeliveryState(row)).toMatchObject({ confirmed: false, needsConfirmation: true })
  expect(healerBookingCapabilities(row, now).canSetMeetingLink).toBe(false)
  expect(healerBookingCapabilities({ ...row, scheduledAt: '2029-12-31T23:00:00Z' }, now).canComplete).toBe(false)
})

test.each([
  { pricePaise: 1000, payment: { status: 'success', statusEnum: 'SUCCESS', amountPaise: 1000 } },
  { pricePaise: 1000, payment: { status: 'success', amountPaise: 0, gateway: 'vip_credit' } },
  { pricePaise: 0, payment: null },
])('a funded, credit or explicit free reschedule remains deliverable (%#)', funding => {
  const row = { ...booking, status: 'RESCHEDULED', ...funding }
  expect(bookingDeliveryState(row)).toMatchObject({ confirmed: true, needsConfirmation: false })
  expect(healerBookingCapabilities(row, now).canSetMeetingLink).toBe(true)
  expect(healerBookingCapabilities({ ...row, scheduledAt: '2029-12-31T23:00:00Z' }, now).canComplete).toBe(true)
})

test('free requests await practitioner confirmation and historical confirmed rows retain delivery', () => {
  expect(bookingDeliveryState({ ...booking, status: 'PENDING', pricePaise: 0 })).toMatchObject({ confirmed: false, free: true, needsConfirmation: true })
  expect(bookingDeliveryState(booking)).toMatchObject({ confirmed: true, needsConfirmation: false })
})
