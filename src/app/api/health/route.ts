import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const startTime = Date.now()
let databasePing: Promise<unknown> | null = null

function withinBudget<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Health check timed out')), 5000) })
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timer))
}

async function checkDatabase(): Promise<{ status: 'ok' | 'error'; latencyMs?: number; error?: string }> {
  const start = Date.now()
  try {
    // A timed-out driver query may still settle later. Share it instead of piling
    // additional probes onto the application's connection pool during an outage.
    if (!databasePing) {
      const running = Promise.resolve(prisma.$queryRaw`SELECT 1`).finally(() => { if (databasePing === running) databasePing = null })
      databasePing = running
    }
    await withinBudget(databasePing)
    return { status: 'ok', latencyMs: Date.now() - start }
  } catch {
    return { status: 'error', latencyMs: Date.now() - start, error: 'Database check unavailable' }
  }
}

type DependencyStatus = { status: 'ok' | 'unavailable' | 'error'; latencyMs?: number }
type QueueStatus = { status: 'ok' | 'unavailable' | 'error'; counts?: Record<string, number> }

async function checkRedisAndQueues(): Promise<{ redis: DependencyStatus; queues: QueueStatus }> {
  if (!process.env.REDIS_URL) return { redis: { status: 'unavailable' }, queues: { status: 'unavailable' } }
  const start = Date.now()
  try {
    const { probeQueueRedis, getQueueHealthCounts } = await import('@/lib/queues/jobs')
    if (!await probeQueueRedis()) return { redis: { status: 'error', latencyMs: Date.now() - start }, queues: { status: 'error' } }
    const latencyMs = Date.now() - start
    try {
      return { redis: { status: 'ok', latencyMs }, queues: { status: 'ok', counts: await getQueueHealthCounts() } }
    } catch {
      return { redis: { status: 'ok', latencyMs }, queues: { status: 'error' } }
    }
  } catch {
    return { redis: { status: 'error', latencyMs: Date.now() - start }, queues: { status: 'error' } }
  }
}

export async function GET() {
  const [database, { redis, queues }] = await Promise.all([
    checkDatabase(),
    checkRedisAndQueues(),
  ])

  const overallOk = database.status === 'ok'
  const uptimeMs = Date.now() - startTime

  const body = {
    ok: overallOk,
    degraded: !overallOk || redis.status === 'error' || queues.status === 'error' || Object.entries(queues.counts ?? {}).some(([key, value]) => key.endsWith('Failed') && value > 0),
    ts: Date.now(),
    uptime: {
      ms: uptimeMs,
      human: formatUptime(uptimeMs),
    },
    database,
    redis,
    queues,
  }

  return new Response(JSON.stringify(body), {
    status: overallOk ? 200 : 503,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    },
  })
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  parts.push(`${sec}s`)
  return parts.join(' ')
}
