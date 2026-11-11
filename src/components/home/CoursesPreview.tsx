import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowUpRight, BookOpen } from 'lucide-react'

/** Surface only active courses. The public detail route enforces enrollment access. */
export default async function CoursesPreview() {
  const courses = await prisma.course.findMany({
    where: { isActive: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 4,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      pricePaise: true,
      _count: { select: { lessons: true } },
    },
  })

  if (courses.length === 0) return null

  return (
    <section aria-labelledby="featured-courses-heading" className="py-16">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Learn and grow</p>
        <h2 id="featured-courses-heading" className="mt-3 text-3xl font-bold">
          Courses for Your Wellness Journey
        </h2>
        <p className="mt-3 text-muted-foreground">
          Explore self-paced learning with guided lessons you can revisit when you need them.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {courses.map(course => (
          <Link
            key={course.id}
            href={`/courses/${course.slug}`}
            className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-lg">
              <div className="flex h-28 items-center justify-center bg-gradient-to-br from-sky-600 to-indigo-700">
                <BookOpen aria-hidden="true" className="size-10 text-white/80" />
              </div>
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                <h3 className="text-lg font-semibold leading-snug group-hover:text-primary">{course.title}</h3>
                <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">{course.description}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BookOpen aria-hidden="true" className="size-4" />
                  {course._count.lessons} {course._count.lessons === 1 ? 'lesson' : 'lessons'}
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-lg font-semibold text-primary">₹{(course.pricePaise / 100).toLocaleString('en-IN')}</span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                    View course <ArrowUpRight aria-hidden="true" className="size-4" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Button asChild size="lg" className="focus-ring">
          <Link href="/courses">Explore All Courses</Link>
        </Button>
      </div>
    </section>
  )
}
