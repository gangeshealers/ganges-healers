/** Resolve saved lesson-order progress consistently in the library and dashboard. */
export function courseProgress<T extends { id: string; order: number }>(progress: number, lessons: readonly T[]) {
  const totalLessons = lessons.length
  const completedLessons = lessons.filter(lesson => progress > lesson.order).length
  const firstUnfinished = lessons.find(lesson => progress <= lesson.order)
  return {
    totalLessons,
    completedLessons,
    percentage: totalLessons ? Math.min(100, Math.round(completedLessons / totalLessons * 100)) : 0,
    nextLesson: firstUnfinished ?? lessons[0],
    hasUnfinished: !!firstUnfinished,
  }
}
