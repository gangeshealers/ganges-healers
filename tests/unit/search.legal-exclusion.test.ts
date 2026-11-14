import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/search/route'
import { POLICY_PAGES } from '@/lib/legal/routes'

jest.mock('@/lib/prisma', () => ({
  prisma: { $queryRawUnsafe: jest.fn() },
}))

const query = prisma.$queryRawUnsafe as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  query.mockResolvedValue([])
})

test('full-text search excludes policy documents from ordinary blog suggestions', async () => {
  const response = await GET(new Request('http://localhost/api/search?q=privacy'))
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.blog).toEqual([])
  expect(query).toHaveBeenCalledTimes(7)
  const [sql, term, privacy, terms] = query.mock.calls[0]
  expect(sql).toContain('WHERE published = true AND slug NOT IN ($2, $3)')
  expect(term).toBe('privacy:*')
  expect(privacy).toBe(POLICY_PAGES.privacy.slug)
  expect(terms).toBe(POLICY_PAGES.terms.slug)
})
