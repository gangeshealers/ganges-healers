import { randomUUID } from 'node:crypto'
import net from 'node:net'
import path from 'node:path'
import tls from 'node:tls'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { Queue, type Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'

type Jobs = typeof import('@/lib/queues/jobs')
type Kind = 'email' | 'notification' | 'activity'
let jobs: Jobs, deliver: typeof import('@/lib/notifications/delivery').deliverNotification, db: PrismaClient
let controls: Record<Kind, Queue>, proxy: net.Server, worker: ChildProcess | undefined, workerOutput = '', userId = '', baseUrl = '', proxyUrl = ''
let accepting = true, responses = true
const sockets = new Set<net.Socket>(), fixture = `queue-${randomUUID()}`, notificationIds: string[] = []
const created: Array<{ kind: Kind; id: string }> = []

async function eventually<T>(read: () => Promise<T>, ready: (value: T) => boolean, timeout = 10000): Promise<T> {
  const end = Date.now() + timeout
  do {
    const value = await read()
    if (ready(value)) return value
    await new Promise(resolve => setTimeout(resolve, 25))
  } while (Date.now() < end)
  throw new Error('Isolated queue fixture did not settle in time.')
}
function matchesNotification(data: unknown, id: string) { return !!data && typeof data === 'object' && 'notificationId' in data && data.notificationId === id }
async function findJob(kind: Kind, matches: (data: unknown) => boolean): Promise<Job | undefined> {
  const found = (await controls[kind].getJobs(['waiting', 'active', 'delayed', 'failed', 'completed'], 0, 100)).find(job => matches(job.data))
  if (found?.id && !created.some(row => row.kind === kind && row.id === found.id)) created.push({ kind, id: found.id })
  return found
}
function notification(id: string) { notificationIds.push(id); return { notificationId: id, userId, type: 'queue_fixture', title: 'Queue fixture', message: 'Synthetic queue delivery fixture' } }
function disconnectProxy() { for (const socket of sockets) socket.destroy() }
async function stopWorker() {
  if (!worker) return
  if (worker.exitCode !== null || worker.signalCode) { expect(worker.exitCode).toBe(0); return }
  const child = worker
  const exited = new Promise<number | null>(resolve => child.once('exit', code => resolve(code)))
  const deadline = setTimeout(() => child.kill('SIGKILL'), 13000)
  child.kill('SIGTERM')
  try { expect(await exited).toBe(0) } finally { clearTimeout(deadline) }
}

beforeAll(async () => {
  // This test is selected explicitly by CI; it never uses an app/provider Redis URL.
  try {
    const parsed = new URL(process.env.QUEUE_TEST_REDIS_URL || '')
    if (parsed.protocol !== 'redis:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== '55609' || parsed.pathname !== '/15' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error()
    baseUrl = parsed.href
  } catch { throw new Error('Queue integration requires a dedicated loopback Redis service on port 55609, database 15.') }
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  Object.assign(process.env, settings.environment)
  proxy = net.createServer(client => {
    if (!accepting) { client.destroy(); return }
    const upstream = net.connect({ host: '127.0.0.1', port: 55609 })
    sockets.add(client); sockets.add(upstream)
    const close = () => { sockets.delete(client); sockets.delete(upstream); client.destroy(); upstream.destroy() }
    client.on('error', close); upstream.on('error', close); client.on('close', close); upstream.on('close', close)
    client.on('data', data => upstream.write(data))
    upstream.on('data', data => { if (responses) client.write(data) })
  })
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
  const address = proxy.address()
  if (!address || typeof address === 'string') throw new Error('Queue fixture proxy could not start.')
  proxyUrl = `redis://127.0.0.1:${address.port}/15`
  process.env.REDIS_URL = proxyUrl
  jobs = await import('@/lib/queues/jobs')
  db = (await import('@/lib/prisma')).prisma
  deliver = (await import('@/lib/notifications/delivery')).deliverNotification
  controls = Object.fromEntries((['email', 'notification', 'activity'] as const).map(kind => {
    const queue = new Queue(kind, { connection: jobs.redisConnectionOptions(baseUrl)! })
    queue.on('error', () => {})
    return [kind, queue]
  })) as Record<Kind, Queue>
  await Promise.all(Object.values(controls).map(queue => queue.waitUntilReady()))
  userId = (await db.user.create({ data: { email: `${fixture}@example.test`, role: 'USER' } })).id
}, 30000)

beforeEach(async () => { accepting = true; responses = true; await jobs.closeQueues() })
afterEach(async () => { accepting = true; responses = true; await jobs?.closeQueues(); disconnectProxy() })

afterAll(async () => {
  let shutdownError: unknown
  try { await stopWorker() } catch (error) { shutdownError = error }
  try {
    await jobs?.closeQueues()
    if (controls) {
      for (const row of created) await controls[row.kind].getJob(row.id).then(job => job?.remove()).catch(() => {})
      await Promise.allSettled(Object.values(controls).map(queue => queue.close()))
    }
    if (db) {
      await db.notification.deleteMany({ where: { id: { in: notificationIds } } })
      await db.activityLog.deleteMany({ where: { entityId: fixture } })
      if (userId) await db.user.deleteMany({ where: { id: userId } })
    }
  } finally {
    await db?.$disconnect()
    disconnectProxy()
    if (proxy?.listening) await new Promise<void>(resolve => proxy.close(() => resolve()))
  }
  if (shutdownError) throw shutdownError
}, 30000)

test('real BullMQ producers use the configured database and retain the submitted payload', async () => {
  const input = notification(randomUUID())
  expect(await jobs.enqueueNotification(input)).toBe(true)
  const job = await findJob('notification', data => matchesNotification(data, input.notificationId))
  expect(job?.data).toEqual(input)
  expect((await jobs.getNotificationQueue()!.client).options).toMatchObject({ db: 15 })
  await job!.remove()
})

test('a real TLS Redis proxy requires a trusted certificate and receives the DNS server name', async () => {
  const root = path.join(process.cwd(), 'test-results'); mkdirSync(root, { recursive: true })
  const directory = mkdtempSync(path.join(root, 'queue-tls-')), cert = path.join(directory, 'cert.pem'), key = path.join(directory, 'key.pem')
  let server: tls.Server | undefined, receivedName: string | boolean | null = null
  const connections = new Set<net.Socket>()
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-addext', 'basicConstraints=critical,CA:TRUE', '-days', '1'], { stdio: 'ignore' })
    const credentials = { key: readFileSync(key), cert: readFileSync(cert) }, context = tls.createSecureContext(credentials)
    server = tls.createServer({ ...credentials, SNICallback: (name, callback) => { receivedName = name; callback(null, context) } }, client => {
      const upstream = net.connect({ host: '127.0.0.1', port: 55609 })
      connections.add(client); connections.add(upstream)
      const close = () => { connections.delete(client); connections.delete(upstream); client.destroy(); upstream.destroy() }
      client.on('error', close); upstream.on('error', close); client.on('close', close); upstream.on('close', close)
      client.pipe(upstream); upstream.pipe(client)
    })
    server.on('tlsClientError', () => {})
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('TLS queue fixture could not start.')
    const probe = (trusted: boolean) => new Promise<boolean>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env, REDIS_URL: `rediss://localhost:${address.port}/15`, NODE_TLS_REJECT_UNAUTHORIZED: '1' }
      delete env.NODE_EXTRA_CA_CERTS
      if (trusted) env.NODE_EXTRA_CA_CERTS = cert
      const child = spawn(process.execPath, ['--import', 'tsx', '-e', 'const {probeQueueRedis}=require("./src/lib/queues/jobs.ts"); probeQueueRedis().then(available=>process.stdout.write(JSON.stringify({available})))'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'ignore'] })
      let output = ''
      child.stdout.on('data', data => { output += String(data) })
      const deadline = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('TLS queue fixture exceeded its deadline.')) }, 10000)
      child.once('error', error => { clearTimeout(deadline); reject(error) })
      child.once('exit', code => {
        clearTimeout(deadline)
        if (code !== 0) { reject(new Error('TLS queue fixture failed.')); return }
        try { resolve((JSON.parse(output) as { available: boolean }).available) } catch { reject(new Error('TLS queue fixture returned no result.')) }
      })
    })
    expect(await probe(false)).toBe(false)
    expect(await probe(true)).toBe(true)
    expect(receivedName).toBe('localhost')
  } finally {
    for (const connection of connections) connection.destroy()
    if (server?.listening) await new Promise<void>(resolve => server!.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
}, 30000)

test('a confirmed transport outage persists inline once and a recovered queue can accept again', async () => {
  await jobs.closeQueues(); accepting = false; disconnectProxy()
  const input = notification(randomUUID())
  try {
    const started = Date.now()
    expect(await deliver(input)).toEqual({ queued: false, id: input.notificationId })
    expect(Date.now() - started).toBeLessThan(5000)
    expect(await findJob('notification', data => matchesNotification(data, input.notificationId))).toBeUndefined()
    await db.notification.update({ where: { id: input.notificationId }, data: { read: true } })
  } finally { accepting = true }
  await new Promise(resolve => setTimeout(resolve, 1100))
  expect(await jobs.enqueueNotification(input)).toBe(true)
  const queued = await findJob('notification', data => matchesNotification(data, input.notificationId))
  expect(queued).toBeDefined()
  await queued!.remove()
  expect((await db.notification.findUniqueOrThrow({ where: { id: input.notificationId } })).read).toBe(true)
})

test('a Redis-accepted job with a lost reply stays unconfirmed and never falls back to duplicate database delivery', async () => {
  // Warm the Lua script and positive availability cache before withholding replies.
  const warm = notification(randomUUID())
  expect(await jobs.enqueueNotification(warm)).toBe(true)
  await (await findJob('notification', data => matchesNotification(data, warm.notificationId)))!.remove()
  const input = notification(randomUUID())
  responses = false
  try {
    const started = Date.now()
    await expect(deliver(input)).rejects.toMatchObject({ code: 'QUEUE_UNCONFIRMED' })
    expect(Date.now() - started).toBeLessThan(7000)
    const accepted = await findJob('notification', data => matchesNotification(data, input.notificationId))
    expect(accepted?.data).toEqual(input)
    expect(await db.notification.findUnique({ where: { id: input.notificationId } })).toBeNull()
    await accepted!.remove()
  } finally { responses = true }
  expect(await jobs.probeQueueRedis()).toBe(true)
})

test('health checks report optional transport failures without raw errors or unbounded connections', async () => {
  const { GET } = await import('@/app/api/health/route')
  accepting = false; disconnectProxy()
  try {
    const response = await GET(), body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, degraded: true, database: { status: 'ok' }, redis: { status: 'error' }, queues: { status: 'error' } })
    expect(JSON.stringify(body)).not.toContain(proxyUrl)
  } finally { accepting = true }
})

test('the actual worker consumes notifications and activity while unconfigured email remains failed', async () => {
  const exit = new Promise<void>(resolve => {
    worker = spawn(process.execPath, ['--import', 'tsx', path.join(process.cwd(), 'src/lib/queues/worker.ts')], {
      cwd: process.cwd(), env: { ...process.env, REDIS_URL: proxyUrl, RESEND_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    worker.once('exit', () => resolve())
  })
  worker!.stdout!.on('data', data => { workerOutput += String(data) })
  worker!.stderr!.on('data', data => { workerOutput += String(data) })
  await eventually(async () => workerOutput, value => value.includes('workers started'))
  const readInput = notification(randomUUID())
  const readBefore = await db.notification.create({ data: { id: readInput.notificationId, userId, type: readInput.type, title: readInput.title, message: readInput.message, read: true } })
  expect(await jobs.enqueueNotification(readInput)).toBe(true)
  const repeated = await eventually(() => findJob('notification', data => matchesNotification(data, readInput.notificationId)), value => !!value)
  await eventually(() => repeated!.getState(), value => value === 'completed')
  expect(await db.notification.findUniqueOrThrow({ where: { id: readInput.notificationId } })).toEqual(readBefore)
  expect(await jobs.enqueueActivity({ userId, action: 'queue_fixture', entityType: 'fixture', entityId: fixture, metadata: { synthetic: true } })).toBe(true)
  await eventually(() => db.activityLog.findFirst({ where: { entityId: fixture } }), value => !!value)
  await findJob('activity', data => !!data && typeof data === 'object' && 'entityId' in data && data.entityId === fixture)
  const invoiceNumber = `${fixture}-invoice`
  expect(await jobs.enqueueEmail({ type: 'invoice', payload: { to: 'private-fixture@example.test', invoiceNumber, amountPaise: 1000, link: 'https://example.test/invoice' } })).toBe(true)
  const email = await eventually(() => findJob('email', data => !!data && typeof data === 'object' && 'payload' in data && !!data.payload && typeof data.payload === 'object' && 'invoiceNumber' in data.payload && data.payload.invoiceNumber === invoiceNumber), value => !!value)
  await eventually(() => email!.getState(), value => value === 'failed', 12000)
  expect(await email!.isCompleted()).toBe(false)
  expect(email!.failedReason || (await controls.email.getJob(email!.id!))?.failedReason).toBe('Email delivery was not confirmed.')
  expect(workerOutput).not.toContain('private-fixture@example.test')
  const { GET } = await import('@/app/api/health/route')
  expect(await (await GET()).json()).toMatchObject({ ok: true, degraded: true, queues: { status: 'ok', counts: { emailFailed: 1 } } })
  await stopWorker(); await exit
}, 30000)
