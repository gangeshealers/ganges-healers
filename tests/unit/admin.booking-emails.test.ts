import { bookingEmailDecisionSchema, bookingEmailReviewRecord, type ReviewedEmail } from '@/lib/admin/booking-emails'
jest.mock('@/lib/prisma', () => ({ prisma: {} }))

const row: ReviewedEmail = {
  id: 'event', bookingId: 'booking', kind: 'CONFIRMED' as const, status: 'REVIEW' as const,
  version: 'a'.repeat(64), recipient: 'private@example.test', hasPayload: true,
  attempts: 2, firstAttemptAt: new Date('2026-01-01'), nextAttemptAt: new Date('2026-01-01'),
  leaseUntil: null, reason: 'PROVIDER_UNCONFIRMED', providerMessageId: null,
  sentAt: null, scheduledAt: new Date('2099-01-01'), bookingStatus: 'CONFIRMED', serviceName: 'Session', customerName: null, healerName: null,
}
const now = new Date('2026-01-02')

test('review records expose no payload or claim token', () => {
  const record = bookingEmailReviewRecord(row, now)
  expect(record).toMatchObject({ canAccept: true, canStop: true, status: 'REVIEW' })
  expect(JSON.stringify(record)).not.toMatch(/private|Private content|claimToken|payload/)
})

test.each(['PENDING', 'REVIEW', 'SKIPPED'] as const)('a previously attempted %s message can record externally verified acceptance', status => {
  expect(bookingEmailReviewRecord({ ...row, status }, now).canAccept).toBe(true)
})

test('active leases block both decisions and terminal states cannot be stopped', () => {
  expect(bookingEmailReviewRecord({ ...row, leaseUntil: new Date('2026-01-03') }, now)).toMatchObject({ canAccept: false, canStop: false })
  expect(bookingEmailReviewRecord({ ...row, status: 'SENT' }, now)).toMatchObject({ canAccept: false, canStop: false })
  expect(bookingEmailReviewRecord({ ...row, status: 'SKIPPED' }, now).canStop).toBe(false)
})

test('an unattempted intent can be stopped but cannot claim provider acceptance', () => {
  expect(bookingEmailReviewRecord({ ...row, status: 'PENDING', attempts: 0, firstAttemptAt: null, hasPayload: false }, now)).toMatchObject({ canAccept: false, canStop: true })
})

test('decision inputs require reviewed identity, reason and safe provider references', () => {
  const base = { ownerId: 'admin', id: 'event', version: 'a'.repeat(64), reason: ' Verified with provider ' }
  expect(bookingEmailDecisionSchema.parse({ ...base, decision: 'accepted', providerMessageId: ' provider_123 ' })).toMatchObject({ reason: 'Verified with provider', providerMessageId: 'provider_123' })
  for (const providerMessageId of ['', 'short', 'private@example.test', 'https://provider.test/id', 'a'.repeat(161)]) {
    expect(bookingEmailDecisionSchema.safeParse({ ...base, decision: 'accepted', providerMessageId }).success).toBe(false)
  }
  expect(bookingEmailDecisionSchema.safeParse({ ...base, decision: 'stopped', status: 'SENT' }).success).toBe(false)
  expect(bookingEmailDecisionSchema.safeParse({ ...base, decision: 'stopped', reason: ' ' }).success).toBe(false)
})
