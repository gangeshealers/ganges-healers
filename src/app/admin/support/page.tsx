import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { SupportTicketError, updateAdminSupportTicket } from '@/lib/support/tickets'
import { isSupportDeskEnabled } from '@/lib/support/availability'
import {
  ADMIN_SUPPORT_PAGE_SIZE,
  ADMIN_SUPPORT_MAX_QUERY,
  type AdminSupportStatus,
  adminSupportHref,
  adminSupportWhere,
  parseAdminSupportFilters,
} from '@/lib/support/admin-filters'

export const dynamic = 'force-dynamic'

async function saveSupportResponse(formData: FormData) {
  'use server'
  await requireCurrentAdmin()
  if (!isSupportDeskEnabled()) redirect('/admin/support')
  const getText = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' ? value : undefined
  }
  const view = parseAdminSupportFilters({
    status: getText('returnStatus'),
    page: getText('returnPage'),
    q: getText('returnQuery'),
  })
  let errorCode: string | null = null
  try {
    await updateAdminSupportTicket({
      id: getText('id'), updatedAt: getText('updatedAt'),
      status: getText('status'), response: getText('response'),
    })
  } catch (error) {
    if (error instanceof SupportTicketError) {
      errorCode = error.code === 'STALE_TICKET' ? 'stale' : 'invalid'
    } else {
      console.error('[support][admin-update][error]', { type: error instanceof Error ? error.name : 'unknown' })
      errorCode = 'save'
    }
  }
  if (errorCode) redirect(adminSupportHref(view.status, view.q, view.page, { error: errorCode }))
  revalidatePath('/admin/support')
  revalidatePath('/dashboard/support')
  redirect(adminSupportHref(view.status, view.q, view.page, { updated: true }))
}

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
  const filters = parseAdminSupportFilters(params)
  const { status, q } = filters
  const where = adminSupportWhere(status, q)
  const total = await prisma.supportTicket.count({ where })
  const totalPages = Math.ceil(total / ADMIN_SUPPORT_PAGE_SIZE)
  const page = totalPages ? Math.min(filters.page, totalPages) : 1
  const tickets = total ? await prisma.supportTicket.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * ADMIN_SUPPORT_PAGE_SIZE,
    take: ADMIN_SUPPORT_PAGE_SIZE,
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
  const filterHref = (nextStatus: AdminSupportStatus, nextPage = 1) => adminSupportHref(nextStatus, q, nextPage)

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

      <form action="/admin/support" method="get" role="search" aria-label="Search support requests" className="rounded-lg border bg-white p-4 space-y-2">
        <label htmlFor="support-search" className="block text-sm font-medium">Find a request</label>
        <div className="flex flex-wrap items-center gap-2">
          <input id="support-search" name="q" type="search" maxLength={ADMIN_SUPPORT_MAX_QUERY} defaultValue={q}
            placeholder="Subject, member name or email"
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-violet-600" />
          <input type="hidden" name="status" value={status} />
          <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Find requests</button>
          {q ? <Link href={adminSupportHref(status, '')} className="rounded-md border px-4 py-2 text-sm hover:bg-slate-50">Clear search</Link> : null}
        </div>
        <p className="text-xs text-muted-foreground">Search up to 80 characters; only staff can see member details.</p>
      </form>

      <nav aria-label="Filter support requests" className="flex flex-wrap gap-2">
        {([
          { value: 'OPEN', label: 'Received' },
          { value: 'IN_PROGRESS', label: 'In review' },
          { value: 'RESOLVED', label: 'Resolved' },
          { value: 'ALL', label: 'All requests' },
        ] as const).map(item => (
          <Link
            key={item.value} href={filterHref(item.value)}
            aria-current={status === item.value ? 'page' : undefined}
            className={`rounded-lg border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 ${status === item.value ? 'bg-slate-950 text-white' : 'bg-white hover:bg-slate-50'}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <p role="status" className="text-sm text-muted-foreground">{total} {total === 1 ? 'request' : 'requests'} {q ? 'matching your search' : 'in this view'}</p>

      {tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          <p>No support requests {q ? 'match your search.' : 'in this view.'}</p>
          {q && <Link href={adminSupportHref(status, '')} className="mt-3 inline-flex underline">Clear search</Link>}
        </div>
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
                <input type="hidden" name="returnStatus" value={status} />
                <input type="hidden" name="returnQuery" value={q} />
                <input type="hidden" name="returnPage" value={page} />
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
          {page > 1 ? <Link href={filterHref(status, page - 1)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Previous requests</Link> : <span />}
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          {page < totalPages ? <Link href={filterHref(status, page + 1)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Next requests</Link> : <span />}
        </nav>
      ) : null}
    </div>
  )
}
