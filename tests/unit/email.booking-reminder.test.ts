import { emailService } from '@/lib/email/email.service'

afterEach(() => jest.restoreAllMocks())

test('reminder HTML escapes untrusted names and preserves stable provider idempotency per booking/slot', async () => {
  const notice = jest.spyOn(emailService, 'sendBookingNotice').mockResolvedValue({ success: true, id: 'accepted' })
  const data = {
    to: 'customer@example.test', userName: 'Customer <script>alert("x")</script>',
    serviceName: 'Yoga & Healing', healerName: 'Reiki; <img src=x>',
    date: '13 November 2026', time: '10:00 am IST',
    bookingId: 'booking_123', scheduledAtIso: '2026-11-13T04:30:00.000Z',
  }
  expect(await emailService.sendBookingReminder(data)).toEqual({ success: true, id: 'accepted' })
  expect(notice).toHaveBeenCalledWith(expect.objectContaining({
    to: 'customer@example.test', subject: 'Reminder: Yoga & Healing tomorrow at 10:00 am IST',
    html: expect.stringContaining('Customer &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'),
  }), 'booking-reminder/booking_123/2026-11-13T04:30:00.000Z')
  const html: string = notice.mock.calls[0][0].html
  expect(html).toContain('Yoga &amp; Healing')
  expect(html).toContain('Reiki; &lt;img src=x&gt;')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('<img')
  await emailService.sendBookingReminder({ ...data, scheduledAtIso: '2026-11-14T04:30:00.000Z' })
  expect(notice.mock.calls[1][1]).toBe('booking-reminder/booking_123/2026-11-14T04:30:00.000Z')
})

test('a provider refusal is not reported as a sent reminder', async () => {
  jest.spyOn(emailService, 'sendBookingNotice').mockResolvedValue({ success: false })
  const result = await emailService.sendBookingReminder({
    to: 'customer@example.test', userName: 'Customer',
    serviceName: 'Yoga', healerName: 'Practitioner',
    date: '13 November 2026', time: '10:00 am IST',
    bookingId: 'booking_123', scheduledAtIso: '2026-11-13T04:30:00.000Z',
  })
  expect(result.success).toBe(false)
})

test('legacy queued reminders without scheduledAtIso retain a stable, bounded provider key', async () => {
  const notice = jest.spyOn(emailService, 'sendBookingNotice').mockResolvedValue({ success: true, id: 'accepted' })
  const legacy = {
    to: 'member@example.test', userName: 'Member', serviceName: 'Yoga', healerName: 'Healer',
    date: '13 November 2026', time: '10:00 am IST', bookingId: 'saved_booking',
  }
  await emailService.sendBookingReminder(legacy)
  await emailService.sendBookingReminder(legacy)
  const originalKey = notice.mock.calls[0][1]
  expect(originalKey).toMatch(/^booking-reminder\/saved_booking\/legacy-[a-f0-9]{64}$/)
  expect(notice.mock.calls[1][1]).toBe(originalKey)
  await emailService.sendBookingReminder({ ...legacy, time: '11:00 am IST' })
  expect(notice.mock.calls[2][1]).not.toBe(originalKey)
})
