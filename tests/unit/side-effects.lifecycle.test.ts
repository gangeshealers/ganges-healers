import { after } from 'next/server'
import { runSideEffect } from '@/lib/runSideEffect'
import { logActivity } from '@/lib/activity-log'
import { generateInvoiceForPayment } from '@/lib/invoices/generate'

jest.mock('next/server', () => ({ after: jest.fn() }))
jest.mock('@/lib/queues/jobs', () => ({ enqueueActivity: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  activityLog: { create: jest.fn() },
  payment: { findUnique: jest.fn() },
  invoice: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  $queryRaw: jest.fn(),
} }))
jest.mock('@/lib/invoices/pdf', () => ({ generateInvoicePDF: jest.fn().mockResolvedValue(Buffer.from('fixture')) }))
jest.mock('@/lib/invoices/storage', () => ({ uploadInvoicePDF: jest.fn().mockResolvedValue({ url: 'https://example.test/invoice.pdf' }) }))
jest.mock('@/lib/email/email.service', () => ({ emailService: { sendInvoiceEmail: jest.fn() } }))

const register = jest.mocked(after)
const queue = jest.requireMock<{ enqueueActivity: jest.Mock }>('@/lib/queues/jobs').enqueueActivity
const db = jest.requireMock<{ prisma: {
  activityLog: { create: jest.Mock }
  payment: { findUnique: jest.Mock }
  invoice: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock }
  $queryRaw: jest.Mock
} }>('@/lib/prisma').prisma
const sendEmail = jest.requireMock<{ emailService: { sendInvoiceEmail: jest.Mock } }>('@/lib/email/email.service').emailService.sendInvoiceEmail
const originalEnvironment = process.env

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  process.env = { ...originalEnvironment, NODE_ENV: 'production' }
  delete process.env.RUN_SYNC_SIDE_EFFECTS
  jest.clearAllMocks()
  register.mockReset()
  queue.mockReset().mockResolvedValue(false)
  db.activityLog.create.mockReset().mockResolvedValue({ id: 'activity' })
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  process.env = originalEnvironment
  jest.restoreAllMocks()
})

test('registers pending work before returning without waiting for it', async () => {
  const task = deferred<number>()
  const result = runSideEffect(task.promise)
  expect(register).toHaveBeenCalledTimes(1)
  const registered = register.mock.calls[0][0]
  expect(registered).toBeInstanceOf(Promise)
  await expect(result).resolves.toBeUndefined()
  task.resolve(42)
  await expect(registered).resolves.toBe(42)
})

test('an asynchronous rejection settles safely without logging its payload or custom name', async () => {
  const task = deferred<number>()
  await runSideEffect(task.promise)
  const error = new Error('recipient@example.test token=private')
  error.name = 'secret-provider-name'
  task.reject(error)
  await expect(register.mock.calls[0][0]).resolves.toBeUndefined()
  expect(console.error).toHaveBeenCalledWith('[side-effect][unhandled]', { errorType: 'Error' })
  expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toMatch(/recipient|private|secret-provider/)
})

test.each([false, true])('awaits the same work when registration throws (partially registered: %s)', async partial => {
  const task = deferred<number>()
  let registered: unknown
  register.mockImplementation(work => { if (partial) registered = work; throw new Error('no request scope') })
  let settled = false
  const result = runSideEffect(task.promise).then(() => { settled = true })
  await Promise.resolve()
  expect(settled).toBe(false)
  task.resolve(42)
  await result
  if (partial) await expect(registered).resolves.toBe(42)
  expect(register).toHaveBeenCalledTimes(1)
})

test('fallback also contains rejection without leaking its message', async () => {
  register.mockImplementation(() => { throw new Error('no request scope') })
  await expect(runSideEffect(Promise.reject('private payload'))).resolves.toBeUndefined()
  expect(console.error).toHaveBeenCalledWith('[side-effect][unhandled]', { errorType: 'string' })
})

test.each(['test', 'flag'])('synchronous mode (%s) preserves values and rejected errors without registering', async mode => {
  if (mode === 'test') process.env = { ...process.env, NODE_ENV: 'test' }
  else process.env.RUN_SYNC_SIDE_EFFECTS = '1'
  expect(await runSideEffect(Promise.resolve(42))).toBe(42)
  const error = new Error('sync failure')
  await expect(runSideEffect(Promise.reject(error))).rejects.toBe(error)
  expect(register).not.toHaveBeenCalled()
})

test('activity registers even for a caller that does not await it and waits for its inline write', async () => {
  const enqueue = deferred<boolean>()
  const write = deferred<{ id: string }>()
  queue.mockReturnValueOnce(enqueue.promise)
  db.activityLog.create.mockReturnValueOnce(write.promise)
  const call = logActivity({ userId: 'user', action: 'booking_created', entityType: 'booking', entityId: 'booking' })
  expect(register).toHaveBeenCalledTimes(1)
  await call
  enqueue.resolve(false)
  await Promise.resolve()
  expect(db.activityLog.create).toHaveBeenCalledTimes(1)
  write.resolve({ id: 'activity' })
  await register.mock.calls[0][0]
})

test('accepted queued activity does not also write inline', async () => {
  queue.mockResolvedValueOnce(true)
  await logActivity({ action: 'test', entityType: 'test', entityId: 'test' })
  await register.mock.calls[0][0]
  expect(db.activityLog.create).not.toHaveBeenCalled()
})

test('unconfirmed queue submission stays contained and never falls back inline', async () => {
  queue.mockRejectedValueOnce(new Error('private Redis URI'))
  await logActivity({ action: 'test', entityType: 'test', entityId: 'test' })
  await register.mock.calls[0][0]
  expect(db.activityLog.create).not.toHaveBeenCalled()
  expect(console.error).toHaveBeenCalledWith('[activity-log][write-failed]', { errorType: 'Error' })
})

test('a failed inline activity is contained in synchronous mode', async () => {
  process.env = { ...process.env, NODE_ENV: 'test' }
  db.activityLog.create.mockRejectedValueOnce(new Error('private database URL'))
  await expect(logActivity({ action: 'test', entityType: 'test', entityId: 'test' })).resolves.toBeUndefined()
  expect(register).not.toHaveBeenCalled()
  expect(console.error).toHaveBeenCalledWith('[activity-log][write-failed]', { errorType: 'Error' })
})

test.each([false, true])('invoice email is tracked through settlement (provider rejects: %s)', async reject => {
  const email = deferred<{ success: boolean }>()
  db.$queryRaw.mockResolvedValue([])
  db.payment.findUnique.mockResolvedValue({ id: 'payment', amountPaise: 10000, status: 'success', user: { name: 'Customer', email: 'customer@example.test' } })
  db.invoice.findUnique.mockResolvedValue(null)
  const invoice = { id: 'invoice', invoiceNumber: 'INV-TEST', pdfUrl: '' }
  db.invoice.create.mockResolvedValue(invoice)
  db.invoice.update.mockResolvedValue({ ...invoice, pdfUrl: 'https://example.test/invoice.pdf' })
  sendEmail.mockReturnValueOnce(email.promise)
  const result = await generateInvoiceForPayment({ paymentId: 'payment' })
  expect(result.ok).toBe(true)
  expect(register).toHaveBeenCalledTimes(1)
  expect(sendEmail).toHaveBeenCalledTimes(1)
  if (reject) email.reject(new Error('customer@example.test credential=private'))
  else email.resolve({ success: true })
  await register.mock.calls[0][0]
  if (reject) {
    expect(console.warn).toHaveBeenCalledWith('[invoice][generate][email_async_failed]', { paymentId: 'payment', errorType: 'Error' })
    expect(JSON.stringify(jest.mocked(console.warn).mock.calls)).not.toMatch(/customer@|credential/)
  }
})
