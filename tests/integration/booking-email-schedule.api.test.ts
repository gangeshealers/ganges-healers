import { GET } from '@/app/api/cron/booking-emails/route'
import { drainBookingEmails } from '@/lib/bookings/email'

jest.mock('@/lib/bookings/email', () => ({
  drainBookingEmails: jest.fn(),
}))

const drain = drainBookingEmails as jest.Mock
const original = process.env.CRON_SECRET

afterAll(() => {
  if (original === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = original
})
beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-schedule-token'
})

const request = (token?: string) => new Request('http://localhost:3000/api/cron/booking-emails', {
  method: 'GET',
  headers: token ? { authorization: token } : {},
})

test('schedule rejects missing, incorrect or unset credentials without a provider attempt', async () => {
  expect((await GET(request())).status).toBe(401)
  expect((await GET(request('Bearer wrong'))).status).toBe(401)
  delete process.env.CRON_SECRET
  expect((await GET(request('Bearer test-schedule-token'))).status).toBe(401)
  expect(drain).not.toHaveBeenCalled()
})

test('authenticated invocation drains one bounded batch and keeps the response private', async () => {
  drain.mockResolvedValueOnce({ processed: 2, failed: 0 })
  const response = await GET(request('Bearer test-schedule-token'))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({ success: true, processed: 2, failed: 0 })
  expect(drain).toHaveBeenCalledTimes(1)
  expect(drain).toHaveBeenCalledWith({ limit: 3 })
})

test('unexpected delivery failure returns a safe error without leaking provider payloads', async () => {
  drain.mockRejectedValueOnce(new Error('private provider details'))
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const response = await GET(request('Bearer test-schedule-token'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to process booking emails' })
    expect(spy).toHaveBeenCalledWith('[bookings][email][recovery_failed]')
  } finally { spy.mockRestore() }
})
