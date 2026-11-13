import React from 'react'
import Link from 'next/link'
import { ArrowUpRight, Bell, BookOpen, CalendarDays, CreditCard, Heart, Package, Receipt, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import BookingActions from '@/components/dashboard/BookingActions'
import { courseProgress } from '@/lib/courses/progress'
import type { MemberProgramPreview } from '@/lib/programs/enrollments'

const appointmentFormatter = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
const statusLabels: Record<string, string> = { PENDING: 'Awaiting confirmation', SCHEDULED: 'Scheduled', CONFIRMED: 'Confirmed', RESCHEDULED: 'Rescheduled' }
const accountLinks = [
  { href: '/dashboard/bookings', title: 'My bookings', description: 'Manage your appointments', icon: CalendarDays },
  { href: '/courses/enrolled', title: 'My courses', description: 'Your learning library', icon: BookOpen },
  { href: '/dashboard/programs', title: 'My programs', description: 'Sessions and progress', icon: Sparkles },
  { href: '/dashboard/orders', title: 'My orders', description: 'Purchases and delivery', icon: Package },
  { href: '/dashboard/membership', title: 'Membership', description: 'Your plan and benefits', icon: Heart },
  { href: '/dashboard/billing', title: 'Billing & invoices', description: 'Payments and receipts', icon: Receipt },
]

interface BookingRecord {
  id: string
  status: string
  scheduledAt: Date
  service: { name: string }
  healer: { user: { name: string | null } | null }
  payment: { id: string; paymentId?: string | null; gatewayPaymentId?: string | null; status: string | null; statusEnum: string | null; gateway: string | null } | null
}
interface CommunityPostRecord {
  id: string
  title: string
  user: { name: string | null }
  _count: { comments: number; likes: number }
}
interface CourseEnrollmentRecord {
  id: string
  status: string
  progress: number
  course: {
    slug: string
    title: string
    isActive: boolean
    lessons: { id: string; order: number; title: string }[]
  }
}
interface DashboardProps {
  name?: string | null
  bookings: BookingRecord[]
  recentPosts?: CommunityPostRecord[]
  courseEnrollments?: CourseEnrollmentRecord[]
  programs?: MemberProgramPreview[]
  unreadCount?: number
}

/** Server-rendered account home; all changes remain in the existing owned workspaces. */
export default function DashboardClient({ name, bookings, recentPosts = [], courseEnrollments = [], programs = [], unreadCount = 0 }: DashboardProps) {
  return (
    <div className="container mx-auto max-w-7xl space-y-8 px-4 py-8 md:space-y-10">
      <header className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/40 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl space-y-2">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{name?.trim() ? `Welcome back, ${name.trim()}` : 'Welcome to your dashboard'}</p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Your healing space</h1>
            <p className="text-sm leading-relaxed text-muted-foreground md:text-base">Pick up where you left off, keep track of your sessions, and find everything you need for your next step.</p>
          </div>
          <Button asChild><Link href="/services">Book a session <ArrowUpRight aria-hidden="true" className="ml-1 h-4 w-4" /></Link></Button>
        </div>
        <Link href="/dashboard/notifications" className="mt-5 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Bell aria-hidden="true" className="h-4 w-4" />
          {unreadCount > 0 ? `${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}` : 'Notifications · you’re all caught up'}
          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </header>

      <nav aria-label="Your account workspaces" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {accountLinks.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="min-w-0 space-y-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p></div>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="dashboard-appointments" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="dashboard-appointments" className="text-xl font-semibold">Upcoming appointments</h2><p className="mt-1 text-sm text-muted-foreground">Your next sessions, shown in India time (IST).</p></div>
          <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href="/dashboard/bookings">View all bookings</Link></Button><Button asChild variant="ghost" size="sm"><Link href="/dashboard/bookings/history">Booking history</Link></Button></div>
        </div>
        {bookings.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed p-6">
            <p className="text-sm text-muted-foreground">No upcoming appointments. Your previous sessions are available in booking history.</p>
            <Button asChild variant="outline" size="sm"><Link href="/services">Browse services</Link></Button>
          </div>
        ) : <div className="grid gap-3">{bookings.map(b => {
          const hasSuccessPayment = b.payment && (b.payment.status === 'success' || b.payment.statusEnum === 'SUCCESS')
          return <Card key={b.id}><CardContent className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{b.service.name}</h3><span className="rounded-full bg-muted px-2.5 py-1 text-xs">{statusLabels[b.status] ?? b.status}</span></div>
              <p className="text-sm text-muted-foreground">{appointmentFormatter.format(new Date(b.scheduledAt))} IST · with {b.healer.user?.name ?? 'Healer'}</p>
              <p className="text-xs text-muted-foreground">Payment: {b.payment?.status ?? 'No payment recorded'}{b.payment?.gateway ? ` · ${b.payment.gateway}` : ''}</p>
              {hasSuccessPayment && b.payment && <StaticInvoiceLink payment={b.payment} />}
            </div>
            {(b.status === 'PENDING' || b.status === 'CONFIRMED') ? <BookingActions bookingId={b.id} /> : <Button asChild variant="outline" size="sm"><Link href="/dashboard/bookings">Manage booking</Link></Button>}
          </CardContent></Card>
        })}</div>}
      </section>

      <section aria-labelledby="dashboard-courses" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="dashboard-courses" className="text-xl font-semibold">Continue learning</h2><p className="mt-1 text-sm text-muted-foreground">Return directly to a lesson in your recent courses.</p></div>
          <Button asChild variant="outline" size="sm"><Link href="/courses/enrolled">View all courses</Link></Button>
        </div>
        {courseEnrollments.length === 0 ? <div className="space-y-3 rounded-xl border border-dashed p-6"><p className="text-sm text-muted-foreground">Your learning library is ready for your first course.</p><Button asChild variant="outline" size="sm"><Link href="/courses">Browse courses</Link></Button></div> : (
          <div className="grid gap-4 md:grid-cols-3">{courseEnrollments.map(enrollment => {
            const course = enrollment.course
            const progress = courseProgress(enrollment.progress, course.lessons)
            const base = '/courses/' + encodeURIComponent(course.slug)
            const href = progress.nextLesson ? `${base}/lesson/${encodeURIComponent(progress.nextLesson.id)}` : base
            const completed = enrollment.status === 'completed' && progress.totalLessons > 0 && progress.completedLessons === progress.totalLessons
            const action = !progress.nextLesson ? 'View course' : progress.hasUnfinished ? 'Continue learning' : 'Review lessons'
            return <article key={enrollment.id} className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><BookOpen aria-hidden="true" className="h-5 w-5 text-primary" /><span>{completed ? 'Completed' : 'In progress'}</span></div>
              <div><h3 className="font-semibold">{course.title}</h3>{!course.isActive && <p className="mt-1 text-xs text-muted-foreground">Archived · access retained</p>}</div>
              <div className="mt-auto space-y-2">
                {progress.totalLessons > 0 ? <><p className="text-sm text-muted-foreground">{progress.completedLessons}/{progress.totalLessons} lessons · {progress.percentage}%</p><progress aria-label={`Course progress for ${course.title}`} value={progress.completedLessons} max={progress.totalLessons} className="h-2 w-full accent-emerald-600" /></> : <p className="text-sm text-muted-foreground">Lessons are not available yet.</p>}
                {progress.nextLesson && <p className="truncate text-xs text-muted-foreground">{progress.hasUnfinished ? 'Up next' : 'Review'}: {progress.nextLesson.title}</p>}
                <Button asChild className="mt-2 w-full"><Link href={href} aria-label={`${action}: ${course.title}`}>{action}<ArrowUpRight aria-hidden="true" className="ml-1 h-4 w-4" /></Link></Button>
              </div>
            </article>
          })}</div>
        )}
      </section>

      <section aria-labelledby="dashboard-programs" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="dashboard-programs" className="text-xl font-semibold">My Programs</h2><p className="mt-1 text-sm text-muted-foreground">Your recent active and paused programs.</p></div><Button asChild variant="outline" size="sm"><Link href="/dashboard/programs">View My Programs</Link></Button></div>
        {programs.length === 0 ? <div className="space-y-3 rounded-xl border border-dashed p-6"><p className="text-sm text-muted-foreground">No active or paused programs. Past enrollments remain in My Programs.</p><Button asChild variant="outline" size="sm"><Link href="/programs">Explore programs</Link></Button></div> : <div className="grid gap-4 md:grid-cols-3">{programs.map(program => (
          <article key={program.id} className="space-y-3 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{program.title}</h3><span className="rounded-full bg-muted px-2.5 py-1 text-xs">{program.status === 'paused' ? 'Paused' : 'Active'}</span></div>
            <p className="text-xs text-muted-foreground">{program.practitioner ? `With ${program.practitioner}` : 'Practitioner assignment pending'}</p>
            {program.needsReview || !program.totalSessions ? <p className="text-sm text-muted-foreground">Your purchased schedule needs staff review.</p> : <div><p className="text-sm text-muted-foreground">{program.completedSessions} of {program.totalSessions} sessions completed</p><progress aria-label={`${program.title} progress`} value={program.completedSessions} max={program.totalSessions} className="mt-2 h-2 w-full accent-emerald-600" /></div>}
            <p className="border-t pt-3 text-sm">{program.status === 'paused' ? 'Your program is paused. Contact support for help resuming.' : program.nextSessionAt ? `Next confirmed session: ${appointmentFormatter.format(new Date(program.nextSessionAt))} IST` : 'Your next appointment is awaiting confirmation.'}</p>
          </article>
        ))}</div>}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <section aria-labelledby="dashboard-community" className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="dashboard-community" className="text-xl font-semibold">Community</h2><div className="flex gap-2"><Button asChild variant="outline" size="sm"><Link href="/community/create">Create Post</Link></Button><Button asChild variant="ghost" size="sm"><Link href="/community">View All →</Link></Button></div></div>
          {recentPosts.length === 0 ? <p className="rounded-xl border p-6 text-sm text-muted-foreground">No community posts yet. Join the conversation!</p> : <div className="space-y-3">{recentPosts.map(post => <Link href={`/community/post/${encodeURIComponent(post.id)}`} key={post.id} className="block rounded-xl border bg-card p-4 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><h3 className="font-medium">{post.title}</h3><p className="mt-1 text-xs text-muted-foreground">by {post.user.name || 'Anonymous'} · {post._count.likes} likes · {post._count.comments} comments</p></Link>)}</div>}
        </section>
        <aside aria-label="Account help" className="space-y-4 rounded-xl bg-muted/50 p-5">
          <CreditCard aria-hidden="true" className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Receipts and support</h2>
          <p className="text-sm text-muted-foreground">Find receipts for your purchases, or get private help with a booking, payment, or your account.</p>
          <div className="flex flex-col items-start gap-3 text-sm font-medium"><Link href="/dashboard/billing" className="text-primary hover:underline">View billing history →</Link><Link href="/dashboard/support" className="text-primary hover:underline">Open support center →</Link><Link href="/dashboard/settings" className="text-primary hover:underline">Account settings →</Link></div>
        </aside>
      </div>
    </div>
  )
}

function StaticInvoiceLink({ payment }: { payment: { id: string; paymentId?: string | null; gatewayPaymentId?: string | null } }) {
  const invId = payment.paymentId || payment.gatewayPaymentId || payment.id
  return <div className="pt-1 text-xs"><a href={`/api/invoices/${encodeURIComponent(invId)}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">Invoice</a></div>
}
