export {}
const originalEnvironment = process.env
let email: typeof import('@/lib/email/email.service').emailService
let fetchMock: jest.SpyInstance
const message = { from: 'Ganges Healers <noreply@gangeshealers.com>', to: 'fixture@example.test', subject: 'Booking Request Received', html: '<p>Fixture</p>' }

beforeEach(() => {
  jest.resetModules()
  process.env = { ...originalEnvironment, RESEND_API_KEY: 'test-only-provider-key' }
  delete process.env.RESEND_BASE_URL
  fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'accepted-id' }), { status: 200 }))
  jest.spyOn(console, 'error').mockImplementation(() => {})
  email = jest.requireActual<typeof import('@/lib/email/email.service')>('@/lib/email/email.service').emailService
})
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); process.env = originalEnvironment })

test('the installed SDK sends the frozen message and stable key with an abort signal', async () => {
  expect(await email.sendBookingNotice(message, 'booking-email/event-id')).toEqual({ success: true, id: 'accepted-id' })
  const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('https://api.resend.com/emails')
  expect(new Headers(options.headers).get('Idempotency-Key')).toBe('booking-email/event-id')
  expect(JSON.parse(options.body as string)).toEqual(message)
  expect(options.signal).toBeInstanceOf(AbortSignal)
})

test('a JSONB-style key reorder produces the same provider request bytes on retry', async () => {
  await email.sendBookingNotice(message, 'booking-email/event-id')
  await email.sendBookingNotice({ html: message.html, subject: message.subject, to: message.to, from: message.from }, 'booking-email/event-id')
  expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body)
  expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Idempotency-Key')).toBe('booking-email/event-id')
})

test.each([{ error: { message: 'private payload' } }, {}, { id: '' }])('unconfirmed provider response cannot report delivery (%j)', async response => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 'error' in response ? 500 : 200 }))
  expect((await email.sendBookingNotice(message, 'booking-email/event-id')).success).toBe(false)
  expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toMatch(/private|fixture@/)
})

test('a stalled actual SDK request is aborted after ten seconds and remains unconfirmed', async () => {
  jest.useFakeTimers()
  let signal: AbortSignal | null | undefined
  fetchMock.mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    signal = options.signal
    signal?.addEventListener('abort', () => reject(new Error('private provider error')), { once: true })
  }))
  const sent = email.sendBookingNotice(message, 'booking-email/event-id')
  await jest.advanceTimersByTimeAsync(10001)
  expect((await sent).success).toBe(false)
  expect(signal?.aborted).toBe(true)
  expect(jest.getTimerCount()).toBe(0)
})

test('disabled delivery makes no transport request', async () => {
  jest.resetModules()
  delete process.env.RESEND_API_KEY
  email = jest.requireActual<typeof import('@/lib/email/email.service')>('@/lib/email/email.service').emailService
  expect(await email.sendBookingNotice(message, 'booking-email/event-id')).toEqual({ success: false, disabled: true })
  expect(fetchMock).not.toHaveBeenCalled()
})
