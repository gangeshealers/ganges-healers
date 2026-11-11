import type { PrismaClient } from '@prisma/client'
import { sampleServices, samplePrograms, sampleCourses } from '@/lib/catalog/sample-data'
import { validateCatalogSeedTarget } from '@/lib/catalog/seed-guard'
import { seedPublicSampleCatalog } from '@/lib/catalog/seed-public-samples'

const host = 'ep-disposable-branch-pooler.neon.tech'
const url = `postgresql://owner:secret@${host}/neondb?sslmode=require`

describe('safe public sample catalog', () => {
  test('the shared source has the expected ten services, six programs, and eight courses', () => {
    expect(sampleServices).toHaveLength(10)
    expect(samplePrograms).toHaveLength(6)
    expect(sampleCourses).toHaveLength(8)
    expect(sampleCourses.reduce((sum, course) => sum + course.lessons.length, 0)).toBe(41)
    expect(new Set(sampleServices.map(service => service.slug)).size).toBe(10)
    expect(new Set(samplePrograms.map(program => program.slug)).size).toBe(6)
    expect(new Set(sampleCourses.map(course => course.slug)).size).toBe(8)
    expect(sampleServices.find(service => service.slug === 'reiki-healing')).toMatchObject({
      price: 7000, duration: 60, mode: 'BOTH',
    })
    expect(sampleServices.find(service => service.slug === 'sound-bath')?.mode).toBe('OFFLINE')
    expect(sampleServices.find(service => service.slug === 'meditation-coaching')?.mode).toBe('ONLINE')
  })

  test('dry-run inspection permits a valid PostgreSQL target without confirming a write', () => {
    expect(validateCatalogSeedTarget(url, { apply: false, nodeEnv: 'development' })).toEqual({
      hostname: host, databaseName: 'neondb',
    })
  })

  test('no write is allowed without exact remote hostname confirmation', () => {
    for (const confirmedHost of [undefined, 'other.neon.tech', '']) {
      expect(() => validateCatalogSeedTarget(url, { apply: true, confirmedHost, nodeEnv: 'development' }))
        .toThrow('confirm-host')
    }
    expect(validateCatalogSeedTarget(url, { apply: true, confirmedHost: host, nodeEnv: 'development' }).hostname).toBe(host)
  })

  test('production and deployed runtimes refuse even a correctly confirmed host', () => {
    expect(() => validateCatalogSeedTarget(url, { apply: true, confirmedHost: host, nodeEnv: 'production' })).toThrow('disabled')
    expect(() => validateCatalogSeedTarget(url, { apply: true, confirmedHost: host, nodeEnv: 'development', vercel: '1' })).toThrow('disabled')
  })

  test('rejects invalid database targets and URL routing overrides', () => {
    for (const input of [undefined, 'garbage', 'https://example.com/neondb', 'postgresql://localhost', url + '&host=production.example', url + '&dbname=another']) {
      expect(() => validateCatalogSeedTarget(input, { apply: false, nodeEnv: 'development' })).toThrow()
    }
  })

  test('only creates missing rows and placeholder lesson outlines, never user/payment models', async () => {
    const serviceUpsert = jest.fn().mockResolvedValue({ id: 'service-id' })
    const programUpsert = jest.fn().mockResolvedValue({ id: 'program-id' })
    const courseUpsert = jest.fn().mockImplementation(async ({ where }: { where: { slug: string } }) => ({ id: where.slug }))
    const lessonFind = jest.fn().mockResolvedValue(null)
    const lessonCreate = jest.fn().mockResolvedValue({ id: 'lesson-id' })
    const tx = {
      service: { upsert: serviceUpsert },
      program: { upsert: programUpsert },
      course: { upsert: courseUpsert },
      courseLesson: { findFirst: lessonFind, create: lessonCreate },
    }
    const transaction = jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx))
    const prisma = { $transaction: transaction } as unknown as PrismaClient
    const result = await seedPublicSampleCatalog(prisma)
    expect(result).toEqual({ sampleServices: 10, samplePrograms: 6, sampleCourses: 8, sampleLessons: 41 })
    expect(serviceUpsert).toHaveBeenCalledTimes(10)
    expect(programUpsert).toHaveBeenCalledTimes(6)
    expect(courseUpsert).toHaveBeenCalledTimes(8)
    expect(lessonFind).toHaveBeenCalledTimes(41)
    expect(lessonCreate).toHaveBeenCalledTimes(41)
    expect(serviceUpsert.mock.calls.every(([arg]) => Object.keys(arg.update).length === 0)).toBe(true)
    expect(courseUpsert.mock.calls.every(([arg]) => Object.keys(arg.update).length === 0)).toBe(true)
    expect(lessonCreate.mock.calls[0][0].data.content).toMatch(/Sample lesson outline/)
    expect(transaction).toHaveBeenCalledTimes(1)
  })

  test('existing lesson slots are not overwritten or duplicated', async () => {
    const tx = {
      service: { upsert: jest.fn().mockResolvedValue({ id: 's' }) },
      program: { upsert: jest.fn().mockResolvedValue({ id: 'p' }) },
      course: { upsert: jest.fn().mockResolvedValue({ id: 'c' }) },
      courseLesson: { findFirst: jest.fn().mockResolvedValue({ id: 'existing' }), create: jest.fn() },
    }
    const prisma = { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } as unknown as PrismaClient
    await seedPublicSampleCatalog(prisma)
    expect(tx.courseLesson.create).not.toHaveBeenCalled()
  })
})
