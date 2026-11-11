import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { prisma } from '@/lib/prisma'
import {
  ADMIN_BENEFIT_AUDIT_MAX_PAGE, ADMIN_BENEFIT_AUDIT_PAGE_SIZE,
  benefitAuditHref, parseBenefitAudit, parseBenefitAuditPage,
} from '@/lib/admin/benefit-audit'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Member benefit audit | Ganges Healers', robots: { index: false, follow: false } }
const ist = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
})
const choice = (vip: boolean) => vip ? 'Yes' : 'No'

/** A private review of documented manual benefit changes, never a write surface. */
export default async function AdminBenefitAuditPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ page?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  await requireCurrentAdmin()

  const { id } = await params
  if (!id || id.length > 200) notFound()
  const member = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true, vip: true,
      freeSessionCredits: true, closedAt: true,
    },
  })
  if (!member) notFound()

  const requestedPage = parseBenefitAuditPage((await searchParams)?.page)
  const where = { entityType: 'user', entityId: member.id, action: 'user_benefits_updated' }
  const count = await prisma.activityLog.count({ where })
  const lastPage = Math.max(1, Math.ceil(count / ADMIN_BENEFIT_AUDIT_PAGE_SIZE))
  const page = Math.min(requestedPage, lastPage, ADMIN_BENEFIT_AUDIT_MAX_PAGE)
  const logs = count ? await prisma.activityLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * ADMIN_BENEFIT_AUDIT_PAGE_SIZE,
    take: ADMIN_BENEFIT_AUDIT_PAGE_SIZE,
    select: {
      id: true, createdAt: true, metadata: true,
      user: { select: { name: true, email: true } },
    },
  }) : []

  return (
    <main className="container mx-auto max-w-5xl space-y-7 px-4 py-8">
      <header className="space-y-2">
        <Link href="/admin" className="text-sm font-semibold text-primary hover:underline">Back to member directory</Link>
        <h1 className="text-3xl font-bold">Manual benefit change history</h1>
        <p className="text-sm text-muted-foreground">
          Administrator-only audit trail of manual VIP and credit edits. This page cannot change a benefit or subscription.
        </p>
      </header>
      <section aria-labelledby="benefit-member-title" className="space-y-3 rounded-xl border bg-card p-5">
        <h2 id="benefit-member-title" className="text-xl font-semibold">{member.name || member.email}</h2>
        <p className="break-all text-sm text-muted-foreground">{member.email}</p>
        <p className="break-all font-mono text-xs text-muted-foreground">Account ID: {member.id}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="font-medium">Account role</dt><dd>{member.role}</dd></div>
          <div><dt className="font-medium">Current manual VIP</dt><dd>{choice(member.vip)}</dd></div>
          <div><dt className="font-medium">Current free credits</dt><dd>{member.freeSessionCredits}</dd></div>
        </dl>
        {member.closedAt && <p className="text-sm font-semibold text-muted-foreground">Account closed; historical audit remains available to authorized staff.</p>}
      </section>
      <section aria-labelledby="benefit-audit-title" className="space-y-4">
        <div className="space-y-1">
          <h2 id="benefit-audit-title" className="text-xl font-semibold">Recorded manual changes</h2>
          <p role="status" className="text-sm text-muted-foreground">{count} audited {count === 1 ? 'change' : 'changes'} · Page {page} of {lastPage}</p>
        </div>
        {logs.length === 0 ? (
          <div className="rounded-xl border border-dashed p-7 text-center">
            <p className="text-sm text-muted-foreground">No manual benefit edits are recorded for this account.</p>
          </div>
        ) : (
          <ol className="space-y-3">
            {logs.map(row => {
              const audit = parseBenefitAudit(row.metadata)
              return (
                <li key={row.id} className="space-y-3 rounded-xl border bg-card p-5">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-semibold">{ist.format(row.createdAt)} IST</span>
                    <span className="text-muted-foreground">Changed by {row.user?.name || row.user?.email || 'Former administrator'}</span>
                  </div>
                  {audit ? (
                    <>
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div><dt className="font-medium">Manual VIP</dt><dd>{choice(audit.before.vip)} → {choice(audit.after.vip)}</dd></div>
                        <div><dt className="font-medium">Free session credits</dt><dd>{audit.before.freeSessionCredits} → {audit.after.freeSessionCredits}</dd></div>
                      </dl>
                      <p className="break-words text-sm"><span className="font-medium">Reason:</span> {audit.reason}</p>
                    </>
                  ) : <p className="text-sm text-muted-foreground">Legacy audit details unavailable; event timestamp and staff identity are retained.</p>}
                </li>
              )
            })}
          </ol>
        )}
      </section>
      {count > ADMIN_BENEFIT_AUDIT_PAGE_SIZE && (
        <nav aria-label="Benefit change history pages" className="flex items-center justify-between gap-3">
          {page > 1 ? <Link href={benefitAuditHref(member.id, page - 1)}
            className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Previous changes</Link> : <span />}
          <span className="text-sm text-muted-foreground">Page {page} of {lastPage}</span>
          {page < lastPage && page < ADMIN_BENEFIT_AUDIT_MAX_PAGE ? <Link href={benefitAuditHref(member.id, page + 1)}
            className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Next changes</Link> : <span />}
        </nav>
      )}
      <p className="text-xs text-muted-foreground">
        These records cover audited manual edits only. Subscription history, earned credits and credit redemptions are managed separately.
      </p>
    </main>
  )
}
