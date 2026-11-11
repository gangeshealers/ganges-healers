/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'

const row = {
  id: 'p1',
  slug: 'p-yoga',
  title: 'Yoga Basics',
  description: 'Intro yoga long description',
  pricePaise: 99900,
  totalSessions: 8,
  isActive: true,
}

const prismaMock = {
  program: {
    findUnique: jest.fn(async ({ where }: any) => {
      // Mirror Prisma's extended unique where: inactive records are not public.
      if (where?.slug === row.slug && where?.isActive === true && row.isActive) return { ...row }
      return null
    }),
  }
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

let Detail: any

function get(url: string) { return new NextRequest(new Request(url)) }

describe('Programs detail API', () => {
  beforeAll(async () => {
    Detail = await import('@/app/api/programs/[slug]/route')
  })

  test('GET /api/programs/[slug] → 200 with ProgramDetail', async () => {
    const res = await Detail.GET(get('http://localhost/api/programs/p-yoga'), { params: Promise.resolve({ slug: 'p-yoga' }) })
    expect(res.status).toBe(200)
    expect(prismaMock.program.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: row.slug, isActive: true } }))
    const json = await res.json()
    expect(json.slug).toBe('p-yoga')
    expect(json.title).toMatch(/yoga/i)
    expect(typeof json.shortDescription).toBe('string')
    expect(typeof json.longDescription).toBe('string')
    expect(typeof json.sessionsCount).toBe('number')
    expect(typeof json.pricePaise).toBe('number')
  })

  test('GET /api/programs/[slug] → 404 after a program is archived', async () => {
    row.isActive = false
    try {
      const res = await Detail.GET(get('http://localhost/api/programs/p-yoga'), { params: Promise.resolve({ slug: 'p-yoga' }) })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'Not found' })
    } finally {
      row.isActive = true
    }
  })

  test('GET /api/programs/[slug] → 404 when not found', async () => {
    const res = await Detail.GET(get('http://localhost/api/programs/nope'), { params: Promise.resolve({ slug: 'nope' }) })
    expect(res.status).toBe(404)
  })
})
