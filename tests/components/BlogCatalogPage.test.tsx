import { render, screen } from '@testing-library/react'
import BlogPage from '@/app/blog/page'
import { getPublishedBlogPage } from '@/lib/blog/queries'

jest.mock('@/lib/blog/queries', () => ({ getPublishedBlogPage: jest.fn() }))

beforeEach(() => jest.clearAllMocks())

test('article cards remain linked and pagination preserves the search term', async () => {
  ;(getPublishedBlogPage as jest.Mock).mockResolvedValueOnce({
    posts: [{
      id: 'post-1', slug: 'breath-work', title: 'Breath Work Basics',
      excerpt: 'Learn to breathe with intention.', imageUrl: null,
      createdAt: new Date('2026-11-01T12:00:00.000Z'),
    }],
    total: 20, page: 2, totalPages: 3,
  })
  render(await BlogPage({ searchParams: Promise.resolve({ q: 'breath', page: '2' }) }))
  expect(screen.getByRole('heading', { name: 'Wellness Articles' })).toBeVisible()
  expect(screen.getByRole('searchbox', { name: 'Search published articles' })).toHaveValue('breath')
  expect(screen.getByRole('link', { name: /Breath Work Basics/ })).toHaveAttribute('href', '/blog/breath-work')
  expect(screen.getByRole('link', { name: 'Previous articles' })).toHaveAttribute('href', '/blog?q=breath')
  expect(screen.getByRole('link', { name: 'Next articles' })).toHaveAttribute('href', '/blog?q=breath&page=3')
  expect(getPublishedBlogPage).toHaveBeenCalledWith({ q: 'breath', page: 2 })
})

test('no matching articles can be recovered without exposing drafts', async () => {
  ;(getPublishedBlogPage as jest.Mock).mockResolvedValueOnce({
    posts: [], total: 0, page: 1, totalPages: 0,
  })
  render(await BlogPage({ searchParams: Promise.resolve({ q: 'missing' }) }))
  expect(screen.getByText('No matching articles')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Clear article search' })).toHaveAttribute('href', '/blog')
})
