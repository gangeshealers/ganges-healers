import { redirect } from "next/navigation"
import Link from 'next/link'
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { UserBenefitsForm } from '@/components/admin/user-benefits-form'
import { AdminCatalogOverview } from '@/components/admin/catalog-overview'
import { publicArticleCountWhere } from '@/lib/admin/publication-readiness'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { updateUserBenefits, UserBenefitsError, userBenefitsSelect, userBenefitsVersion, type UserBenefitsInput, type UserBenefitsResult } from '@/lib/admin/user-benefits'
import { ADMIN_MEMBERS_PAGE_SIZE, ADMIN_MEMBERS_MAX_PAGE, ADMIN_MEMBERS_ROLES, adminMembersHref, adminMembersWhere, parseAdminMembersQuery } from '@/lib/admin/member-directory'

// Server action for VIP + credits update
async function setVip(input: UserBenefitsInput): Promise<UserBenefitsResult> {
  "use server"
  try {
    const actor = await requireCurrentAdmin()
    const result = await updateUserBenefits(actor.id, input)
    revalidatePath('/admin')
    return { success: true, ...result }
  } catch (error) {
    if (error instanceof UserBenefitsError) return { success: false, error: error.message, code: error.code }
    if (error instanceof Error && 'status' in error && error.status === 403) return { success: false, error: 'Administrator access is required.', code: 'FORBIDDEN' }
    console.error('[admin][user-benefits][error]', { type: error instanceof Error ? error.name : 'unknown' })
    return { success: false, error: 'Benefits could not be saved. Reload and review the current values before trying again.', code: 'SAVE_FAILED' }
  }
}

type MembersSearch = { role?: string | string[]; q?: string | string[]; page?: string | string[] }

export default async function AdminPage({ searchParams }: { searchParams?: Promise<MembersSearch> } = {}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")
  if (session.user.role !== "ADMIN") redirect("/")
  await requireCurrentAdmin()

  const { role, query, page: requestedPage } = parseAdminMembersQuery((await searchParams) ?? {})
  const where = adminMembersWhere(query, role)
  const accountCount = await prisma.user.count({ where })
  const lastPage = Math.max(1, Math.ceil(accountCount / ADMIN_MEMBERS_PAGE_SIZE))
  const page = Math.min(requestedPage, lastPage, ADMIN_MEMBERS_MAX_PAGE)

  const [users, activeServices, verifiedHealers, activePrograms, activeCourses, publishedAudio, activeProducts, publishedArticles] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * ADMIN_MEMBERS_PAGE_SIZE,
      take: ADMIN_MEMBERS_PAGE_SIZE,
      select: { ...userBenefitsSelect, createdAt: true },
    }),
    prisma.service.count({ where: { isActive: true } }),
    prisma.healer.count({ where: { isActive: true, isVerified: true } }),
    prisma.program.count({ where: { isActive: true } }),
    prisma.course.count({ where: { isActive: true } }),
    prisma.audioTrack.count({ where: { isPublished: true } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.blogPost.count({ where: publicArticleCountWhere }),
  ])
  type AdminUser = typeof users[number]

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Admin · VIP Management</h1>
      <p className="text-sm text-muted-foreground">Manage free-session balances and manual VIP access for accounts without subscription history. Subscription access follows its saved status and expiry. Add a reason when saving a change.</p>
      <nav className="flex flex-wrap gap-3" aria-label="Admin workspaces">
        <Button asChild variant="outline"><Link href="/admin/services">Manage Services</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/healers">Manage Healers</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/courses">Manage Courses</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/audio">Manage Audio</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/products">Manage Products</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/orders">Manage Orders</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/bookings">Booking Operations</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/booking-emails">Booking Emails</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/support">Support Requests</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/programs">Manage Programs</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/program-enrollments">Program Enrollments</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/community">Community Moderation</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/blog">Manage Articles</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/payments">Payments</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/launch">Launch Readiness</Link></Button>
      </nav>

      <AdminCatalogOverview items={[
        { label: 'Services', count: activeServices, href: '/admin/services', meaning: 'Active healing services' },
        { label: 'Healers', count: verifiedHealers, href: '/admin/healers', meaning: 'Active, verified practitioners' },
        { label: 'Programs', count: activePrograms, href: '/admin/programs', meaning: 'Active guided programs' },
        { label: 'Courses', count: activeCourses, href: '/admin/courses', meaning: 'Active self-paced courses' },
        { label: 'Audio', count: publishedAudio, href: '/admin/audio', meaning: 'Published audio tracks' },
        { label: 'Products', count: activeProducts, href: '/admin/products', meaning: 'Active store products' },
        { label: 'Articles', count: publishedArticles, href: '/admin/blog', meaning: 'Published blog articles' },
      ]} />

      <section aria-labelledby="admin-members-title" className="space-y-4">
        <div className="space-y-1">
          <h2 id="admin-members-title" className="text-xl font-semibold">Find and manage member benefits</h2>
          <p className="text-sm text-muted-foreground">Search all accounts, including older members. Changes remain version-checked and audited.</p>
        </div>
        <form action="/admin" method="get" role="search" aria-label="Search account benefits"
          className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
          {role !== 'all' && <input type="hidden" name="role" value={role} />}
          <label htmlFor="member-benefits-search" className="sr-only">Search by email, name or exact account ID</label>
          <input id="member-benefits-search" name="q" type="search" maxLength={100} defaultValue={query}
            placeholder="Search email, name or account ID"
            className="min-w-56 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Find accounts</button>
          {(query || role !== 'all') && <Link href="/admin" className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Clear filters</Link>}
        </form>
        <nav aria-label="Account role filter" className="flex flex-wrap gap-2">
          {ADMIN_MEMBERS_ROLES.map(value => (
            <Link key={value} href={adminMembersHref(value, query)} aria-current={role === value ? 'page' : undefined}
              className={'rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted ' + (role === value ? 'border-primary bg-muted' : '')}>
              {value === 'all' ? 'All accounts' : value === 'user' ? 'Members' : value === 'healer' ? 'Practitioners' : 'Administrators'}
            </Link>
          ))}
        </nav>
        <p role="status" className="text-sm text-muted-foreground">
          {accountCount} {accountCount === 1 ? 'account' : 'accounts'} match this search · Page {page} of {lastPage}
        </p>
      </section>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 divide-y">
            {users.length === 0 && <div className="space-y-3 p-6 text-center">
              <p className="text-sm text-muted-foreground">No accounts match the selected search or role.</p>
              <Link href="/admin" className="text-sm font-semibold text-primary hover:underline">Show all accounts</Link>
            </div>}
            {users.map((u: AdminUser) => (
              <div key={u.id} className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1">
                  <div className="font-medium">{u.name ?? u.email}</div>
                  <div className="text-sm text-muted-foreground">
                    {u.email} · Role: {u.role} · Created: {new Date(u.createdAt).toLocaleString()}
                  </div>
                  <Link href={'/admin/members/' + encodeURIComponent(u.id) + '/benefits'}
                    className="mt-1 inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline">
                    View benefit audit
                  </Link>
                </div>

                <UserBenefitsForm actorId={session.user.id} reloadHref={adminMembersHref(role, query, page)} label={u.name ? `${u.name} (${u.email})` : u.email} user={{ id: u.id, vip: u.vip, freeSessionCredits: u.freeSessionCredits, version: userBenefitsVersion(u) }} onSave={setVip} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {accountCount > ADMIN_MEMBERS_PAGE_SIZE && (
        <nav aria-label="Member directory pages" className="flex items-center justify-between gap-3">
          {page > 1 ? <Link href={adminMembersHref(role, query, page - 1)}
            className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Previous accounts</Link> : <span />}
          <span className="text-sm text-muted-foreground">Page {page} of {lastPage}</span>
          {page < lastPage && page < ADMIN_MEMBERS_MAX_PAGE ? <Link href={adminMembersHref(role, query, page + 1)}
            className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Next accounts</Link> : <span />}
        </nav>
      )}
      <p className="text-sm text-muted-foreground">
        Manual VIP and session-credit edits are version-checked and require a reason. Subscription benefits are managed separately.
      </p>
    </div>
  )
}
