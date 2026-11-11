import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import SupportTicketForm from '@/components/support/SupportTicketForm'
import { isSupportDeskEnabled } from '@/lib/support/availability'

export const dynamic = 'force-dynamic'

const statusLabels = {
  OPEN: 'Received',
  IN_PROGRESS: 'In review',
  RESOLVED: 'Resolved',
} as const

export default async function MemberSupportPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')

  if (!isSupportDeskEnabled()) {
    return (
      <div className="container mx-auto max-w-3xl space-y-5 px-4 py-12">
        <h1 className="text-3xl font-semibold">Support center</h1>
        <p role="status" className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
          Support requests are not available on this deployment yet. Your bookings, orders and account remain accessible.
        </p>
        <Link href="/dashboard" className="inline-flex rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50">Back to dashboard</Link>
      </div>
    )
  }

  const tickets = await prisma.supportTicket.findMany({
    where: { userId: session.user.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
    select: {
      id: true, subject: true, message: true, status: true,
      response: true, respondedAt: true, createdAt: true,
    },
  })

  return (
    <div className="container mx-auto max-w-4xl space-y-8 px-4 py-10">
      <div className="space-y-2">
        <Link href="/dashboard" className="text-sm font-medium text-violet-700 underline-offset-4 hover:underline">Back to dashboard</Link>
        <h1 className="text-3xl font-bold">Support center</h1>
        <p className="text-muted-foreground">
          Contact the Ganges Healers team about your account or purchases, and review replies securely in your account.
        </p>
      </div>
      <SupportTicketForm />
      <section aria-labelledby="support-history" className="space-y-4">
        <h2 id="support-history" className="text-xl font-semibold">Your support requests</h2>
        {tickets.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-white p-6 text-sm text-muted-foreground">
            You haven’t sent any support requests yet.
          </p>
        ) : (
          <div className="space-y-4">
            {tickets.map(ticket => (
              <article key={ticket.id} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{ticket.subject}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Submitted <time dateTime={ticket.createdAt.toISOString()}>{ticket.createdAt.toLocaleDateString('en-IN')}</time>
                    </p>
                  </div>
                  <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    {statusLabels[ticket.status]}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{ticket.message}</p>
                {ticket.response ? (
                  <div className="rounded-lg border-l-4 border-violet-600 bg-violet-50 p-4">
                    <h4 className="text-sm font-semibold">Support team response</h4>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{ticket.response}</p>
                    {ticket.respondedAt ? <p className="mt-2 text-xs text-muted-foreground">Updated {ticket.respondedAt.toLocaleDateString('en-IN')}</p> : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No response yet. Updates will appear here.</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
