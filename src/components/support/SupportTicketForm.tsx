'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

/** Authenticated request form; replies appear in the member's private ticket list. */
export default function SupportTicketForm() {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      })
      const payload: { error?: string } = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Your request could not be sent. Please try again.')
        return
      }
      setSubject('')
      setMessage('')
      setNotice('Your support request was received. You can track it below.')
      router.refresh()
    } catch {
      setError('Unable to reach support right now. Check your connection and retry.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={event => void submit(event)} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Send a support request</h2>
      <p className="text-sm text-muted-foreground">Describe a booking, payment, course, or account issue. Do not include passwords, payment card numbers, or other sensitive credentials.</p>
      <div className="space-y-1">
        <label htmlFor="support-subject" className="block text-sm font-medium">Subject</label>
        <input
          id="support-subject" name="subject" type="text" required minLength={5} maxLength={120}
          autoComplete="off" value={subject} onChange={event => setSubject(event.target.value)}
          placeholder="What do you need help with?"
          className="w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="support-message" className="block text-sm font-medium">Message</label>
        <textarea
          id="support-message" name="message" required minLength={20} maxLength={3000}
          rows={5} value={message} onChange={event => setMessage(event.target.value)}
          placeholder="Tell us what happened and what outcome you need."
          className="w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
        />
        <p className="text-xs text-muted-foreground">{message.length}/3000 characters</p>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
      <button
        type="submit" disabled={submitting}
        className="inline-flex min-h-10 items-center justify-center rounded-md bg-violet-700 px-5 py-2 font-semibold text-white hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:cursor-wait disabled:opacity-70"
      >
        {submitting ? 'Sending request…' : 'Send support request'}
      </button>
    </form>
  )
}
