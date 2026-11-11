import { prisma } from '@/lib/prisma'
import { LEGAL_DOCUMENT_SLUGS } from '@/lib/legal/publication'
import { getPublishedBlogPage, getPublishedBlogPost, getPublishedBlogSummaries } from '@/lib/blog/queries'

jest.mock('@/lib/prisma', () => ({
  prisma: { blogPost: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() } },
}))

const findMany = prisma.blogPost.findMany as jest.Mock
const count = prisma.blogPost.count as jest.Mock
const findFirst = prisma.blogPost.findFirst as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  findMany.mockResolvedValue([])
  count.mockResolvedValue(0)
  findFirst.mockResolvedValue(null)
})

test('blog discovery excludes legal documents while keeping normal published articles', async () => {
  await getPublishedBlogSummaries(5)
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { published: true, slug: { notIn: LEGAL_DOCUMENT_SLUGS } },
    take: 5,
  }))
  await getPublishedBlogPage({ q: '', page: 1 })
  expect(count).toHaveBeenCalledWith({ where: { published: true, slug: { notIn: LEGAL_DOCUMENT_SLUGS } } })
})

test('legacy ID-or-slug blog detail lookup cannot reveal legal documents under /blog', async () => {
  await getPublishedBlogPost('privacy-policy')
  expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      OR: [{ id: 'privacy-policy' }, { slug: 'privacy-policy' }],
      published: true,
      slug: { notIn: LEGAL_DOCUMENT_SLUGS },
    },
  }))
})
