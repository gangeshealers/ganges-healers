import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createMemberSupportTicket, SupportTicketError } from '@/lib/support/tickets'

const privateHeaders = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in to contact support.', code: 'UNAUTHORIZED' }, { status: 401, headers: privateHeaders })
  }

  const origin = request.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return NextResponse.json({ error: 'Request origin was not accepted.', code: 'FORBIDDEN_ORIGIN' }, { status: 403, headers: privateHeaders })
      }
    } catch {
      return NextResponse.json({ error: 'Request origin was not accepted.', code: 'FORBIDDEN_ORIGIN' }, { status: 403, headers: privateHeaders })
    }
  }

  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return NextResponse.json({ error: 'Send a JSON support request.', code: 'INVALID_CONTENT_TYPE' }, { status: 415, headers: privateHeaders })
  }

  try {
    const raw = await request.text()
    if (raw.length > 8000) {
      return NextResponse.json({ error: 'The request is too large.', code: 'TOO_LARGE' }, { status: 413, headers: privateHeaders })
    }
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Invalid request.', code: 'INVALID_INPUT' }, { status: 400, headers: privateHeaders })
    }
    const ticket = await createMemberSupportTicket(session.user.id, payload)
    return NextResponse.json({ id: ticket.id, status: ticket.status }, { status: 201, headers: privateHeaders })
  } catch (error) {
    if (error instanceof SupportTicketError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: privateHeaders })
    }
    console.error('[support][create][error]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Your request could not be saved. Please try again.', code: 'SAVE_FAILED' }, { status: 500, headers: privateHeaders })
  }
}
