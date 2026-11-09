import { renderToStaticMarkup } from 'react-dom/server'
import ListPage from '@/app/admin/booking-emails/page'
import DetailPage from '@/app/admin/booking-emails/[id]/page'
import * as review from '@/lib/admin/booking-emails'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: jest.fn() }, $queryRaw: jest.fn(),
} }))
jest.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) }, notFound: () => { throw new Error('NOT_FOUND') } }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('next/link', () => 'a')
jest.mock('@/components/admin/catalog-editor', () => ({ CatalogEditor: 'form' }))
jest.mock('@/components/admin/booking-email-review-form', () => ({ BookingEmailReviewForm: jest.fn(() => null) }))
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const actor = jest.requireMock<{ requireCurrentAdmin: jest.Mock }>('@/lib/admin/auth').requireCurrentAdmin
const db = jest.requireMock<{ prisma: { user: { findUnique: jest.Mock }; $queryRaw: jest.Mock } }>('@/lib/prisma').prisma
const form = jest.requireMock<{ BookingEmailReviewForm: jest.Mock }>('@/components/admin/booking-email-review-form').BookingEmailReviewForm
const row: review.ReviewedEmail = {
  id: 'event', bookingId: 'booking', kind: 'CONFIRMED', status: 'REVIEW', attempts: 2,
  firstAttemptAt: new Date('2026-01-01'), nextAttemptAt: new Date('2026-01-01'), leaseUntil: null,
  reason: 'PROVIDER_UNCONFIRMED', providerMessageId: null, sentAt: null, version: 'a'.repeat(64),
  recipient: 'staff-only@example.test', hasPayload: true, scheduledAt: new Date('2099-01-01'),
  bookingStatus: 'CONFIRMED', customerName: 'Customer', serviceName: 'Session fixture', healerName: 'Healer',
}
beforeEach(() => {
  jest.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } })
  actor.mockResolvedValue({ id: 'admin' })
  db.user.findUnique.mockResolvedValue({ id: 'admin', role: 'ADMIN' })
  db.$queryRaw.mockResolvedValue([])
  jest.spyOn(review, 'loadBookingEmailReview').mockResolvedValue(row)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { jest.restoreAllMocks() })

test.each(['guest', 'USER', 'revoked'] as const)('%s cannot read either workspace before delivery queries', async state => {
  if (state === 'guest') auth.mockResolvedValue(null)
  if (state === 'USER') auth.mockResolvedValue({ user: { id: 'member', role: 'USER' } })
  if (state === 'revoked') db.user.findUnique.mockResolvedValue(null)
  const target = state === 'guest' ? '/auth/signin' : '/'
  await expect(ListPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(`REDIRECT:${target}`)
  await expect(DetailPage({ params: Promise.resolve({ id: 'event' }) })).rejects.toThrow(`REDIRECT:${target}`)
  expect(db.$queryRaw).not.toHaveBeenCalled()
  expect(review.loadBookingEmailReview).not.toHaveBeenCalled()
})

test('the existing queue keeps safe reasons, bounded pagination and booking lookup when linking to private review', async () => {
  db.$queryRaw.mockResolvedValue(Array.from({ length: 26 }, (_, i) => ({ ...row, id: `event-${i}`, updatedAt: new Date('2026-01-01') })))
  const html = renderToStaticMarkup(await ListPage({ searchParams: Promise.resolve({ status: 'REVIEW', page: '2', booking: 'booking' }) }))
  expect(html).toContain('status=REVIEW&amp;booking=booking&amp;page=3')
  expect(html).toContain('/admin/booking-emails/event-0')
  expect(html).not.toContain('/admin/booking-emails/event-25')
  expect(html).not.toMatch(/staff-only@/)
  const query = db.$queryRaw.mock.calls[0][0]
  expect(query.values).toContain('booking')
  expect(query.values).toContain(25)
  expect(query.values).toContain(26)
})

test('detail renders authorized recipient context but never serializes the frozen body/token into the form', async () => {
  const html = renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ id: 'event' }) }))
  expect(html).toContain('staff-only@example.test')
  expect(html).not.toMatch(/private-rendered-payload|private-claim/)
  const props = form.mock.calls[0][0]
  expect(props).toMatchObject({ actorId: 'admin', record: { id: 'event', status: 'REVIEW' } })
  expect(JSON.stringify(props)).not.toMatch(/staff-only@|private-rendered-payload|claimToken|payload/)
})

test('the server action obtains the current actor and preserves structured stale-state errors', async () => {
  renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ id: 'event' }) }))
  const input = { ownerId: 'admin', id: 'event', version: 'a'.repeat(64), reason: 'Verified', decision: 'stopped' }
  const write = jest.spyOn(review, 'reconcileBookingEmail').mockRejectedValue(new review.BookingEmailReviewError('Reload this record.', 409, 'EMAIL_CHANGED'))
  expect(await form.mock.calls[0][0].onSave(input)).toEqual({ success: false, error: 'Reload this record.', code: 'EMAIL_CHANGED' })
  expect(actor).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledWith('admin', input)
})

test('the server action redacts unknown failures and rejects a revoked actor', async () => {
  renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ id: 'event' }) }))
  jest.spyOn(review, 'reconcileBookingEmail').mockRejectedValue(new Error('private database URI'))
  const save = form.mock.calls[0][0].onSave
  expect(await save({})).toMatchObject({ success: false, code: 'REVIEW_FAILED' })
  expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toMatch(/private|database URI/)
  actor.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))
  expect(await save({})).toEqual({ success: false, error: 'Administrator access is required.', code: 'FORBIDDEN' })
})

test('explicit reload rechecks the current account and returns only a fresh review record', async () => {
  renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ id: 'event' }) }))
  const reload = form.mock.calls[0][0].onReload
  const result = await reload()
  expect(result).toMatchObject({ success: true, record: { id: 'event', status: 'REVIEW' } })
  expect(JSON.stringify(result)).not.toMatch(/staff-only@|private-rendered-payload|private-claim/)
  expect(db.user.findUnique).toHaveBeenLastCalledWith({ where: { id: 'admin', role: 'ADMIN', closedAt: null }, select: { id: true } })
  db.user.findUnique.mockResolvedValue(null)
  expect(await reload()).toMatchObject({ success: false, code: 'FORBIDDEN' })
})
