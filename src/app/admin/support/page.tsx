import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { SupportTicketError, updateAdminSupportTicket } from '@/lib/support/tickets'
import { isSupportDeskEnabled } from '@/lib/support/availability'
import { type Prisma, type SupportTicketStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

async function saveSupportResponse(formData: FormData) {
  'use server'
  await requireCurrentAdmin()
  if (!isSupportDeskEnabled()) redirect('/admin/support')
  let errorCode: string | null = null
  try {
    await updateAdminSupportTicket(Object.fromEntries(formData))
  } catch (error) {
    if (error instanceof SupportTicketError) {
      errorCode = error.code === 'STALE_TICKET' ? 'stale' : 'invalid'
    } else {
      console.error('[support][admin-update][error]', { type: error instanceof Error ? error.name : 'unknown' })
      errorCode = 'save'
    }
  }
  if (errorCode) redirect(`/admin/support?error=${errorCode}`)
  revalidatePath('/admin/support')
  revalidatePath('/dashboard/support')
  redirect('/admin/support?updated=1')
}

const supportedStatuses: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED']
const PAGE_SIZE = 30

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  await requireCurrentAdmin()

  if (!isSupportDeskEnabled()) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-12">
        <h1 className="text-3xl font-semibold">Member support queue</h1>
        <p role="status" className="rounded-xl border bg-white p-5 text-sm text-muted-foreground">
          Support requests are disabled until the SupportTicket migration is applied and verified for this environment.
        </p>
        <Link href="/admin" className="inline-flex rounded-lg border px-4 py-2 text-sm font-medium">Back to admin dashboard</Link>
      </div>
    )
  }

  const params = (await searchParams) ?? {}
  const rawStatus = typeof params.status === 'string' ? params.status : 'OPEN'
  const status: SupportTicketStatus | undefined = supportedStatuses.find(candidate => candidate === rawStatus)
  const where: Prisma.SupportTicketWhereInput = status ? { status } : {}
  const total = await prisma.supportTicket.count({ where })
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const rawPage = typeof params.page === 'string' ? params.page : ''
  const requestedPage = /^[1-9]\d{0,3}$/.test(rawPage) && Number(rawPage) <= 1000 ? Number(rawPage) : 1
  const page = totalPages ? Math.min(requestedPage, totalPages) : 1
  const tickets = total ? await prisma.supportTicket.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true, subject: true, message: true, status: true, response: true,
      createdAt: true, updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  }) : []

  const notice = params.updated === '1' ? 'Support request updated.' : null
  const error = params.error === 'stale'
    ? 'This request changed. Review it again before saving.'
    : params.error === 'invalid'
      ? 'Please review the status and response, then retry.'
      : params.error === 'save'
        ? 'The request could not be saved. Please try again.'
        : null
  const filterHref = (nextStatus: string, nextPage = 1) => {
    const q = new URLSearchParams()
    if (nextStatus !== 'ALL') q.set('status', nextStatus)
    if (nextPage > 1) q.set('page', String(nextPage))
    return `/admin/support${q.size ? `?${q}` : ''}`
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div>
        <Link href="/admin" className="text-sm font-medium text-violet-700 hover:underline">Back to admin dashboard</Link>
        <h1 className="mt-3 text-3xl font-bold">Member support queue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review private member requests, send a response, and mark progress. Responses appear in the member’s support center; no email is sent.
        </p>
      </div>

      {notice ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      <nav aria-label="Filter support requests" className="flex flex-wrap gap-2">
        {[
          { value: 'OPEN', label: 'Received' },
          { value: 'IN_PROGRESS', label: 'In review' },
          { value: 'RESOLVED', label: 'Resolved' },
          { value: 'ALL', label: 'All requests' },
        ].map(item => (
          <Link
            key={item.value} href={filterHref(item.value)}
            aria-current={(status ?? 'ALL') === item.value ? 'page' : undefined}
            className={`rounded-lg border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 ${(status ?? 'ALL') === item.value ? 'bg-slate-950 text-white' : 'bg-white hover:bg-slate-50'}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">{total} {total === 1 ? 'request' : 'requests'} in this view</p>

      {tickets.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No support requests in this view.</p>
      ) : (
        <div className="space-y-5">
          {tickets.map(ticket => (
            <article key={ticket.id} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm" aria-label={`Support request ${ticket.subject}`}>
              <header className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">{ticket.subject}</h2>
                  <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-semibold">{ticket.status.replace('_', ' ')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Member: {ticket.user.name || ticket.user.email} ({ticket.user.email}) · Received {ticket.createdAt.toLocaleDateString('en-IN')}
                </p>
              </header>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{ticket.message}</p>
              <form action={saveSupportResponse} className="space-y-3 rounded-lg bg-slate-50 p-4">
                <input type="hidden" name="id" value={ticket.id} />
                <input type="hidden" name="updatedAt" value={ticket.updatedAt.toISOString()} />
                <div className="space-y-1">
                  <label htmlFor={`status-${ticket.id}`} className="block text-sm font-medium">Request status</label>
                  <select name="status" id={`status-${ticket.id}`} defaultValue={ticket.status} className="w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-violet-600">
                    <option value="OPEN">Received</option>
                    <option value="IN_PROGRESS">In review</option>
                    <option value="RESOLVED">Resolved</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor={`reply-${ticket.id}`} className="block text-sm font-medium">Response visible to member</label>
                  <textarea
                    id={`reply-${ticket.id}`} name="response" defaultValue={ticket.response ?? ''} rows={4} maxLength={3000}
                    placeholder="Write a helpful, specific response…" className="w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-violet-600"
                  />
                </div>
                <button type="submit" className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-violet-600">
                  Save support response
                </button>
              </form>
            </article>
          ))}
        </div>
      )}
      {totalPages > 1 ? (
        <nav aria-label="Support queue pages" className="flex items-center justify-between gap-3">
          {page > 1 ? <Link href={filterHref(status ?? 'ALL', page - 1)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Previous requests</Link> : <span />}
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          {page < totalPages ? <Link href={filterHref(status ?? 'ALL', page + 1)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Next requests</Link> : <span />}
        </nav>
      ) : null}
    </div>
  )
}
