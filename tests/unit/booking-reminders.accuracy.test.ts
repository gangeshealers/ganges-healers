import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'
import { GET, reminderWindow } from '@/app/api/cron/booking-reminders/route'

jest.mock('@/lib/prisma', () => ({ prisma: { booking: { findMany: jest.fn() } } }))
jest.mock('@/lib/email/email.service', () => ({ emailService: { sendBookingReminder: jest.fn() } }))
const bookings = prisma.booking.findMany as jest.Mock
const sendReminder = emailService.sendBookingReminder as jest.Mock
const originalSecret = process.env.CRON_SECRET
const auth = new Request('http://localhost/api/cron/booking-reminders', { headers: { authorization: 'Bearer reminder-fixture' } })
const booking = (overrides: Record<string, unknown> = {}) => ({
  id: 'booking_123',
  status: 'CONFIRMED',
  scheduledAt: new Date('2026-11-13T04:30:00.000Z'),
  pricePaise: 10000,
  payment: { status: 'success', statusEnum: 'SUCCESS', amountPaise: 10000, gateway: 'razorpay' },
  user: { email: 'customer@example.test', name: 'Customer', closedAt: null },
  healer: { user: { name: 'Practitioner' } },
  service: { name: 'Yoga' },
  ...overrides,
})

beforeEach(() => {
  process.env.CRON_SECRET = 'reminder-fixture'
  bookings.mockReset().mockResolvedValue([])
  sendReminder.mockReset().mockResolvedValue({ success: true, id: 'reminder-accepted' })
})
afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
})

describe('private booking reminder scheduler', () => {
  test('tomorrow is defined by the India date even when the host clock has crossed midnight', () => {
    const window = reminderWindow(new Date('2026-11-11T20:00:00.000Z')) // 12 Nov 01:30 IST
    expect(window.start.toISOString()).toBe('2026-11-12T18:30:00.000Z')
    expect(window.end.toISOString()).toBe('2026-11-13T18:30:00.000Z')
  })

  test('rejects unconfigured cron secret without querying or sending', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(auth)).status).toBe(401)
    expect(bookings).not.toHaveBeenCalled()
    expect(sendReminder).not.toHaveBeenCalled()
  })

  test('includes the correct confirmed/rescheduled time window and sends only eligible reminders', async () => {
    bookings.mockResolvedValueOnce([
      booking(),
      booking({ id: 'unfunded', status: 'RESCHEDULED', payment: { status: 'pending', statusEnum: 'PENDING', amountPaise: 10000, gateway: 'razorpay' } }),
      booking({ id: 'closed', user: { email: 'closed@example.test', name: null, closedAt: new Date() } }),
      booking({ id: 'funded', status: 'RESCHEDULED', payment: { status: 'success', statusEnum: 'SUCCESS', amountPaise: 0, gateway: 'vip_credit' } }),
    ])
    const response = await GET(auth)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.json()).toMatchObject({ success: true, remindersSent: 2, total: 4, eligible: 2, skipped: 2 })
    const query = bookings.mock.calls[0][0]
    expect(query.where).toEqual({
      scheduledAt: { gte: expect.any(Date), lt: expect.any(Date) },
      status: { in: ['CONFIRMED', 'RESCHEDULED'] },
    })
    expect(query.select.user.select.closedAt).toBe(true)
    expect(sendReminder).toHaveBeenCalledTimes(2)
    expect(sendReminder).toHaveBeenCalledWith(expect.objectContaining({
      to: 'customer@example.test', date: '13 November 2026', time: '10:00 am IST',
      bookingId: 'booking_123', scheduledAtIso: '2026-11-13T04:30:00.000Z',
    }))
    expect(sendReminder.mock.calls.map(([value]) => value.bookingId).sort()).toEqual(['booking_123', 'funded'])
  })
})
