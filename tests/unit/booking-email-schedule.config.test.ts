import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface Schedule { schedule: string; path?: string; requestMethod?: string }
interface Config { schedules?: Record<string, Schedule>; crons?: Array<{ path: string; schedule: string }> }

test('booking-email recovery is registered once with the existing authenticated GET endpoint', () => {
  const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as Config
  expect(config.schedules?.['booking-email-recovery']).toEqual({
    schedule: '*/15 * * * *',
    path: '/api/cron/booking-emails',
    requestMethod: 'GET',
  })
  expect(config.crons?.some(cron => cron.path === '/api/cron/booking-emails')).toBe(false)
})

test('legacy cron jobs keep their pre-existing paths and do not double-dispatch the outbox', () => {
  const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as Config
  expect(config.crons?.map(job => job.path)).toEqual([
    '/api/cron/booking-reminders',
    '/api/cron/quiz-followup',
    '/api/cron/abandoned-cart',
    '/api/cron/aggregate-funnel',
    '/api/cron/cleanup-events',
  ])
})
