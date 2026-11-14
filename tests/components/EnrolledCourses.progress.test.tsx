import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import EnrolledCoursesPage from '@/app/courses/enrolled/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { courseEnrollment: { count: jest.fn(), findMany: jest.fn() } } }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => { throw new Error('redirect:' + url) }),
}))

const mockAuth = auth as jest.Mock
const count = prisma.courseEnrollment.count as jest.Mock
const findMany = prisma.courseEnrollment.findMany as jest.Mock
const lessons = [1, 3, 7, 9, 11].map(order => ({ id: 'lesson-' + order, order }))
const row = (id = 'enrollment', progress = 4, status = 'active', isActive = true) => ({
  id, progress, status,
  course: { slug: 'test-course', title: 'Test Course', description: 'Guided learning', imageUrl: null, isActive, lessons },
})

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'learner-owner' } })
  count.mockResolvedValue(1)
  findMany.mockResolvedValue([row()])
})

test('requires a signed-in owner before any enrollment lookup', async () => {
  mockAuth.mockResolvedValueOnce(null)
  await expect(EnrolledCoursesPage({ searchParams: Promise.resolve({}) }))
    .rejects.toThrow('redirect:/auth/signin?callbackUrl=%2Fcourses%2Fenrolled')
  expect(count).not.toHaveBeenCalled()
  expect(findMany).not.toHaveBeenCalled()
})

test('calculates completed lessons from actual nonconsecutive orders and resumes at the next lesson', async () => {
  render(await EnrolledCoursesPage({ searchParams: Promise.resolve({}) }))
  expect(count).toHaveBeenCalledWith({ where: { userId: 'learner-owner', status: { in: ['active', 'completed'] } } })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: 'learner-owner', status: { in: ['active', 'completed'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: 0, take: 12,
  }))
  expect(screen.getByText('2/5 lessons · 40%')).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Course progress for Test Course' })).toHaveAttribute('aria-valuenow', '40')
  expect(screen.getByRole('link', { name: 'Continue learning' })).toHaveAttribute('href', '/courses/test-course/lesson/lesson-7')
})

test('never labels legacy premature completion as fully completed', async () => {
  findMany.mockResolvedValueOnce([row('legacy', 10, 'completed')])
  render(await EnrolledCoursesPage({ searchParams: Promise.resolve({ status: 'completed' }) }))
  expect(screen.getByText('4/5 lessons · 80%')).toBeInTheDocument()
  expect(screen.queryByText('✓ Completed')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continue learning' })).toHaveAttribute('href', '/courses/test-course/lesson/lesson-11')
})

test('a fully completed course can be reviewed and archived content remains accessible to owners', async () => {
  findMany.mockResolvedValueOnce([row('finished', 12, 'completed', false)])
  render(await EnrolledCoursesPage({ searchParams: Promise.resolve({}) }))
  expect(screen.getByText('5/5 lessons · 100%')).toBeInTheDocument()
  expect(screen.getByText('✓ Completed')).toBeInTheDocument()
  expect(screen.getByText('Archived · access retained')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Review lessons' })).toHaveAttribute('href', '/courses/test-course/lesson/lesson-1')
})

test('status and title search are bounded, owner scoped and preserved across pages', async () => {
  count.mockResolvedValueOnce(28)
  findMany.mockResolvedValueOnce([row('second-page')])
  render(await EnrolledCoursesPage({
    searchParams: Promise.resolve({ status: 'active', q: '  gentle yoga  ', page: '2' }),
  }))
  expect(count).toHaveBeenCalledWith({
    where: {
      userId: 'learner-owner', status: { in: ['active'] },
      course: { is: { title: { contains: 'gentle yoga', mode: 'insensitive' } } },
    },
  })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 12, take: 12 }))
  expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '/courses/enrolled?status=active&q=gentle+yoga')
  expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/courses/enrolled?status=active&q=gentle+yoga&page=3')
  expect(screen.getByRole('link', { name: 'In progress' })).toHaveAttribute('aria-current', 'page')
})

test('malformed and repeated query fields cannot select another account or skip unbounded rows', async () => {
  render(await EnrolledCoursesPage({ searchParams: Promise.resolve({ status: ['active', 'completed'], q: ['private'], page: ['2', '3'] }) }))
  expect(count).toHaveBeenCalledWith({ where: { userId: 'learner-owner', status: { in: ['active', 'completed'] } } })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 12 }))
})

test('empty or filtered results offer recovery without querying other accounts', async () => {
  count.mockResolvedValueOnce(0)
  render(await EnrolledCoursesPage({ searchParams: Promise.resolve({ status: 'completed', q: 'missing' }) }))
  expect(findMany).not.toHaveBeenCalled()
  expect(screen.getByText('No courses match these filters')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Show all my courses' })).toHaveAttribute('href', '/courses/enrolled')
})

test('page selection clamps to the last existing page instead of rendering an empty ghost page', async () => {
  count.mockResolvedValueOnce(14)
  render(await EnrolledCoursesPage({ searchParams: Promise.resolve({ page: '9999' }) }))
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 12, take: 12 }))
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Next page' })).not.toBeInTheDocument()
})
