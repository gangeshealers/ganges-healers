export {}
const mockQuery = jest.fn(), mockProbe = jest.fn(), mockCounts = jest.fn()
jest.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: mockQuery } }))
jest.mock('@/lib/queues/jobs', () => ({ probeQueueRedis: mockProbe, getQueueHealthCounts: mockCounts }))
const originalRedis = process.env.REDIS_URL
let get: typeof import('@/app/api/health/route').GET
beforeEach(() => {
  jest.useFakeTimers(); jest.resetModules(); delete process.env.REDIS_URL
  mockQuery.mockReset().mockResolvedValue([]); mockProbe.mockReset().mockResolvedValue(true)
  mockCounts.mockReset().mockResolvedValue({ emailWaiting: 0, emailActive: 0, emailFailed: 0, notificationWaiting: 0, notificationActive: 0, notificationFailed: 0, activityWaiting: 0, activityActive: 0, activityFailed: 0 })
  get = jest.requireActual<typeof import('@/app/api/health/route')>('@/app/api/health/route').GET
})
afterEach(() => { jest.useRealTimers(); if (originalRedis === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = originalRedis })

test('database liveness keeps its public keys and cache headers without requiring optional Redis', async () => {
  const response = await get(), body = await response.json()
  expect(response.status).toBe(200)
  expect(body).toMatchObject({ ok: true, degraded: false, ts: expect.any(Number), uptime: { ms: expect.any(Number), human: expect.any(String) }, database: { status: 'ok' }, redis: { status: 'unavailable' }, queues: { status: 'unavailable' } })
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(mockProbe).not.toHaveBeenCalled(); expect(mockCounts).not.toHaveBeenCalled()
})

test('database errors return a redacted 503 instead of a connection string or raw query error', async () => {
  mockQuery.mockRejectedValue(new Error('postgres://private-user:private-secret@private-host/database SELECT sensitive'))
  const response = await get(), body = await response.json()
  expect(response.status).toBe(503)
  expect(body).toMatchObject({ ok: false, degraded: true, database: { status: 'error', error: 'Database check unavailable' } })
  expect(JSON.stringify(body)).not.toMatch(/private|sensitive|SELECT/)
})

test('timed-out concurrent probes share one driver query and recover after it settles', async () => {
  let finish!: (value: unknown[]) => void
  const pending = new Promise<unknown[]>(resolve => { finish = resolve })
  mockQuery.mockReturnValueOnce(pending)
  const first = get(), second = get()
  await jest.advanceTimersByTimeAsync(5001)
  expect((await first).status).toBe(503); expect((await second).status).toBe(503)
  expect(mockQuery).toHaveBeenCalledTimes(1)
  finish([]); await pending; await Promise.resolve()
  expect((await get()).status).toBe(200)
  expect(mockQuery).toHaveBeenCalledTimes(2)
})

test('healthy configured queues return the existing counters without claiming worker delivery', async () => {
  process.env.REDIS_URL = 'redis://fixture'
  const response = await get(), body = await response.json()
  expect(response.status).toBe(200)
  expect(body).toMatchObject({ ok: true, degraded: false, redis: { status: 'ok' }, queues: { status: 'ok', counts: { emailFailed: 0, notificationWaiting: 0 } } })
  expect(body).not.toHaveProperty('ready')
})

test('an optional Redis outage is degraded database liveness and never starts queue commands', async () => {
  process.env.REDIS_URL = 'redis://fixture'; mockProbe.mockResolvedValue(false)
  const response = await get()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ ok: true, degraded: true, redis: { status: 'error' }, queues: { status: 'error' } })
  expect(mockCounts).not.toHaveBeenCalled()
})

test('queue errors are redacted and completed failures surface as degradation', async () => {
  process.env.REDIS_URL = 'redis://fixture'; mockCounts.mockRejectedValueOnce(new Error('Redis private-secret private-host'))
  const failed = await (await get()).json()
  expect(failed).toMatchObject({ ok: true, degraded: true, redis: { status: 'ok' }, queues: { status: 'error' } })
  expect(JSON.stringify(failed)).not.toContain('private-')
  mockCounts.mockResolvedValue({ emailFailed: 1 })
  expect(await (await get()).json()).toMatchObject({ ok: true, degraded: true, queues: { status: 'ok', counts: { emailFailed: 1 } } })
})
