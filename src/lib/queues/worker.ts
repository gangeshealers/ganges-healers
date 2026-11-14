/**
 * BullMQ Worker — processes email, notification, and activity log jobs.
 *
 * Run separately: npx tsx src/lib/queues/worker.ts
 */
import { Worker } from 'bullmq'
import { redisConnectionOptions, type EmailJobData, type NotificationJobData, type ActivityJobData } from './jobs'
import { storeNotification } from '../notifications/delivery'
import { drainBookingEmails } from '../bookings/email'

const connection = redisConnectionOptions(process.env.REDIS_URL, 'worker')
if (!connection) throw new Error('REDIS_URL is required to start queue workers.')

// ─── Email Worker ──────────────────────────────────────────────

const emailWorker = new Worker<EmailJobData>(
  'email',
  async (job) => {
    // Dynamic import to avoid loading email service on module load
    const { emailService } = await import('../email/email.service')

    let result: { success: boolean; id?: string }
    switch (job.data.type) {
      case 'booking_confirmation':
        result = await emailService.sendBookingConfirmation(job.data.payload)
        break
      case 'booking_cancellation':
        result = await emailService.sendBookingCancellation(job.data.payload)
        break
      case 'booking_reminder':
        result = await emailService.sendBookingReminder(job.data.payload)
        break
      case 'invoice':
        result = await emailService.sendInvoiceEmail(job.data.payload)
        break
      default:
        throw new Error('Unsupported email job type.')
    }
    if (!result.success || !result.id?.trim()) throw new Error('Email delivery was not confirmed.')
  },
  { connection, concurrency: 5 }
)

// ─── Notification Worker ───────────────────────────────────────

const notificationWorker = new Worker<NotificationJobData>(
  'notification',
  async (job) => {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    try {
      await storeNotification(job.data, prisma)
    } finally {
      await prisma.$disconnect()
    }
  },
  { connection, concurrency: 3 }
)

// ─── Activity Log Worker ───────────────────────────────────────

const activityWorker = new Worker<ActivityJobData>(
  'activity',
  async (job) => {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    try {
      await prisma.activityLog.create({
        data: {
          userId: job.data.userId ?? undefined,
          action: job.data.action,
          entityType: job.data.entityType,
          entityId: job.data.entityId,
          metadata: job.data.metadata as import('@prisma/client').Prisma.InputJsonValue | undefined,
        },
      })
    } finally {
      await prisma.$disconnect()
    }
  },
  { connection, concurrency: 5 }
)

// ─── Lifecycle ─────────────────────────────────────────────────

let shuttingDown = false
let bookingEmailRun: Promise<unknown> | null = null
function recoverBookingEmails() {
  if (shuttingDown || bookingEmailRun) return
  bookingEmailRun = drainBookingEmails({ limit: 5 })
    .catch(() => console.error('[worker][booking-email][error]'))
    .finally(() => { bookingEmailRun = null })
}
const bookingEmailTimer = setInterval(recoverBookingEmails, 60000)
bookingEmailTimer.unref()
recoverBookingEmails()

function gracefulShutdown() {
  if (shuttingDown) return
  shuttingDown = true
  clearInterval(bookingEmailTimer)
  console.log('[worker] Shutting down...')
  const deadline = setTimeout(() => process.exit(1), 10000)
  Promise.all([
    emailWorker.close(),
    notificationWorker.close(),
    activityWorker.close(),
    bookingEmailRun,
  ]).then(() => {
    clearTimeout(deadline)
    process.exit(0)
  }).catch(() => {
    clearTimeout(deadline)
    console.error('[worker][shutdown][error]')
    process.exit(1)
  })
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

for (const w of [emailWorker, notificationWorker, activityWorker]) {
  w.on('failed', (job, err) => {
    console.error(`[worker][${w.name}] Job ${job?.id} failed:`, { type: err instanceof Error ? err.name : 'unknown' })
  })
  w.on('error', () => console.error(`[worker][${w.name}][connection_error]`))
}

console.log('[worker] Email, Notification, and Activity workers started')
