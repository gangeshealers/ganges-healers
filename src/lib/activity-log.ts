import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { enqueueActivity } from '@/lib/queues/jobs'
import { runSideEffect } from '@/lib/runSideEffect'

/**
 * Log an activity. Dispatches to BullMQ queue if Redis is available,
 * otherwise writes directly. Registered with the request lifetime even when
 * callers do not await it; optional activity writes never throw to callers.
 */
export async function logActivity(params: {
  userId?: string | null
  action: string
  entityType: string
  entityId: string
  metadata?: Prisma.InputJsonValue
}) {
  await runSideEffect((async () => {
    try {
      const enqueued = await enqueueActivity({
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata as Record<string, unknown> | undefined,
      })
      if (enqueued) return

      // Fallback: write directly only on confirmed queue unavailability.
      await prisma.activityLog.create({
        data: {
          userId: params.userId ?? undefined,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          metadata: params.metadata ?? undefined,
        },
      })
    } catch (err) {
      // Swallow so callers are never impacted.
      console.error('[activity-log][write-failed]', { errorType: err instanceof Error ? 'Error' : typeof err })
    }
  })())
}
