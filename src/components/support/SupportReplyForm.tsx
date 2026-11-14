'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import type { SupportScope } from '@/lib/support/conversations'

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
type Attempt = {
  message: string
  requestId: string
  updatedAt: string
  expectedAccountId: string
  scope: SupportScope
  status?: TicketStatus
}

/** A draft stays private to its account, and an uncertain send retries identical bytes. */
export default function SupportReplyForm({
  ticketId,
  actorId,
  updatedAt,
  status,
  scope,
}: {
  ticketId: string
  actorId: string
  updatedAt: string
  status: TicketStatus
  scope: SupportScope
}) {
  const router = useRouter()
  const session = useSession()
  const currentAccount = session.status === 'authenticated' ? session.data?.user?.id : null
  const identity = useRef(currentAccount)
  identity.current = currentAccount
  const [message, setMessage] = useState('')
  const [nextStatus, setNextStatus] = useState<TicketStatus>(status)
  const [revision, setRevision] = useState(updatedAt)
  const previousStatus = useRef(status)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [stale, setStale] = useState(false)
  const [accountChanged, setAccountChanged] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const sending = useRef(false)
  const attempt = useRef<Attempt | null>(null)
  const controller = useRef<AbortController | null>(null)
  const sequence = useRef(0)

  useEffect(() => {
    sequence.current++
    controller.current?.abort()
    attempt.current = null
    sending.current = false
    setMessage('')
    setError('')
    setNotice('')
    setBusy(false)
    setUncertain(false)
    setStale(false)
    return () => controller.current?.abort()
  }, [currentAccount, ticketId])

  useEffect(() => {
    if (updatedAt !== revision && !attempt.current) {
      setRevision(updatedAt)
      setStale(false)
      setError('')
      // Preserve an unsent status choice and message across a conflict reload.
      const original = previousStatus.current
      previousStatus.current = status
      setNextStatus((choice) => (choice === original ? status : choice))
    }
  }, [updatedAt, revision, status, uncertain, busy])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current || currentAccount !== actorId || stale || accountChanged) return
    const payload = attempt.current ?? {
      message: message.trim(),
      requestId: crypto.randomUUID(),
      updatedAt: revision,
      expectedAccountId: actorId,
      scope,
      ...(scope === 'staff' ? { status: nextStatus } : {}),
    }
    attempt.current = payload
    sending.current = true
    const call = ++sequence.current
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError('')
    setNotice('')
    const active = () => !request.signal.aborted && call === sequence.current && identity.current === actorId
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: request.signal,
      })
      const data = await response.json().catch(() => null)
      if (!active()) return
      if (!response.ok) {
        if (response.status < 500) {
          attempt.current = null
          setUncertain(false)
        } else setUncertain(true)
        if (data?.code === 'STALE_TICKET' || data?.code === 'REQUEST_CONFLICT') setStale(true)
        if (data?.code === 'ACCOUNT_CHANGED' || response.status === 401 || response.status === 403)
          setAccountChanged(true)
        setError(
          typeof data?.error === 'string'
            ? data.error
            : 'Your reply could not be confirmed. Retry the same reply safely.',
        )
        return
      }
      if (
        data?.success !== true ||
        data.id !== ticketId ||
        data.requestId !== payload.requestId ||
        typeof data.messageId !== 'string'
      )
        throw new Error('Unconfirmed reply')
      attempt.current = null
      setMessage('')
      setUncertain(false)
      setNotice(scope === 'staff' && !payload.message ? 'Request status updated.' : 'Your reply was saved.')
      router.refresh()
    } catch {
      if (active()) {
        setUncertain(true)
        setError('We could not confirm the send. Retry the same reply safely.')
      }
    } finally {
      if (active()) {
        sending.current = false
        setBusy(false)
      }
    }
  }

  if (currentAccount !== actorId || accountChanged)
    return (
      <p role="status" className="rounded-xl border p-5 text-sm">
        {session.status === 'loading'
          ? 'Loading your account…'
          : 'Your account changed. Reload this page to continue.'}
      </p>
    )
  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">{scope === 'staff' ? 'Reply to member' : 'Add a follow-up'}</h2>
      <p className="text-sm text-muted-foreground">
        Messages stay in this private support conversation. Do not include passwords or payment card details.
        {scope === 'member' && status === 'RESOLVED' ? ' Sending a follow-up reopens this request.' : ''}
      </p>
      <div className="space-y-2">
        <label htmlFor="support-reply" className="block text-sm font-medium">
          Your reply
        </label>
        <textarea
          id="support-reply"
          rows={5}
          maxLength={3000}
          required={scope === 'member'}
          value={message}
          disabled={busy || uncertain}
          onChange={(event) => setMessage(event.target.value)}
          className="w-full rounded-md border bg-background p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">{message.length}/3000 characters</p>
      </div>
      {scope === 'staff' && (
        <label className="grid gap-2 text-sm font-medium">
          Request status
          <select
            value={nextStatus}
            disabled={busy || uncertain}
            onChange={(event) => setNextStatus(event.target.value as TicketStatus)}
            className="rounded-md border bg-background p-2"
          >
            <option value="OPEN">Received</option>
            <option value="IN_PROGRESS">In review</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={
            busy || stale || (!uncertain && !message.trim() && (scope === 'member' || nextStatus === status))
          }
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy
            ? 'Saving…'
            : uncertain
              ? 'Retry same reply'
              : scope === 'staff' && !message.trim()
                ? 'Update status'
                : 'Send reply'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => router.refresh()}
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          {stale ? 'Review latest conversation' : 'Refresh conversation'}
        </button>
      </div>
    </form>
  )
}
