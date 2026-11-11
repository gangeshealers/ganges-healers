import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/** Fresh reads keep publication changes consistent across application instances. */
export function getPublishedBlogSummaries(take?: number) {
  return prisma.blogPost.findMany({
    where: { published: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(take ? { take } : {}),
    select: { id: true, slug: true, title: true, excerpt: true, imageUrl: true, createdAt: true },
  })
}

/** Keep the existing ID-or-slug public lookup, always restricted to published content. */
export function getPublishedBlogPost(slug: string) {
  return prisma.blogPost.findFirst({ where: { OR: [{ id: slug }, { slug }], published: true } })
}

/** Search published articles before paging; this never exposes draft content. */
export async function getPublishedBlogPage({ q, page, pageSize = 9 }: { q: string; page: number; pageSize?: number }) {
  const where: Prisma.BlogPostWhereInput = {
    published: true,
    ...(q ? {
      OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { excerpt: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
  }
  const total = await prisma.blogPost.count({ where })
  const totalPages = Math.ceil(total / pageSize)
  const currentPage = totalPages ? Math.min(page, totalPages) : 1
  const posts = total ? await prisma.blogPost.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: pageSize,
    skip: (currentPage - 1) * pageSize,
    select: { id: true, slug: true, title: true, excerpt: true, imageUrl: true, createdAt: true },
  }) : []
  return { posts, total, page: currentPage, totalPages }
}
