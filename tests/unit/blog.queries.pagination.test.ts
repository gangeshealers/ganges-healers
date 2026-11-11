import { prisma } from '@/lib/prisma'
import { getPublishedBlogPage } from '@/lib/blog/queries'
import { LEGAL_DOCUMENT_SLUGS } from '@/lib/legal/publication'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    blogPost: { count: jest.fn(), findMany: jest.fn() },
  },
}))

beforeEach(() => jest.clearAllMocks())

test('only published and title/excerpt-matching articles are paginated', async () => {
  ;(prisma.blogPost.count as jest.Mock).mockResolvedValueOnce(25)
  ;(prisma.blogPost.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'post-10', title: 'Mindful Healing' }])
  const result = await getPublishedBlogPage({ q: 'Healing', page: 2 })
  expect(result.total).toBe(25)
  expect(result.totalPages).toBe(3)
  expect(result.page).toBe(2)
  expect(result.posts).toHaveLength(1)
  expect(prisma.blogPost.count).toHaveBeenCalledWith({
    where: {
      published: true,
      slug: { notIn: LEGAL_DOCUMENT_SLUGS },
      OR: [
        { title: { contains: 'Healing', mode: 'insensitive' } },
        { excerpt: { contains: 'Healing', mode: 'insensitive' } },
      ],
    },
  })
  expect(prisma.blogPost.findMany).toHaveBeenCalledWith(expect.objectContaining({
    take: 9,
    skip: 9,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    where: expect.objectContaining({ published: true }),
  }))
})

test('empty results never perform an unnecessary content read', async () => {
  ;(prisma.blogPost.count as jest.Mock).mockResolvedValueOnce(0)
  const result = await getPublishedBlogPage({ q: 'nothing', page: 20 })
  expect(result).toEqual({ posts: [], total: 0, page: 1, totalPages: 0 })
  expect(prisma.blogPost.findMany).not.toHaveBeenCalled()
})

test('pages past the end display the last real page', async () => {
  ;(prisma.blogPost.count as jest.Mock).mockResolvedValueOnce(10)
  ;(prisma.blogPost.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'last' }])
  const result = await getPublishedBlogPage({ q: '', page: 1000 })
  expect(result.page).toBe(2)
  expect(prisma.blogPost.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { published: true, slug: { notIn: LEGAL_DOCUMENT_SLUGS } }, skip: 9, take: 9,
  }))
})
