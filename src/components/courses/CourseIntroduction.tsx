import Image from 'next/image'

type CourseIntroductionProps = {
  course: { title: string; description: string; imageUrl: string | null }
  enrollmentCount: number
  lessonCount: number
  archived?: boolean
}

export default function CourseIntroduction({
  course,
  enrollmentCount,
  lessonCount,
  archived,
}: CourseIntroductionProps) {
  return (
    <>
      {course.imageUrl && (
        <Image
          src={course.imageUrl}
          alt={course.title}
          width={800}
          height={224}
          className="mb-6 h-56 w-full rounded-lg object-cover"
        />
      )}
      <h1 className="mb-2 break-words text-3xl font-bold">{course.title}</h1>
      {archived && (
        <p className="mb-4 text-sm text-muted-foreground">
          This course is archived. Your existing lesson access is preserved.
        </p>
      )}
      <p className="mb-4 text-muted-foreground">
        {enrollmentCount} student{enrollmentCount !== 1 ? 's' : ''} enrolled
        {' · '}
        {lessonCount} lesson{lessonCount !== 1 ? 's' : ''}
      </p>
      <p className="mb-6 whitespace-pre-line break-words">{course.description}</p>
    </>
  )
}
