import { Queue, type QueueOptions } from 'bullmq'
import IORedis from 'ioredis'
import { isIP } from 'node:net'

const REDIS_URL = process.env.REDIS_URL

export const QUEUE_OPERATION_TIMEOUT_MS = 5000

/** Use the same validated transport/database for producers, probes and durable workers. */
export function redisConnectionOptions(url: string | undefined, role: 'producer' | 'probe' | 'worker' = 'producer') {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const port = Number(parsed.port || '6379'), database = Number(parsed.pathname.slice(1) || '0')
    const host = parsed.hostname.replace(/^\[|\]$/g, '')
    if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname || parsed.search || parsed.hash ||
      !/^\/\d*$/.test(parsed.pathname || '/') || !Number.isInteger(port) || port < 1 || port > 65535 ||
      !Number.isSafeInteger(database) || database < 0 || database > 2147483647) throw new Error('Invalid configuration')
    return {
      host, port, db: database,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      ...(parsed.protocol === 'rediss:' ? { tls: isIP(host) ? {} : { servername: host } } : {}),
      connectTimeout: role === 'probe' ? 1000 : 2000,
      ...(role === 'worker' ? { maxRetriesPerRequest: null, enableOfflineQueue: true } : {
        maxRetriesPerRequest: role === 'probe' ? 0 : 1,
        commandTimeout: role === 'probe' ? 1000 : 2000,
        enableOfflineQueue: false, autoResendUnfulfilledCommands: false,
        retryStrategy: (attempt: number) => role === 'producer' && attempt === 1 ? 100 : null,
      }),
      ...(role === 'probe' ? { lazyConnect: true } : {}),
    }
  } catch {
    throw new Error('Invalid REDIS_URL. Use redis:// or rediss:// with a host, optional credentials, port and database number.')
  }
}

export class QueueOperationError extends Error {
  readonly code = 'QUEUE_UNCONFIRMED'
  constructor() { super('Queue operation could not be confirmed.'); this.name = 'QueueOperationError' }
}

type QueueKind = 'email' | 'notification' | 'activity'
// Keep BullMQ's own ioredis client and permit cancellation even before it is ready.
class ProducerQueue extends Queue {
  forceClose() { this.closed = true; return this.connection.close(true) }
}
const entries: Partial<Record<QueueKind, ProducerQueue>> = {}

function openQueue(kind: QueueKind, defaultJobOptions: QueueOptions['defaultJobOptions']) {
  if (entries[kind]) return entries[kind]
  const options = redisConnectionOptions(REDIS_URL)
  if (!options) return null
  const queue = new ProducerQueue(kind, { connection: options, defaultJobOptions })
  // Never print an endpoint, credential or payload from a connection error.
  queue.on('error', () => console.warn('[queues][connection][error]', { queue: kind }))
  entries[kind] = queue
  return queue
}

function discardQueue(kind: QueueKind, queue: Queue) {
  const entry = entries[kind]
  if (entry === queue) {
    delete entries[kind]
    void entry.forceClose().catch(() => {})
  }
}

async function queueOperation<T>(kind: QueueKind, queue: Queue, operation: () => Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new QueueOperationError()), QUEUE_OPERATION_TIMEOUT_MS)
    })])
  } catch {
    discardQueue(kind, queue)
    availability = null
    throw new QueueOperationError()
  } finally { if (timer) clearTimeout(timer) }
}

/** Close owned producer sockets, including half-open connections; no jobs are removed. */
export async function closeQueues() {
  const closing = Object.entries(entries).map(([kind, entry]) => {
    delete entries[kind as QueueKind]
    return entry.forceClose()
  })
  availability = null
  await Promise.allSettled(closing)
}

/** Email queue — booking confirmations, cancellations, reminders, invoices. */
export function getEmailQueue(): Queue | null {
  return openQueue('email', { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 200 })
}

/** Notification queue — create and push notifications to users. */
export function getNotificationQueue(): Queue | null {
  return openQueue('notification', { attempts: 2, backoff: { type: 'fixed', delay: 1000 }, removeOnComplete: 100, removeOnFail: 200 })
}

/** Activity log queue — async activity logging. */
export function getActivityQueue(): Queue | null {
  return openQueue('activity', { attempts: 2, backoff: { type: 'fixed', delay: 1000 }, removeOnComplete: 50, removeOnFail: 100 })
}

/** A fresh, bounded probe with a socket that is always disconnected. */
export async function probeQueueRedis(): Promise<boolean> {
  let client: IORedis | undefined
  try {
    const options = redisConnectionOptions(REDIS_URL, 'probe')
    if (!options) return false
    client = new IORedis(options)
    client.on('error', () => {})
    await client.connect()
    return await client.ping() === 'PONG'
  } catch { return false }
  finally { client?.disconnect() }
}

/** Queue counters indicate transport/backlog status, not consumer or provider delivery. */
export async function getQueueHealthCounts() {
  const queues = [['email', getEmailQueue()], ['notification', getNotificationQueue()], ['activity', getActivityQueue()]] as const
  const values = await Promise.all(queues.map(async ([kind, queue]) => {
    if (!queue) throw new QueueOperationError()
    return [kind, await queueOperation(kind, queue, () => queue.getJobCounts('waiting', 'active', 'failed'))] as const
  }))
  const counts: Record<string, number> = {}
  for (const [kind, result] of values) {
    counts[`${kind}Waiting`] = result.waiting ?? 0
    counts[`${kind}Active`] = result.active ?? 0
    counts[`${kind}Failed`] = result.failed ?? 0
  }
  return counts
}

// ─── Job type definitions ───────────────────────────────────────

export type EmailJobData =
  | { type: 'booking_confirmation'; payload: { to: string; userName: string; serviceName: string; healerName: string; date: string; time: string; bookingId: string } }
  | { type: 'booking_cancellation'; payload: { to: string; userName: string; serviceName: string; date: string; time: string } }
  | { type: 'booking_reminder'; payload: { to: string; userName: string; serviceName: string; healerName: string; date: string; time: string; bookingId: string } }
  | { type: 'invoice'; payload: { to: string; invoiceNumber: string; amountPaise: number; link: string } }

export interface NotificationJobData {
  notificationId?: string
  userId: string
  type: string
  title: string
  message: string
}

export interface ActivityJobData {
  userId?: string | null
  action: string
  entityType: string
  entityId: string
  metadata?: Record<string, unknown>
}

// ─── Helper functions to enqueue jobs ───────────────────────────

let availability: { available: boolean; until: number } | null = null
let availabilityCheck: Promise<boolean> | null = null

async function isRedisAvailable(): Promise<boolean> {
  if (!REDIS_URL) return false
  if (availability && Date.now() < availability.until) return availability.available
  if (!availabilityCheck) {
    availabilityCheck = probeQueueRedis().then(available => {
      availability = { available, until: Date.now() + (available ? 5000 : 1000) }
      return available
    }).finally(() => { availabilityCheck = null })
  }
  return availabilityCheck
}

/** Enqueue an email job. Returns false if Redis is unavailable (caller should send inline). */
export async function enqueueEmail(data: EmailJobData): Promise<boolean> {
  if (!(await isRedisAvailable())) return false
  const q = getEmailQueue()
  if (!q) return false
  await queueOperation('email', q, () => q.add(data.type, data))
  return true
}

/** Enqueue a notification creation job. Returns false if Redis is unavailable. */
export async function enqueueNotification(data: NotificationJobData): Promise<boolean> {
  if (!(await isRedisAvailable())) return false
  const q = getNotificationQueue()
  if (!q) return false
  await queueOperation('notification', q, () => q.add('create', data))
  return true
}

/** Enqueue an activity log job. Returns false if Redis is unavailable. */
export async function enqueueActivity(data: ActivityJobData): Promise<boolean> {
  if (!(await isRedisAvailable())) return false
  const q = getActivityQueue()
  if (!q) return false
  await queueOperation('activity', q, () => q.add('log', data))
  return true
}
