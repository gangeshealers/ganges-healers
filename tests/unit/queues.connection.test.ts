export {}
type Jobs = typeof import('@/lib/queues/jobs')
const mockInstances: Array<{ options: unknown; connect: jest.Mock; ping: jest.Mock; disconnect: jest.Mock }> = []
const mockQueues: Array<{ name: string; opts: unknown; add: jest.Mock; getJobCounts: jest.Mock; connection: { close: jest.Mock } }> = []
const mockConnect = jest.fn(), mockPing = jest.fn()
jest.mock('ioredis', () => ({ __esModule: true, default: class {
  connect = mockConnect; ping = mockPing; disconnect = jest.fn(); on() { return this }
  constructor(public options: unknown) { mockInstances.push(this) }
} }))
jest.mock('bullmq', () => ({ Queue: class {
  closed = false; connection = { close: jest.fn(async () => {}) }
  add = jest.fn(async () => ({ id: 'queued' })); getJobCounts = jest.fn(async () => ({ waiting: 2, active: 1, failed: 0 }))
  on() { return this }
  constructor(public name: string, public opts: unknown) { mockQueues.push(this) }
} }))
const originalRedis = process.env.REDIS_URL
const notification = { notificationId: 'stable-id', userId: 'fixture-user', type: 'reply', title: 'Reply', message: 'Fixture message' }
let jobs: Jobs
function load(url: string | undefined = 'redis://127.0.0.1:55609/15') {
  jest.resetModules()
  if (url === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = url
  jobs = jest.requireActual<Jobs>('@/lib/queues/jobs')
  return jobs
}
beforeEach(() => {
  jest.useFakeTimers(); mockInstances.length = 0; mockQueues.length = 0
  mockConnect.mockReset().mockResolvedValue(undefined); mockPing.mockReset().mockResolvedValue('PONG')
})
afterEach(async () => { await jobs?.closeQueues(); jest.useRealTimers(); if (originalRedis === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = originalRedis })

test('unset Redis never opens a producer or probe connection', async () => {
  load('')
  expect(jobs.getEmailQueue()).toBeNull()
  expect(jobs.getNotificationQueue()).toBeNull()
  expect(jobs.getActivityQueue()).toBeNull()
  expect(await jobs.enqueueNotification(notification)).toBe(false)
  expect(await jobs.probeQueueRedis()).toBe(false)
  expect(mockInstances).toHaveLength(0); expect(mockQueues).toHaveLength(0)
})

test('TLS, database, IPv6 and encoded credentials survive every connection role', () => {
  load()
  for (const role of ['producer', 'worker', 'probe'] as const) {
    expect(jobs.redisConnectionOptions('rediss://user%40tenant:p%3Ass%2Fword@[::1]:6380/15', role)).toMatchObject({
      host: '::1', port: 6380, db: 15, username: 'user@tenant', password: 'p:ss/word', tls: {},
    })
  }
  expect(jobs.redisConnectionOptions('redis://localhost')).toMatchObject({ host: 'localhost', port: 6379, db: 0 })
  expect(jobs.redisConnectionOptions('redis://localhost')).not.toHaveProperty('tls')
  expect(jobs.redisConnectionOptions('rediss://cache.example.test/15')).toMatchObject({ tls: { servername: 'cache.example.test' } })
})

test.each(['http://user:secret@host/0', 'redis://', 'redis://host:0', 'redis://host/1/2', 'redis://host/-1', 'redis://host/1.5', 'redis://host/2147483648', 'redis://host/0?tls=false', 'redis://host/0#secret', 'redis://user:%zz@host/0'])('invalid configuration never falls back to localhost (%s)', url => {
  load()
  expect(() => jobs.redisConnectionOptions(url)).toThrow('Invalid REDIS_URL')
  try { jobs.redisConnectionOptions(url) } catch (error) { expect(error).toMatchObject({ message: 'Invalid REDIS_URL. Use redis:// or rediss:// with a host, optional credentials, port and database number.' }) }
  expect(mockInstances).toHaveLength(0)
})

test('request producers are bounded while background workers retain reconnect semantics', () => {
  load()
  const producer = jobs.redisConnectionOptions('redis://localhost', 'producer')!
  expect(producer).toMatchObject({ maxRetriesPerRequest: 1, commandTimeout: 2000, enableOfflineQueue: false, autoResendUnfulfilledCommands: false })
  expect('retryStrategy' in producer && producer.retryStrategy(1)).toBe(100)
  expect('retryStrategy' in producer && producer.retryStrategy(2)).toBeNull()
  const worker = jobs.redisConnectionOptions('redis://localhost', 'worker')!
  expect(worker).toMatchObject({ maxRetriesPerRequest: null, enableOfflineQueue: true })
  expect(worker).not.toHaveProperty('commandTimeout')
  expect(jobs.redisConnectionOptions('redis://localhost', 'probe')).toMatchObject({ maxRetriesPerRequest: 0, commandTimeout: 1000, lazyConnect: true })
})

test('concurrent submissions share a probe and retain queue names, payloads and retries', async () => {
  load()
  const email = { type: 'invoice' as const, payload: { to: 'fixture@example.test', invoiceNumber: 'TEST-1', amountPaise: 1000, link: 'https://example.test/invoice' } }
  const activity = { action: 'fixture', entityType: 'fixture', entityId: 'fixture-id' }
  expect(await Promise.all([jobs.enqueueEmail(email), jobs.enqueueNotification(notification), jobs.enqueueActivity(activity)])).toEqual([true, true, true])
  expect(mockInstances).toHaveLength(1); expect(mockInstances[0].disconnect).toHaveBeenCalledTimes(1)
  expect(mockQueues.map(queue => queue.name)).toEqual(['email', 'notification', 'activity'])
  expect(mockQueues[0].add).toHaveBeenCalledWith('invoice', email)
  expect(mockQueues[1].add).toHaveBeenCalledWith('create', notification)
  expect(mockQueues[2].add).toHaveBeenCalledWith('log', activity)
  expect(mockQueues[0].opts).toMatchObject({ defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } } })
  expect(jobs.getNotificationQueue()).toBe(mockQueues[1])
})

test('a failed probe closes its socket and the next availability window can recover', async () => {
  load(); mockPing.mockRejectedValueOnce(new Error('Redis unavailable'))
  expect(await jobs.enqueueNotification(notification)).toBe(false)
  expect(mockQueues).toHaveLength(0); expect(mockInstances[0].disconnect).toHaveBeenCalled()
  expect(await jobs.enqueueNotification(notification)).toBe(false)
  expect(mockInstances).toHaveLength(1)
  await jest.advanceTimersByTimeAsync(1001)
  expect(await jobs.enqueueNotification(notification)).toBe(true)
  expect(mockInstances).toHaveLength(2)
})

test('connection failure also closes a probe socket without exposing its error', async () => {
  load(); mockConnect.mockRejectedValueOnce(new Error('secret credential in transport error'))
  expect(await jobs.probeQueueRedis()).toBe(false)
  expect(mockInstances[0].disconnect).toHaveBeenCalled()
})

test('submission errors stay unconfirmed, dispose the old connection and permit a fresh retry', async () => {
  load(); jobs.getNotificationQueue()
  mockQueues[0].add.mockRejectedValueOnce(new Error('redis://user:private-password@private-host/15'))
  await expect(jobs.enqueueNotification(notification)).rejects.toMatchObject({ code: 'QUEUE_UNCONFIRMED', message: 'Queue operation could not be confirmed.' })
  expect(mockQueues[0].connection.close).toHaveBeenCalledWith(true)
  expect(await jobs.enqueueNotification(notification)).toBe(true)
  expect(mockQueues).toHaveLength(2); expect(mockInstances).toHaveLength(2)
})

test('a stalled submission returns an unconfirmed error within the request budget and closes its client', async () => {
  load(); jobs.getNotificationQueue(); mockQueues[0].add.mockImplementation(() => new Promise(() => {}))
  const result = expect(jobs.enqueueNotification(notification)).rejects.toMatchObject({ code: 'QUEUE_UNCONFIRMED' })
  await jest.advanceTimersByTimeAsync(5001); await result
  expect(mockQueues[0].connection.close).toHaveBeenCalledWith(true)
})

test('queue diagnostics keep the existing count keys and also time out safely', async () => {
  load()
  expect(await jobs.getQueueHealthCounts()).toEqual({ emailWaiting: 2, emailActive: 1, emailFailed: 0, notificationWaiting: 2, notificationActive: 1, notificationFailed: 0, activityWaiting: 2, activityActive: 1, activityFailed: 0 })
  mockQueues[1].getJobCounts.mockImplementation(() => new Promise(() => {}))
  const result = expect(jobs.getQueueHealthCounts()).rejects.toMatchObject({ code: 'QUEUE_UNCONFIRMED' })
  await jest.advanceTimersByTimeAsync(5001); await result
  expect(mockQueues[1].connection.close).toHaveBeenCalledWith(true)
})
