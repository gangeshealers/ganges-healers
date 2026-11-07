export {}
type Processor = (job: { data: Record<string, unknown>; id?: string }) => Promise<unknown>
const mockWorkers: Array<{ name: string; processor: Processor; options: unknown; close: jest.Mock; events: Record<string, (...args: unknown[]) => void> }> = []
const mockEmail = { sendBookingConfirmation: jest.fn(), sendBookingCancellation: jest.fn(), sendBookingReminder: jest.fn(), sendInvoiceEmail: jest.fn() }
jest.mock('bullmq', () => ({ Queue: class {}, Worker: class {
  close = jest.fn(async () => {}); events: Record<string, (...args: unknown[]) => void> = {}
  on(event: string, handler: (...args: unknown[]) => void) { this.events[event] = handler; return this }
  constructor(public name: string, public processor: Processor, public options: unknown) { mockWorkers.push(this) }
} }))
jest.mock('@/lib/email/email.service', () => ({ emailService: mockEmail }))
jest.mock('@/lib/notifications/delivery', () => ({ storeNotification: jest.fn() }))
const originalRedis = process.env.REDIS_URL
let on: jest.SpyInstance, exit: jest.SpyInstance, log: jest.SpyInstance, error: jest.SpyInstance
function start(url = 'rediss://user:secret@localhost:6380/15') { process.env.REDIS_URL = url; jest.requireActual('@/lib/queues/worker') }
beforeEach(() => {
  jest.useFakeTimers(); jest.resetModules(); mockWorkers.length = 0
  for (const method of Object.values(mockEmail)) method.mockReset().mockResolvedValue({ success: true, id: 'accepted-email-id' })
  on = jest.spyOn(process, 'on').mockReturnValue(process); exit = jest.spyOn(process, 'exit').mockReturnValue(undefined as never)
  log = jest.spyOn(console, 'log').mockImplementation(() => {}); error = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { on.mockRestore(); exit.mockRestore(); log.mockRestore(); error.mockRestore(); jest.useRealTimers(); if (originalRedis === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = originalRedis })

test('missing or invalid Redis configuration cannot start implicit localhost workers', () => {
  expect(() => start('')).toThrow('REDIS_URL is required')
  expect(mockWorkers).toHaveLength(0)
  jest.resetModules()
  expect(() => start('http://user:secret@private-host')).toThrow('Invalid REDIS_URL')
  expect(mockWorkers).toHaveLength(0)
})

test('all workers share TLS/database settings and keep their existing concurrency', () => {
  start()
  expect(mockWorkers.map(worker => worker.name)).toEqual(['email', 'notification', 'activity'])
  for (const worker of mockWorkers) expect(worker.options).toMatchObject({ connection: { host: 'localhost', port: 6380, db: 15, tls: {}, maxRetriesPerRequest: null } })
  expect(mockWorkers.map(worker => (worker.options as { concurrency: number }).concurrency)).toEqual([5, 3, 5])
})

test.each([['booking_confirmation', 'sendBookingConfirmation'], ['booking_cancellation', 'sendBookingCancellation'], ['booking_reminder', 'sendBookingReminder'], ['invoice', 'sendInvoiceEmail']] as const)('a confirmed %s delivery can complete', async (type, method) => {
  start(); const payload = { to: 'private@example.test' }
  await expect(mockWorkers[0].processor({ data: { type, payload } })).resolves.toBeUndefined()
  expect(mockEmail[method]).toHaveBeenCalledWith(payload)
})

test.each([{ success: false, disabled: true }, { success: false }, { success: true }, { success: true, id: '' }])('unconfirmed email delivery cannot be marked complete (%j)', async result => {
  start(); mockEmail.sendInvoiceEmail.mockResolvedValue(result)
  await expect(mockWorkers[0].processor({ data: { type: 'invoice', payload: {} } })).rejects.toThrow('Email delivery was not confirmed.')
})

test('unsupported jobs fail and diagnostics never log provider messages or payloads', async () => {
  start()
  await expect(mockWorkers[0].processor({ data: { type: 'unsupported', payload: {} } })).rejects.toThrow('Unsupported email job type.')
  mockWorkers[0].events.failed({ id: 'fixture-job' }, new Error('private@example.test redis://user:secret@private-host'))
  expect(error).toHaveBeenCalledWith('[worker][email] Job fixture-job failed:', { type: 'Error' })
  expect(JSON.stringify(error.mock.calls)).not.toMatch(/private|secret/)
})

test('shutdown is idempotent and releases healthy workers', async () => {
  start()
  const shutdown = on.mock.calls.find(([signal]) => signal === 'SIGTERM')![1] as () => void
  shutdown(); shutdown(); await jest.advanceTimersByTimeAsync(1)
  for (const worker of mockWorkers) expect(worker.close).toHaveBeenCalledTimes(1)
  expect(exit).toHaveBeenCalledWith(0); expect(jest.getTimerCount()).toBe(0)
})

test('a disconnected worker cannot block process shutdown indefinitely', async () => {
  start(); mockWorkers[0].close.mockImplementation(() => new Promise(() => {}))
  const shutdown = on.mock.calls.find(([signal]) => signal === 'SIGTERM')![1] as () => void
  shutdown(); await jest.advanceTimersByTimeAsync(10001)
  expect(exit).toHaveBeenCalledWith(1)
})
