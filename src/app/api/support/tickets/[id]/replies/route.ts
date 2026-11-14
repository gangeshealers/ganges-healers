import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { replyToSupportConversation } from '@/lib/support/conversations'
import { SupportTicketError } from '@/lib/support/tickets'
import { isSupportConversationEnabled } from '@/lib/support/availability'

const headers = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id)
    return NextResponse.json(
      { error: 'Sign in to contact support.', code: 'UNAUTHORIZED' },
      { status: 401, headers },
    )
  if (!isSupportConversationEnabled())
    return NextResponse.json(
      { error: 'Support conversations are not available yet.', code: 'NOT_ENABLED' },
      { status: 503, headers },
    )
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json(
      { error: 'Request origin was not accepted.', code: 'FORBIDDEN_ORIGIN' },
      { status: 403, headers },
    )
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json'))
    return NextResponse.json(
      { error: 'Send a JSON reply.', code: 'INVALID_CONTENT_TYPE' },
      { status: 415, headers },
    )
  try {
    const raw = await request.text()
    if (raw.length > 16000)
      return NextResponse.json(
        { error: 'The reply is too large.', code: 'TOO_LARGE' },
        { status: 413, headers },
      )
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Invalid reply.', code: 'INVALID_INPUT' }, { status: 400, headers })
    }
    const { id } = await context.params
    const result = await replyToSupportConversation(session.user.id, id, payload)
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers })
  } catch (error) {
    if (error instanceof SupportTicketError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers })
    console.error('[support][reply][error]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json(
      { error: 'Your reply could not be confirmed. Retry the same reply safely.', code: 'SAVE_FAILED' },
      { status: 500, headers },
    )
  }
}
