import { GET } from '@/app/api/cron/booking-emails/route'
jest.mock('@/lib/bookings/email', () => ({ drainBookingEmails: jest.fn() }))
const drain = jest.requireMock<{ drainBookingEmails: jest.Mock }>('@/lib/bookings/email').drainBookingEmails
const originalSecret = process.env.CRON_SECRET
beforeEach(() => { drain.mockReset(); jest.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { jest.restoreAllMocks(); if (originalSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = originalSecret })

test.each([undefined, '', ' ', 'configured-secret'])('an unconfigured or incorrect credential cannot drain delivery (%s)', async secret => {
  if (secret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = secret
  const response = await GET(new Request('http://localhost/api/cron/booking-emails', { headers: { authorization: 'Bearer incorrect' } }))
  expect(response.status).toBe(401)
  expect(drain).not.toHaveBeenCalled()
})

test('authorized recovery returns only bounded counts and disables response caching', async () => {
  process.env.CRON_SECRET = 'fixture-secret'
  const counts = { processed: 2, sent: 1, pending: 1, skipped: 0, review: 0, busy: 0, disabled: false }
  drain.mockResolvedValue(counts)
  const response = await GET(new Request('http://localhost/recover', { headers: { authorization: 'Bearer fixture-secret' } }))
  expect(await response.json()).toEqual({ success: true, ...counts })
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(drain).toHaveBeenCalledWith({ limit: 3 })
})

test('recovery failures retain private diagnostics', async () => {
  process.env.CRON_SECRET = 'fixture-secret'
  drain.mockRejectedValue(new Error('private database URI'))
  const response = await GET(new Request('http://localhost/recover', { headers: { authorization: 'Bearer fixture-secret' } }))
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'Failed to process booking emails' })
  expect(console.error).toHaveBeenCalledWith('[bookings][email][recovery_failed]')
})
