import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { readSupportConversation, supportStatusLabels, type SupportScope } from '@/lib/support/conversations'
import { SupportTicketError } from '@/lib/support/tickets'
import { isSupportConversationEnabled } from '@/lib/support/availability'
import SupportReplyForm from './SupportReplyForm'

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** Shared server-only detail renderer; database reads enforce each route's own scope. */
export default async function SupportConversationPage({
  id,
  scope,
  page,
}: {
  id: string
  scope: SupportScope
  page?: string | string[]
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  const base = scope === 'staff' ? '/admin/support' : '/dashboard/support'
  if (scope === 'staff' && session.user.role !== 'ADMIN') notFound()
  if (!isSupportConversationEnabled())
    return (
      <section className="container mx-auto max-w-3xl space-y-4 px-4 py-10">
        <h1 className="text-2xl font-semibold">Support conversation</h1>
        <p role="status">Follow-up conversations are not available on this deployment yet.</p>
        <Link href={base} className="underline">
          Back to support requests
        </Link>
      </section>
    )
  const data = await readSupportConversation(session.user.id, id, scope, page).catch((error) => {
    if (error instanceof SupportTicketError) {
      if (error.status === 401) redirect('/auth/signin')
      if (error.status === 403 || error.status === 404) notFound()
    }
    throw error
  })
  const { ticket, messages } = data
  const detailHref = `${base}/${encodeURIComponent(ticket.id)}`
  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-3">
        <Link href={base} className="text-sm font-medium text-primary underline">
          Back to support requests
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="break-words text-3xl font-semibold">{ticket.subject}</h1>
          <span className="rounded-full bg-muted px-3 py-1 text-sm">
            {supportStatusLabels[ticket.status]}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">Private support conversation · Times shown in IST</p>
      </header>
      <section aria-label="Original request" className="space-y-3 rounded-xl border bg-muted/30 p-5">
        <div className="flex flex-wrap justify-between gap-2">
          <h2 className="font-semibold">Original request</h2>
          <time dateTime={ticket.createdAt.toISOString()} className="text-xs text-muted-foreground">
            {dateFormat.format(ticket.createdAt)} IST
          </time>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{ticket.message}</p>
      </section>
      {data.legacyResponse && (
        <section
          aria-label="Earlier support response"
          className="space-y-2 rounded-xl border-l-4 border-emerald-600 bg-emerald-50 p-5 dark:bg-emerald-950/30"
        >
          <h2 className="font-semibold">Earlier support response</h2>
          <p className="whitespace-pre-wrap break-words text-sm">{data.legacyResponse}</p>
        </section>
      )}
      <section aria-labelledby="conversation-replies" className="space-y-4">
        <h2 id="conversation-replies" className="text-xl font-semibold">
          Conversation
        </h2>
        {messages.length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            No follow-up messages yet. Add a reply below.
          </p>
        ) : (
          <ol className="space-y-4">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`space-y-3 rounded-xl border p-5 ${message.authorRole === 'STAFF' ? 'border-l-4 border-l-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-card'}`}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {message.authorRole === 'STAFF' ? 'Support team' : scope === 'member' ? 'You' : 'Member'}
                  </h3>
                  <time dateTime={message.createdAt.toISOString()} className="text-xs text-muted-foreground">
                    {dateFormat.format(message.createdAt)} IST
                  </time>
                </div>
                {message.body && (
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Status: {supportStatusLabels[message.statusAfter]}
                </p>
              </li>
            ))}
          </ol>
        )}
        {data.lastPage > 1 && (
          <nav
            aria-label="Conversation history pages"
            className="flex flex-wrap justify-between gap-3 text-sm"
          >
            {data.page < data.lastPage ? (
              <Link href={`${detailHref}?page=${data.page + 1}`} className="underline">
                Older messages
              </Link>
            ) : (
              <span />
            )}
            <span>
              Page {data.page} of {data.lastPage} · newest page first
            </span>
            {data.page > 1 && (
              <Link
                href={data.page === 2 ? detailHref : `${detailHref}?page=${data.page - 1}`}
                className="underline"
              >
                Newer messages
              </Link>
            )}
          </nav>
        )}
      </section>
      {data.page > 1 ? (
        <Link href={detailHref} className="inline-flex rounded-md border px-4 py-2 text-sm font-medium">
          Read latest messages and reply
        </Link>
      ) : (
        <SupportReplyForm
          key={`${session.user.id}:${ticket.id}`}
          ticketId={ticket.id}
          actorId={session.user.id}
          updatedAt={ticket.updatedAt.toISOString()}
          status={ticket.status}
          scope={scope}
        />
      )}
    </div>
  )
}
