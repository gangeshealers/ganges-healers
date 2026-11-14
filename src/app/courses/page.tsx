import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import EmptyState from '@/components/empty/EmptyState'
import { canonicalOf } from '@/config/site'
import { courseCatalogHref, parseCourseCatalogParams } from '@/lib/courses/catalog-list'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Courses | Ganges Healers',
  description: 'Learn holistic healing practices through self-paced lessons and guided courses.',
  alternates: { canonical: canonicalOf('/courses') },
}

const PAGE_SIZE = 12

type CourseSearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function CoursesPage({ searchParams }: { searchParams?: CourseSearchParams }) {
  const { query, page: requestedPage } = parseCourseCatalogParams((await searchParams) ?? {})
  const where: Prisma.CourseWhereInput = {
    isActive: true,
    ...(query ? {
      OR: [
        { title: { contains: query, mode: 'insensitive' as const } },
        { description: { contains: query, mode: 'insensitive' as const } },
      ],
    } : {}),
  }

  const total = await prisma.course.count({ where })
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1
  const courses = total ? await prisma.course.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { _count: { select: { lessons: true } } },
  }) : []

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-sky-700 to-indigo-700 text-white">
        <div className="container mx-auto px-4 py-14 md:py-16">
          <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-widest uppercase text-sky-100">
            <BookOpen className="size-4" aria-hidden="true" /> Learn at your pace
          </span>
          <h1 className="mt-3 text-4xl font-bold md:text-5xl">Healing Courses</h1>
          <p className="mt-4 max-w-2xl text-lg text-sky-100">
            Explore holistic practices through thoughtfully structured courses and self-paced lessons.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <nav aria-label="Breadcrumb" className="mb-7 text-sm text-gray-600">
          <Link className="hover:text-indigo-700 hover:underline" href="/">Home</Link>
          <span aria-hidden="true" className="mx-2">/</span>
          <span aria-current="page" className="font-medium text-gray-900">Courses</span>
        </nav>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <form method="GET" action="/courses" role="search" className="flex w-full max-w-xl gap-2">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-500" />
              <input
                type="search"
                name="q"
                aria-label="Search courses"
                defaultValue={query}
                placeholder="Search healing courses..."
                maxLength={120}
                className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-3 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <button type="submit" className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
              Search
            </button>
          </form>
          <p className="shrink-0 text-sm text-gray-600" role="status">
            {total} {total === 1 ? 'course' : 'courses'} {query ? 'matching your search' : 'available'}
          </p>
        </div>

        {!total ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <EmptyState
              title={query ? 'No matching courses' : 'No courses available'}
              subtitle={query ? 'Try another search or clear the search to browse all available courses.' : 'Check back soon — new courses are being added.'}
              action={query ? (
                <Link href="/courses" className="inline-flex rounded-lg border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
                  Clear search
                </Link>
              ) : null}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.slug}`}
                  data-test="course-card"
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                >
                  <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-sky-600 to-indigo-700">
                    {course.imageUrl ? (
                      <Image src={course.imageUrl} alt={course.title} fill className="object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <BookOpen aria-hidden="true" className="size-14 text-white/80" />
                    )}
                    <span className="absolute bottom-3 left-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-800">
                      Self-paced learning
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-xl font-semibold text-gray-900 group-hover:text-indigo-700">{course.title}</h2>
                    <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-gray-600">{course.description}</p>
                    <div className="mt-5 flex items-center gap-2 text-sm text-gray-500">
                      <BookOpen className="size-4" aria-hidden="true" />
                      <span>{course._count.lessons} {course._count.lessons === 1 ? 'lesson' : 'lessons'}</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                      <span className="text-xl font-bold text-indigo-700">₹{(course.pricePaise / 100).toLocaleString('en-IN')}</span>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700">
                        View course <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 ? (
              <nav aria-label="Course pages" className="mt-10 flex items-center justify-center gap-5">
                {page > 1 ? (
                  <Link href={courseCatalogHref(query, page - 1)} className="inline-flex items-center gap-1 rounded-lg border bg-white px-4 py-2 font-medium hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
                    <ChevronLeft aria-hidden="true" className="size-4" /> Previous
                  </Link>
                ) : <span className="text-sm text-gray-400">First page</span>}
                <span className="text-sm text-gray-700">Page {page} of {totalPages}</span>
                {page < totalPages ? (
                  <Link href={courseCatalogHref(query, page + 1)} className="inline-flex items-center gap-1 rounded-lg border bg-white px-4 py-2 font-medium hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
                    Next <ChevronRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : <span className="text-sm text-gray-400">Last page</span>}
              </nav>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
