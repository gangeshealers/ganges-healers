import { render, screen } from '@testing-library/react'
import CoursesPreview from '@/components/home/CoursesPreview'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: { course: { findMany: jest.fn() } },
}))

beforeEach(() => jest.clearAllMocks())

test('homepage renders only active course previews with saved lesson count and price', async () => {
  jest.mocked(prisma.course.findMany).mockResolvedValueOnce([{
    id: 'course-1', slug: 'introduction-to-reiki', title: 'Introduction to Reiki',
    description: 'Learn the fundamentals of Reiki', pricePaise: 299900,
    _count: { lessons: 5 },
  }] as never)
  render(await CoursesPreview())
  expect(screen.getByRole('heading', { name: 'Courses for Your Wellness Journey' })).toBeVisible()
  expect(screen.getByRole('link', { name: /Introduction to Reiki/ })).toHaveAttribute('href', '/courses/introduction-to-reiki')
  expect(screen.getByText('5 lessons')).toBeVisible()
  expect(screen.getByText('₹2,999')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Explore All Courses' })).toHaveAttribute('href', '/courses')
  expect(prisma.course.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { isActive: true }, take: 4,
    select: expect.objectContaining({ _count: { select: { lessons: true } } }),
  }))
})

test('homepage does not advertise unapproved or absent course listings', async () => {
  jest.mocked(prisma.course.findMany).mockResolvedValueOnce([])
  const content = await CoursesPreview()
  expect(content).toBeNull()
})
