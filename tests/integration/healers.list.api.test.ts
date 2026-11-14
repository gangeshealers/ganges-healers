/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'

const db = {
  healers: [] as any[],
  services: [] as any[],
}

const prismaMock = {
  review: { groupBy: async () => [] },
  service: {
    findUnique: async ({ where }: any) => db.services.find((s) => s.slug === where.slug) || null,
    findMany: async () => db.services.slice(),
  },
  healer: {
    findMany: async (args: any) => {
      let items = db.healers.filter((h) => h.isActive && h.isVerified)
      // where filters
      if (args.where?.OR?.length) {
        const or = args.where.OR
        const qTitle = or.find((c: any) => c.user?.name?.contains)?.user?.name?.contains
        const qBio = or.find((c: any) => c.bio?.contains)?.bio?.contains
        const qSpec = or.find((c: any) => c.specializations?.has)?.specializations?.has
        const Q = (qTitle || qBio || qSpec || '').toLowerCase()
        if (Q) {
          items = items.filter((h) => (h.user.name || '').toLowerCase().includes(Q) || (h.bio || '').toLowerCase().includes(Q) || (h.specializations || []).some((s: string) => s.toLowerCase().includes(Q)))
        }
      }
      if (args.where?.AND?.length) {
        const has = args.where.AND.find((c: any) => c.specializations?.has)?.specializations?.has
        if (has) items = items.filter((h) => (h.specializations || []).includes(has))
      }
      // Mirror Prisma's order-by-then-cursor behavior for both stable sorts.
      items = items.sort((a: any, b: any) =>
        args.orderBy?.[0]?.experienceYears === 'desc'
          ? b.experienceYears - a.experienceYears || a.id.localeCompare(b.id)
          : a.id.localeCompare(b.id))
      if (args.cursor?.id) {
        const idx = items.findIndex((h) => h.id === args.cursor.id)
        if (idx >= 0) items = items.slice(idx + 1)
      }
      items = items.slice(0, args.take)
      return items.map((h) => ({ id: h.id, bio: h.bio, experienceYears: h.experienceYears, rating: h.rating, specializations: h.specializations, user: h.user }))
    },
  },
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

let List: any

function get(url: string) { return new NextRequest(new Request(url)) }

describe('Healers list API', () => {
  beforeAll(async () => {
    List = await import('@/app/api/healers/route')
    // seed services
    db.services.push({ slug: 'yoga-healing', name: 'Yoga Therapy' })
    db.services.push({ slug: 'reiki-healing', name: 'Reiki Healing' })
    // seed healers
    db.healers.push({ id: 'h1', user: { name: 'Alice' }, bio: 'Yoga expert', experienceYears: 5, rating: 4.8, specializations: ['Yoga'], isActive: true, isVerified: true })
    db.healers.push({ id: 'h2', user: { name: 'Bob' }, bio: 'Reiki specialist', experienceYears: 3, rating: 4.5, specializations: ['Reiki'], isActive: true, isVerified: true })
    db.healers.push({ id: 'h3', user: { name: 'Cara' }, bio: 'Mixed modalities', experienceYears: 10, rating: 4.9, specializations: ['Yoga','Reiki'], isActive: true, isVerified: true })
    db.healers.push({ id: 'h4', user: { name: 'Pending review' }, bio: 'Reiki', experienceYears: 4, rating: 5, specializations: ['Reiki'], isActive: true, isVerified: false })
  })

  test('GET /api/healers → returns items with shape and nextCursor', async () => {
    const res = await List.GET(get('http://localhost/api/healers'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.items)).toBe(true)
    const it = json.items[0]
    expect(typeof it.id).toBe('string')
    expect(typeof it.slug).toBe('string')
    expect(typeof it.name).toBe('string')
    expect('title' in it).toBe(true)
    expect(typeof it.yearsExperience).toBe('number')
    expect(typeof it.ratingAvg).toBe('number')
    expect(it.ratingAvg).toBe(0)
    expect(it.reviewCount).toBe(0)
    expect('avatarUrl' in it).toBe(true)
    expect('shortBio' in it).toBe(true)
    expect(Array.isArray(it.services)).toBe(true)
    expect('nextCursor' in json).toBe(true)
    expect(json.items).toHaveLength(3)
    expect(json.nextCursor).toBeNull()
  })

  test('active but unverified healers are not publicly discoverable', async () => {
    const response = await List.GET(get('http://localhost/api/healers'))
    const result = await response.json()
    expect(result.items).toHaveLength(3)
    expect(result.items.every((item: { id: string }) => item.id !== 'h4')).toBe(true)
  })

  test('q search filters by name/bio/spec', async () => {
    const res = await List.GET(get('http://localhost/api/healers?q=Yoga'))
    const json = await res.json()
    expect(json.items.every((h: any) => /yoga/i.test(h.name + ' ' + h.shortBio) || h.services.some((s: any) => /yoga/i.test(s.title)))).toBe(true)
  })

  test('serviceSlug filter maps to specialization', async () => {
    const res = await List.GET(get('http://localhost/api/healers?serviceSlug=yoga-healing'))
    const json = await res.json()
    expect(json.items.every((h: any) => h.services.some((s: any) => s.slug === 'yoga-healing'))).toBe(true)
  })

  test('limit + cursor pagination', async () => {
    const res1 = await List.GET(get('http://localhost/api/healers?limit=2'))
    const j1 = await res1.json()
    expect(j1.items.length).toBe(2)
    expect(j1.nextCursor).toBeTruthy()
    const res2 = await List.GET(get(`http://localhost/api/healers?limit=2&cursor=${j1.nextCursor}`))
    const j2 = await res2.json()
    expect(j2.items.length).toBeGreaterThanOrEqual(1)
    expect(j2.nextCursor).toBeNull()
  })

  test('an exact final page does not advertise an empty continuation', async () => {
    const response = await List.GET(get('http://localhost/api/healers?limit=3'))
    expect(await response.json()).toMatchObject({ items: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }], nextCursor: null })
  })

  test('most-experienced order is stable across cursor pages and never lists unverified healers', async () => {
    const first = await List.GET(get('http://localhost/api/healers?sort=experience&limit=2'))
    expect(first.status).toBe(200)
    const page1 = await first.json()
    expect(page1.items.map((item: { id: string }) => item.id)).toEqual(['h3', 'h1'])
    expect(page1.nextCursor).toBe('h1')
    const second = await List.GET(get(`http://localhost/api/healers?sort=experience&limit=2&cursor=${page1.nextCursor}`))
    const page2 = await second.json()
    expect(page2.items.map((item: { id: string }) => item.id)).toEqual(['h2'])
    expect(page2.nextCursor).toBeNull()
  })

  test('unknown sort input preserves the original stable default ordering', async () => {
    const response = await List.GET(get('http://localhost/api/healers?sort=anything'))
    expect((await response.json()).items.map((item: { id: string }) => item.id)).toEqual(['h1', 'h2', 'h3'])
  })

  test('a missing service filter cannot broaden into unrelated practitioners', async () => {
    const response = await List.GET(get('http://localhost/api/healers?serviceSlug=missing'))
    expect(await response.json()).toEqual({ items: [], nextCursor: null })
  })
})
