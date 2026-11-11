import { prisma } from '@/lib/prisma'
import { canonicalOf } from '@/config/site'
import sitemap from '@/app/sitemap'
import { getSitemapItems } from '@/lib/seo/sitemap'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    service: { findMany: jest.fn() },
    program: { findMany: jest.fn() },
    healer: { findMany: jest.fn() },
    course: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
    blogPost: { findMany: jest.fn() },
    audioTrack: { findMany: jest.fn() },
  },
}))

const catalogs = [
  prisma.service.findMany, prisma.program.findMany, prisma.healer.findMany,
  prisma.course.findMany, prisma.product.findMany,
  prisma.blogPost.findMany, prisma.audioTrack.findMany,
] as jest.Mock[]

beforeEach(() => {
  jest.clearAllMocks()
  for (const read of catalogs) read.mockResolvedValue([])
})

test('sitemap includes only reachable roots and no missing /about page', async () => {
  const urls = (await sitemap()).map(entry => entry.url)
  expect(urls).toContain(canonicalOf('/') + '/')
  expect(urls).toContain(canonicalOf('/services'))
  expect(urls).toContain(canonicalOf('/programs'))
  expect(urls).not.toContain(canonicalOf('/about'))
})

test('public service, program and healer listings apply the publication rules', async () => {
  const updatedAt = new Date('2026-11-11T00:00:00Z')
  ;(prisma.service.findMany as jest.Mock).mockResolvedValue([{ slug: 'active-service', updatedAt }])
  ;(prisma.program.findMany as jest.Mock).mockResolvedValue([{ slug: 'active-program', updatedAt }])
  ;(prisma.healer.findMany as jest.Mock).mockResolvedValue([{ id: 'verified-healer', updatedAt }])
  const items = await getSitemapItems()
  const urls = items.map(item => item.url)

  expect(prisma.service.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }))
  expect(prisma.program.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }))
  expect(prisma.healer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, isVerified: true } }))
  expect(urls).toContain(canonicalOf('/services/active-service'))
  expect(urls).toContain(canonicalOf('/programs/active-program'))
  expect(urls).toContain(canonicalOf('/healers/verified-healer'))
})

test('existing course, store, blog and audio publication scopes are preserved', async () => {
  await getSitemapItems()
  expect(prisma.course.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }))
  expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }))
  expect(prisma.blogPost.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { published: true } }))
  expect(prisma.audioTrack.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isPublished: true } }))
})
