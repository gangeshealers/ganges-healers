import { prisma } from '@/lib/prisma'
import { getPublishedPolicy, POLICY_PAGES } from '@/lib/legal/publication'

jest.mock('@/lib/prisma', () => ({
  prisma: { blogPost: { findUnique: jest.fn() } },
}))

const findUnique = prisma.blogPost.findUnique as jest.Mock

beforeEach(() => { jest.clearAllMocks() })

test('privacy page reads only the exact administrator-published reserved slug', async () => {
  findUnique.mockResolvedValueOnce({ slug: 'privacy-policy', title: 'Privacy Policy', content: 'Approved policy text', updatedAt: new Date('2026-11-11') })
  expect((await getPublishedPolicy('privacy'))?.content).toBe('Approved policy text')
  expect(findUnique).toHaveBeenCalledWith({
    where: { slug: POLICY_PAGES.privacy.slug, published: true },
    select: { slug: true, title: true, content: true, updatedAt: true },
  })
})

test('an unpublished document is never presented as an approved legal policy', async () => {
  findUnique.mockResolvedValueOnce(null)
  expect(await getPublishedPolicy('terms')).toBeNull()
  expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'terms-of-service', published: true } }))
})

test('an empty published article cannot masquerade as final terms', async () => {
  findUnique.mockResolvedValueOnce({ slug: 'terms-of-service', title: 'Terms', content: ' \n ', updatedAt: new Date('2026-11-11') })
  expect(await getPublishedPolicy('terms')).toBeNull()
})
