export {}
const mockSend = jest.fn()
jest.mock('resend', () => ({ Resend: class { emails = { send: mockSend } } }))
const originalKey = process.env.RESEND_API_KEY
let email: typeof import('@/lib/email/email.service').emailService, error: jest.SpyInstance, warn: jest.SpyInstance, log: jest.SpyInstance
beforeEach(() => {
  jest.resetModules(); process.env.RESEND_API_KEY = 'test-only-provider-key'
  mockSend.mockReset().mockRejectedValue(new Error('private@example.test private-provider-key'))
  error = jest.spyOn(console, 'error').mockImplementation(() => {})
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); log = jest.spyOn(console, 'log').mockImplementation(() => {})
  email = jest.requireActual<typeof import('@/lib/email/email.service')>('@/lib/email/email.service').emailService
})
afterEach(() => { error.mockRestore(); warn.mockRestore(); log.mockRestore(); if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey })

test.each(['sendBookingConfirmation', 'sendBookingCancellation', 'sendBookingReminder', 'sendInvoiceEmail'] as const)('%s retains its failure result and redacts provider errors', async method => {
  const input = { to: 'private@example.test', userName: 'Fixture', serviceName: 'Fixture', healerName: 'Fixture', date: '2030-01-01', time: '10:00', bookingId: 'fixture', scheduledAtIso: '2030-01-01T10:00:00.000Z', invoiceNumber: 'TEST-1', amountPaise: 1000, link: 'https://example.test/invoice' }
  expect(await email[method](input)).toMatchObject({ success: false })
  if (method === 'sendInvoiceEmail') expect(warn).toHaveBeenCalledWith('[invoice][generate][email_failed]', { invoiceNumber: 'TEST-1', type: 'Error' })
  else if (method === 'sendBookingReminder') expect(error).toHaveBeenCalledWith('[bookings][email][provider_error]')
  else expect(error).toHaveBeenCalledWith(`[Email:${method}]`, { type: 'Error' })
  expect(JSON.stringify([...error.mock.calls, ...warn.mock.calls])).not.toMatch(/private|provider-key/)
})

test.each(['sendBookingConfirmation', 'sendBookingCancellation', 'sendBookingReminder', 'sendInvoiceEmail'] as const)('%s requires provider acceptance instead of treating a resolved error as delivery', async method => {
  const input = { to: 'fixture@example.test', userName: 'Fixture', serviceName: 'Fixture', healerName: 'Fixture', date: '2030-01-01', time: '10:00', bookingId: 'fixture', scheduledAtIso: '2030-01-01T10:00:00.000Z', invoiceNumber: 'TEST-1', amountPaise: 1000, link: 'https://example.test/invoice' }
  mockSend.mockResolvedValueOnce({ data: null, error: { message: 'Provider rejected the fixture' } })
    .mockResolvedValueOnce({ data: {}, error: null }).mockResolvedValueOnce({ data: { id: 'accepted-id' }, error: null })
  expect(await email[method](input)).toMatchObject({ success: false })
  expect(await email[method](input)).toMatchObject({ success: false })
  expect(await email[method](input)).toEqual({ success: true, id: 'accepted-id' })
  if (method === 'sendInvoiceEmail') expect(log).toHaveBeenCalledTimes(1)
})
