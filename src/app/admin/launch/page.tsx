import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { inspectLaunchIntegrations } from '@/lib/admin/launch-readiness'
import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, AlertCircle, ArrowUpRight, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminLaunchReadinessPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  await requireCurrentAdmin()

  const [
    services, healers, programs, courses, audio, products, articles,
  ] = await Promise.all([
    prisma.service.count({ where: { isActive: true } }),
    prisma.healer.count({ where: { isActive: true, isVerified: true } }),
    prisma.program.count({ where: { isActive: true } }),
    prisma.course.count({ where: { isActive: true } }),
    prisma.audioTrack.count({ where: { isPublished: true } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.blogPost.count({ where: { published: true } }),
  ])

  const catalogs = [
    { label: 'Services', count: services, href: '/admin/services' },
    { label: 'Verified healers', count: healers, href: '/admin/healers' },
    { label: 'Programs', count: programs, href: '/admin/programs' },
    { label: 'Courses', count: courses, href: '/admin/courses' },
    { label: 'Published audio', count: audio, href: '/admin/audio' },
    { label: 'Products', count: products, href: '/admin/products' },
    { label: 'Published articles', count: articles, href: '/admin/blog' },
  ]
  // Inspect values on the server and pass only presence booleans into React.
  const integrations = inspectLaunchIntegrations(process.env)

  const manualChecks = [
    'Approve final service, course, program, audio and store content and confirm licensed media.',
    'Complete a real, intentionally authorized payment and a signed webhook callback; reconcile duplicate and refund cases.',
    'Verify email/SMS delivery, bounces, OAuth account linking and actual uploaded media and invoices.',
    'Verify the configured booking-email recovery cron actually runs in production, with provider acceptance and the outbox queue reconciled.',
    'Exercise customer, healer and admin journeys in the deployed environment with role-specific accounts.',
    'Review monitoring, domain/DNS, rate limits, recovery plans and the controlled database migration/cutover.',
  ]

  return (
    <main className="container mx-auto space-y-8 px-4 py-8">
      <div className="space-y-3">
        <Link href="/admin" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Back to Admin workspace
        </Link>
        <div className="flex items-center gap-3">
          <ShieldCheck aria-hidden="true" className="size-8 text-primary" />
          <h1 className="text-3xl font-bold">Launch readiness</h1>
        </div>
        <p className="max-w-3xl text-muted-foreground">
          A read-only inventory of this deployment&apos;s catalog and configuration.
          An active listing or configured variable is <strong>not</strong> proof of approved content,
          payment delivery, safe production credentials, or a completed acceptance test.
        </p>
      </div>

      <section aria-labelledby="launch-catalog-title" className="space-y-4">
        <div>
          <h2 id="launch-catalog-title" className="text-xl font-semibold">Catalog inventory</h2>
          <p className="text-sm text-muted-foreground">Live database counts, not content approvals.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {catalogs.map(item => (
            <Card key={item.href}>
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-3xl font-bold tabular-nums">{item.count}</span>
                </div>
                {item.count === 0
                  ? <p className="flex items-center gap-2 text-xs text-amber-700"><AlertCircle aria-hidden="true" className="size-4" /> No visible entries</p>
                  : <p className="text-xs text-muted-foreground">Review every entry before launch.</p>}
                <Link href={item.href} className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  Review {item.label} <ArrowUpRight aria-hidden="true" className="size-4" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="launch-integrations-title" className="space-y-4">
        <div>
          <h2 id="launch-integrations-title" className="text-xl font-semibold">Integration configuration</h2>
          <p className="text-sm text-muted-foreground">
            Presence-only checks. No values or credential fragments are displayed, and no provider requests are made.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {integrations.map(item => (
            <Card key={item.label}>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold">{item.label}</h3>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${item.configured
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-amber-100 text-amber-900'}`}>
                    {item.configured
                      ? <CheckCircle2 aria-hidden="true" className="size-3.5" />
                      : <AlertCircle aria-hidden="true" className="size-3.5" />}
                    {item.configured ? 'Variables present' : 'Needs configuration review'}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.guidance}</p>
                <p className="text-xs font-medium text-muted-foreground">
                  {item.essential ? 'Required for core live workflows' : 'Optional, or required when this feature is enabled'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="launch-acceptance-title" className="space-y-4">
        <div>
          <h2 id="launch-acceptance-title" className="text-xl font-semibold">Manual launch acceptance</h2>
          <p className="text-sm text-muted-foreground">These checks cannot be marked complete by counting rows or finding environment variables.</p>
        </div>
        <Card>
          <CardContent className="p-5">
            <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed">
              {manualChecks.map(check => <li key={check}>{check}</li>)}
            </ul>
            <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">
              Production promotion remains a separate, authorized release decision.
              See the deployment and operations runbooks before enabling real provider side effects.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
