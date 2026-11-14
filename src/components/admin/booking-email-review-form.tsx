'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { BookingEmailDecisionInput, BookingEmailDecisionResult, BookingEmailReviewRecord } from '@/lib/admin/booking-emails'

type Props = { actorId: string; record: BookingEmailReviewRecord; onSave: (input: BookingEmailDecisionInput) => Promise<BookingEmailDecisionResult>; onReload: () => Promise<BookingEmailDecisionResult> }

/** Account/message identity changes discard drafts; background refreshes preserve an active review. */
export function BookingEmailReviewForm(props: Props) {
  const { data, status } = useSession()
  if (status === 'loading') return <p className="text-sm text-muted-foreground">Checking administrator access…</p>
  if (data?.user?.id !== props.actorId || data.user.role !== 'ADMIN') return null
  return <ReviewEditor key={`${props.actorId}:${props.record.id}`} {...props} />
}

function ReviewEditor({ actorId, record, onSave, onReload }: Props) {
  const router = useRouter()
  const [reviewed, setReviewed] = useState(record)
  const [providerId, setProviderId] = useState(record.providerMessageId ?? '')
  const [reason, setReason] = useState('')
  const [decision, setDecision] = useState<'accepted' | 'stopped' | null>(null)
  const [pending, setPending] = useState(false)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const mounted = useRef(true), busy = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  async function reload() {
    if (busy.current) return
    busy.current = true; setPending(true); setError('')
    try {
      const result = await onReload()
      if (!mounted.current) return
      if (!result.success) { setStale(true); setError(result.error); return }
      setReviewed(result.record); setProviderId(result.record.providerMessageId ?? ''); setReason('')
      setDecision(null); setStale(false); setMessage('Latest delivery state loaded.')
      router.refresh()
    } catch {
      if (mounted.current) { setStale(true); setError('Delivery could not be loaded. Reload the message before saving.') }
    } finally { busy.current = false; if (mounted.current) setPending(false) }
  }

  function review(next: 'accepted' | 'stopped') {
    if (busy.current || stale) return
    if (!reason.trim() || reason.trim().length > 300) { setError('Enter a reason for this decision.'); return }
    if (next === 'accepted' && !/^[a-zA-Z0-9_-]{8,160}$/.test(providerId.trim())) { setError('Enter the message ID verified in your email provider records.'); return }
    setError(''); setMessage(''); setDecision(next)
  }
  async function save() {
    if (busy.current || !decision || stale) return
    const selected = decision
    busy.current = true; setPending(true); setError('')
    try {
      const common = { ownerId: actorId, id: reviewed.id, version: reviewed.version, reason: reason.trim() }
      const input: BookingEmailDecisionInput = selected === 'accepted' ? { ...common, decision: selected, providerMessageId: providerId.trim() } : { ...common, decision: selected }
      const result = await onSave(input)
      if (!mounted.current) return
      if (!result.success) {
        setError(result.error); setDecision(null)
        setStale(['EMAIL_CHANGED', 'EMAIL_BUSY', 'EMAIL_NOT_FOUND', 'EMAIL_DECISION_UNAVAILABLE', 'SESSION_CHANGED', 'FORBIDDEN', 'REVIEW_FAILED'].includes(result.code))
        return
      }
      setReviewed(result.record); setDecision(null); setReason('')
      setMessage(selected === 'accepted' ? 'Provider acceptance recorded.' : 'Automatic retries stopped.')
      router.refresh()
    } catch {
      if (mounted.current) { setDecision(null); setError('The outcome could not be confirmed. Reload this message and review its latest state before trying again.'); setStale(true) }
    } finally { busy.current = false; if (mounted.current) setPending(false) }
  }

  return <section aria-label="Review delivery outcome" className="space-y-4">
    {reviewed.leaseUntil ? <p role="status" className="text-sm">A delivery attempt is active. Refresh after its lease expires to review its outcome.</p> : null}
    {reviewed.canAccept || reviewed.canStop ? <>
      <div className="grid gap-2"><Label htmlFor="provider-message-id">Verified provider message ID</Label><Input id="provider-message-id" value={providerId} onChange={e => setProviderId(e.target.value)} maxLength={160} disabled={pending || stale || !reviewed.canAccept} /><p className="text-sm text-muted-foreground">Required when recording a message accepted by your email provider.</p></div>
      <div className="grid gap-2"><Label htmlFor="email-review-reason">Reason for decision</Label><textarea id="email-review-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} rows={3} disabled={pending || stale} className="rounded-md border bg-background p-3 text-sm" /></div>
      <div className="flex flex-wrap gap-3">{reviewed.canAccept ? <Button disabled={pending || stale} onClick={() => review('accepted')}>Record provider acceptance</Button> : null}{reviewed.canStop ? <Button variant="outline" disabled={pending || stale} onClick={() => review('stopped')}>Stop automatic retries</Button> : null}</div>
    </> : !reviewed.leaseUntil ? <p className="text-sm text-muted-foreground">This message has no unresolved delivery action.</p> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button variant="outline" disabled={pending} onClick={reload}>{pending && !decision ? 'Loading…' : 'Reload message'}</Button>
    <Dialog open={decision !== null} onOpenChange={open => { if (!open && !pending) setDecision(null) }}>
      <DialogContent><DialogHeader><DialogTitle>{decision === 'accepted' ? 'Record verified acceptance?' : 'Stop automatic retries?'}</DialogTitle><DialogDescription>{decision === 'accepted' ? 'Record acceptance only after matching this message to your email provider records.' : 'Close this intent against future automatic delivery. A request already in flight may still finish.'}</DialogDescription></DialogHeader>
        <dl className="space-y-2 text-sm"><div><dt className="font-medium">Message</dt><dd className="break-all">{reviewed.id}</dd></div><div><dt className="font-medium">Reviewed status</dt><dd>{reviewed.status}</dd></div>{decision === 'accepted' ? <div><dt className="font-medium">Provider message ID</dt><dd className="break-all">{providerId.trim()}</dd></div> : null}<div><dt className="font-medium">Reason</dt><dd className="break-words">{reason.trim()}</dd></div></dl>
        <p className="text-sm text-muted-foreground">This records a delivery decision without sending another email or changing the appointment.</p>
        <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setDecision(null)}>Keep reviewing</Button><Button disabled={pending} onClick={save}>{pending ? 'Saving…' : decision === 'accepted' ? 'Confirm acceptance' : 'Confirm stop'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
