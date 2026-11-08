import { NextResponse } from 'next/server'
import { drainBookingEmails } from '@/lib/bookings/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Recover a small due batch independently of Redis or a customer's open browser. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim() || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ success: true, ...await drainBookingEmails({ limit: 3 }) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[bookings][email][recovery_failed]')
    return NextResponse.json({ error: 'Failed to process booking emails' }, { status: 500 })
  }
}
