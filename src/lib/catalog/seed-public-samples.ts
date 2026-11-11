import type { PrismaClient } from '@prisma/client'
import { sampleCourses, samplePrograms, sampleServices } from './sample-data'

/**
 * Insert only missing public sample catalog rows. Never change existing price,
 * availability, publication, purchases, members, or progress records.
 * Course lessons are demonstration placeholders, not completed paid content.
 */
export async function seedPublicSampleCatalog(prisma: PrismaClient) {
  await prisma.$transaction(async tx => {
    for (const service of sampleServices) {
      await tx.service.upsert({ where: { slug: service.slug }, update: {}, create: service })
    }
    for (const program of samplePrograms) {
      await tx.program.upsert({ where: { slug: program.slug }, update: {}, create: program })
    }
    for (const { lessons, ...details } of sampleCourses) {
      const course = await tx.course.upsert({
        where: { slug: details.slug }, update: {}, create: details,
      })
      for (let order = 1; order <= lessons.length; order++) {
        const existing = await tx.courseLesson.findFirst({
          where: { courseId: course.id, order }, select: { id: true },
        })
        if (!existing) {
          await tx.courseLesson.create({
            data: { courseId: course.id, order, title: lessons[order - 1], content: `Sample lesson outline: ${lessons[order - 1]}. Content and media must be approved before launch.` },
          })
        }
      }
    }
  }, { maxWait: 10000, timeout: 30000 })
  return {
    sampleServices: sampleServices.length,
    samplePrograms: samplePrograms.length,
    sampleCourses: sampleCourses.length,
    sampleLessons: sampleCourses.reduce((n, course) => n + course.lessons.length, 0),
  }
}
