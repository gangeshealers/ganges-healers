'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { CourseDetail } from '@/lib/courses/admin-schema'
import CourseIntroduction from './CourseIntroduction'
import LessonBody from './LessonBody'

export default function CoursePreview({
  course,
  hasUnsavedChanges,
}: {
  course: CourseDetail
  hasUnsavedChanges: boolean
}) {
  const [lessonId, setLessonId] = useState<string | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const index = course.lessons.findIndex((lesson) => lesson.id === lessonId)
  const lesson = course.lessons[index]

  function show(id: string | null) {
    setLessonId(id)
    body.current?.scrollTo?.(0, 0)
    body.current?.focus()
  }

  return (
    <Dialog onOpenChange={() => setLessonId(null)}>
      <DialogTrigger asChild>
        <Button variant="outline">Preview saved course</Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4 pr-12 text-left">
          <DialogTitle>Learner preview</DialogTitle>
          <DialogDescription>
            {hasUnsavedChanges
              ? 'Showing the last saved version. Your unsaved edits are still in the editor.'
              : 'Review the saved course and lessons before returning to the editor.'}
          </DialogDescription>
        </DialogHeader>
        <div
          ref={body}
          tabIndex={-1}
          aria-label={lesson ? lesson.title : 'Course overview'}
          role="region"
          className="min-h-0 overflow-y-auto px-5 py-6 sm:px-8"
        >
          {lesson ? (
            <>
              <button
                type="button"
                onClick={() => show(null)}
                className="mb-4 text-sm text-primary underline"
              >
                Back to course overview
              </button>
              <p className="mb-2 text-sm text-muted-foreground">
                Lesson {index + 1} of {course.lessons.length}
              </p>
              <LessonBody lesson={lesson} preview />
              <nav aria-label="Preview lesson navigation" className="flex flex-wrap gap-3">
                {index > 0 && (
                  <Button variant="outline" onClick={() => show(course.lessons[index - 1].id)}>
                    Previous lesson
                  </Button>
                )}
                {index < course.lessons.length - 1 && (
                  <Button onClick={() => show(course.lessons[index + 1].id)}>Next lesson</Button>
                )}
              </nav>
            </>
          ) : (
            <>
              <CourseIntroduction
                course={course}
                enrollmentCount={course.enrollmentCount}
                lessonCount={course.lessons.length}
              />
              <p className="mb-6 font-semibold">
                {course.pricePaise === 0
                  ? 'Free course'
                  : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
                      course.pricePaise / 100,
                    )}
              </p>
              <h2 className="mb-3 text-xl font-semibold">Curriculum</h2>
              {course.lessons.length ? (
                <ol className="space-y-2">
                  {course.lessons.map((item, idx) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded border p-3 text-left hover:bg-muted"
                        onClick={() => show(item.id)}
                      >
                        <span className="w-6 shrink-0 text-center text-sm text-muted-foreground">
                          {idx + 1}
                        </span>
                        <span className="min-w-0 break-words">{item.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add a lesson in the editor to preview the curriculum.
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end border-t px-5 py-3">
          <DialogClose asChild>
            <Button variant="outline">Return to editor</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
