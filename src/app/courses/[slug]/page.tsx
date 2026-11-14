import { readCourseForViewer } from '@/lib/courses/access'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import CourseIntroduction from '@/components/courses/CourseIntroduction'
import CourseEnrollButton from '@/components/courses/CourseEnrollButton'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const course = await readCourseForViewer(slug)
  if (!course) return { title: 'Course Not Found' }
  return {
    title: `${course.title} | Courses | Ganges Healers`,
    description: course.description.slice(0, 160),
  }
}

export default async function CourseDetailPage({ params }: Props) {
  const { slug } = await params

  const course = await readCourseForViewer(slug)

  if (!course) notFound()

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <CourseIntroduction course={course} enrollmentCount={course._count.enrollments}
        lessonCount={course.lessons.length} archived={!course.isActive} />

      <div className="mb-8">
        <CourseEnrollButton course={course} />
      </div>

      <h2 className="text-xl font-semibold mb-3">Curriculum</h2>
      <ol className="space-y-2">
        {course.lessons.map((lesson, idx) => (
          <li key={lesson.id} className="flex items-center gap-3 p-3 rounded border">
            <span className="text-sm font-medium text-muted-foreground w-6 text-center">
              {idx + 1}
            </span>
            <span>{lesson.title}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
