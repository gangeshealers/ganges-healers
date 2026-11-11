import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'My Courses | Ganges Healers',
  robots: { index: false, follow: false },
}

const PAGE_SIZE = 12
const MAX_PAGE = 1000
const STATUS_FILTERS = ['all', 'active', 'completed'] as const
type LibraryStatus = (typeof STATUS_FILTERS)[number]
type LibrarySearch = { status?: string | string[]; page?: string | string[]; q?: string | string[] }

function libraryHref(status: LibraryStatus, query: string, page = 1) {
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)
  if (query) params.set('q', query)
  if (page > 1) params.set('page', String(page))
  return '/courses/enrolled' + (params.size ? '?' + params.toString() : '')
}

/** A member's full paid/free learning library, not the limited dashboard preview. */
export default async function EnrolledCoursesPage({ searchParams }: { searchParams?: Promise<LibrarySearch> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=%2Fcourses%2Fenrolled')

  const params = (await searchParams) ?? {}
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : ''
  const status: LibraryStatus = typeof params.status === 'string' && STATUS_FILTERS.some(value => value === params.status)
    ? params.status as LibraryStatus : 'all'
  const rawPage = typeof params.page === 'string' && /^[1-9][0-9]{0,3}$/.test(params.page) ? Number(params.page) : 1
  const requestedPage = Math.min(rawPage, MAX_PAGE)
  const where: Prisma.CourseEnrollmentWhereInput = {
    userId: session.user.id,
    status: { in: status === 'all' ? ['active', 'completed'] : [status] },
    ...(query ? { course: { is: { title: { contains: query, mode: 'insensitive' } } } } : {}),
  }
  const total = await prisma.courseEnrollment.count({ where })
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(requestedPage, lastPage, MAX_PAGE)
  const enrollments = total ? await prisma.courseEnrollment.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true, progress: true, status: true,
      course: {
        select: {
          slug: true, title: true, description: true, imageUrl: true, isActive: true,
          lessons: { orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { id: true, order: true } },
        },
      },
    },
  }) : []

  return (
    <main className="container mx-auto max-w-6xl space-y-7 px-4 py-8">
      <header className="space-y-3">
        <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">Back to dashboard</Link>
        <h1 className="text-3xl font-bold">My Courses</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Continue lessons, review completed courses, and return to training you already own.
          Archived courses remain available to enrolled members.
        </p>
      </header>
      <form action="/courses/enrolled" method="get" role="search" aria-label="Search my courses" className="flex flex-wrap gap-3 rounded-xl border bg-card p-4">
        {status !== 'all' && <input type="hidden" name="status" value={status} />}
        <label htmlFor="course-library-search" className="sr-only">Search enrolled courses</label>
        <input id="course-library-search" type="search" name="q" maxLength={100} defaultValue={query}
          placeholder="Search your courses" className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="submit" className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Search</button>
        {(status !== 'all' || query) && <Link href="/courses/enrolled" className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Clear filters</Link>}
      </form>

      <nav aria-label="Filter my courses" className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(value => (
          <Link key={value} href={libraryHref(value, query)} aria-current={status === value ? 'page' : undefined}
            className={'rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted ' + (status === value ? 'border-primary bg-muted' : '')}>
            {value === 'all' ? 'All courses' : value === 'active' ? 'In progress' : 'Completed'}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">{total} {total === 1 ? 'course' : 'courses'} in this view</p>
        <Link href="/courses" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">Browse more courses</Link>
      </div>

      {enrollments.length === 0 ? (
        <section className="space-y-3 rounded-xl border border-dashed p-8 text-center">
          <h2 className="text-lg font-semibold">{query || status !== 'all' ? 'No courses match these filters' : 'Your learning library is empty'}</h2>
          <p className="text-sm text-muted-foreground">{query || status !== 'all' ? 'Try a different search or show all your enrolled courses.' : 'Enroll in a course to begin learning at your own pace.'}</p>
          <Link href={query || status !== 'all' ? '/courses/enrolled' : '/courses'} className="inline-flex rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">
            {query || status !== 'all' ? 'Show all my courses' : 'Browse courses'}
          </Link>
        </section>
      ) : (
        <section aria-label="Enrolled courses" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {enrollments.map(enrollment => {
            const course = enrollment.course
            const totalLessons = course.lessons.length
            // Stored progress is one greater than a completed lesson's order;
            // lesson orders need not be zero-based or consecutive.
            const completedLessons = course.lessons.filter(lesson => enrollment.progress > lesson.order).length
            const percentage = totalLessons ? Math.min(100, Math.round(completedLessons / totalLessons * 100)) : 0
            const firstUnfinished = course.lessons.find(lesson => enrollment.progress <= lesson.order)
            const nextLesson = firstUnfinished ?? course.lessons[0]
            const base = '/courses/' + encodeURIComponent(course.slug)
            const href = nextLesson ? base + '/lesson/' + encodeURIComponent(nextLesson.id) : base
            const isCompleted = enrollment.status === 'completed' && totalLessons > 0 && completedLessons === totalLessons
            return (
              <article key={enrollment.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
                {course.imageUrl && <Image src={course.imageUrl} alt="" width={480} height={160} className="h-36 w-full object-cover" />}
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{isCompleted ? '✓ Completed' : 'In progress'}</span>
                    {!course.isActive && <span className="rounded-full border px-2 py-0.5">Archived · access retained</span>}
                  </div>
                  <h2 className="text-lg font-semibold">{course.title}</h2>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{course.description}</p>
                  <div className="mt-auto space-y-2">
                    {totalLessons ? (
                      <>
                        <p className="text-sm text-muted-foreground">{completedLessons}/{totalLessons} lessons · {percentage}%</p>
                        <div role="progressbar" aria-label={'Course progress for ' + course.title}
                          aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}
                          className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary" style={{ width: percentage + '%' }} />
                        </div>
                      </>
                    ) : <p className="text-sm text-muted-foreground">Lessons are not available yet.</p>}
                    <Link href={href} className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                      {totalLessons === 0 ? 'View course' : isCompleted ? 'Review lessons' : firstUnfinished ? 'Continue learning' : 'Review lessons'}
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}

      {total > PAGE_SIZE && (
        <nav aria-label="My course pages" className="flex items-center justify-between gap-3">
          {page > 1 ? <Link href={libraryHref(status, query, page - 1)} className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Previous page</Link> : <span />}
          <span className="text-sm text-muted-foreground">Page {page} of {lastPage}</span>
          {page < lastPage && page < MAX_PAGE ? <Link href={libraryHref(status, query, page + 1)} className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">Next page</Link> : <span />}
        </nav>
      )}
    </main>
  )
}
