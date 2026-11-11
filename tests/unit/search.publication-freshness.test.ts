import { GET } from '@/app/api/search/route'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: { $queryRawUnsafe: jest.fn() },
}))

const db = jest.mocked(prisma.$queryRawUnsafe)
let published = true

beforeEach(() => {
  jest.clearAllMocks()
  published = true
  db.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM "Service"')) {
      return published ? [{ id: 'service-1', slug: 'reiki', name: 'Reiki Healing', category: 'Healing', tagline: null }] : []
    }
    if (sql.includes('FROM "Healer"')) {
      // This mock mirrors the verified-only search result.
      return published ? [{ id: 'healer-1', bio: 'Reiki', specializations: ['Reiki'], userName: 'Practitioner', userImage: null }] : []
    }
    if (sql.includes('FROM "Product"')) {
      return published ? [{ id: 'product-1', slug: 'crystals', title: 'Reiki Crystals', pricePaise: 500, imageUrl: null }] : []
    }
    if (sql.includes('FROM "Program"')) {
      return published ? [{ id: 'program-1', slug: 'reiki-course', title: 'Reiki Journey', pricePaise: 1000 }] : []
    }
    return []
  })
})

test('every active catalog group is fetched again after a listing is withdrawn', async () => {
  const request = new Request('http://localhost/api/search?q=Reiki')
  const first = await GET(request)
  expect(first.status).toBe(200)
  const initial = await first.json()
  expect(initial.services).toHaveLength(1)
  expect(initial.healers).toHaveLength(1)
  expect(initial.programs).toHaveLength(1)
  expect(initial.products).toHaveLength(1)

  published = false
  const second = await GET(request)
  expect(second.status).toBe(200)
  const withdrawn = await second.json()
  expect(withdrawn.services).toHaveLength(0)
  expect(withdrawn.healers).toHaveLength(0)
  expect(withdrawn.programs).toHaveLength(0)
  expect(withdrawn.products).toHaveLength(0)
  expect(second.headers.get('cache-control')).toBe('no-store')
  expect(db).toHaveBeenCalledTimes(14)
})

test('healer search requires current verification and active state', async () => {
  await GET(new Request('http://localhost/api/search?q=Reiki'))
  const healerCall = db.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('FROM "Healer"'))
  expect(healerCall).toBeDefined()
  expect(healerCall?.[0]).toContain('h."isActive" = true')
  expect(healerCall?.[0]).toContain('h."isVerified" = true')
})

test('search terms are bounded before any SQL is executed', async () => {
  await GET(new Request(`http://localhost/api/search?q=${'x'.repeat(1000)}`))
  expect(db).toHaveBeenCalledTimes(7)
  const args = db.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('FROM "Healer"'))
  expect(args?.[2]).toHaveLength(200)
})

test('empty terms never execute a query or return stale catalog results', async () => {
  const response = await GET(new Request('http://localhost/api/search?q=%20'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ services: [], healers: [], programs: [], courses: [], products: [], blog: [], audio: [] })
  expect(db).not.toHaveBeenCalled()
})
