import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getRazorpayClient } from '@/lib/razorpay'
import { endMembershipNow, MembershipCancellationError } from '@/lib/memberships/cancel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

/** Immediately end only the signed-in user's bound VIP subscription. */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in to manage your membership.', code: 'UNAUTHORIZED' }, { status: 401, headers })
  }

  const origin = req.headers.get('origin')
  try {
    if (origin && new URL(origin).origin !== new URL(req.url).origin) {
      return NextResponse.json({ error: 'Request origin was not accepted.', code: 'FORBIDDEN_ORIGIN' }, { status: 403, headers })
    }
  } catch {
    return NextResponse.json({ error: 'Request origin was not accepted.', code: 'FORBIDDEN_ORIGIN' }, { status: 403, headers })
  }

  if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return NextResponse.json({ error: 'Send a JSON request.', code: 'INVALID_CONTENT_TYPE' }, { status: 415, headers })
  }
  const raw = await req.text()
  if (raw.length > 512) {
    return NextResponse.json({ error: 'Request is too large.', code: 'TOO_LARGE' }, { status: 413, headers })
  }
  let body: unknown
  try { body = JSON.parse(raw) } catch {
    return NextResponse.json({ error: 'Invalid request.', code: 'INVALID_INPUT' }, { status: 400, headers })
  }
  const membershipId = body && typeof body === 'object' && !Array.isArray(body) && 'membershipId' in body ? body.membershipId : null
  if (typeof membershipId !== 'string' || !/^[a-zA-Z0-9_-]{6,128}$/.test(membershipId)) {
    return NextResponse.json({ error: 'Invalid membership.', code: 'INVALID_INPUT' }, { status: 400, headers })
  }

  try {
    const client = await getRazorpayClient()
    if (!client) {
      return NextResponse.json({ error: 'Membership management is temporarily unavailable.', code: 'PROVIDER_UNAVAILABLE' }, { status: 503, headers })
    }
    const result = await endMembershipNow(session.user.id, membershipId, client.subscriptions)
    return NextResponse.json(result, { headers })
  } catch (error) {
    if (error instanceof MembershipCancellationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers })
    }
    console.error('[membership][cancel][failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Unable to finish cancellation. Please retry or contact support.', code: 'CANCEL_FAILED' }, { status: 500, headers })
  }
}
