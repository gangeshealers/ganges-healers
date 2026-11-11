import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchPageClient from '@/app/search/SearchPageClient'
import { useSearch } from '@/lib/search/useSearch'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ q: 'Reiki' }),
  useRouter: () => ({ push }),
}))
jest.mock('@/lib/search/useSearch', () => ({ useSearch: jest.fn() }))

const empty = { services: [], healers: [], programs: [], courses: [], products: [], blog: [], audio: [] }

beforeEach(() => {
  jest.clearAllMocks()
  ;(useSearch as jest.Mock).mockReturnValue({ status: 'ready', results: {
    ...empty,
    services: [{ id: 'service-1', slug: 'reiki', name: 'Reiki Healing', category: 'Energy', tagline: null }],
  }, retry: jest.fn() })
})

test('full catalog browsing clarifies result caps and keeps the original query', () => {
  render(<SearchPageClient />)
  expect(screen.getByRole('heading', { name: 'Search Ganges Healers' })).toBeVisible()
  expect(screen.getByText(/Showing up to 10 matches in each category/)).toBeVisible()
  const browse = screen.getByRole('navigation', { name: 'Browse all catalogs' })
  expect(within(browse).getByRole('link', { name: 'Services' })).toHaveAttribute('href', '/services?q=Reiki')
  expect(within(browse).getByRole('link', { name: 'Store products' })).toHaveAttribute('href', '/store?q=Reiki')
  expect(within(browse).getByRole('link', { name: 'Articles' })).toHaveAttribute('href', '/blog')
  expect(screen.getByRole('link', { name: 'Search services catalog' })).toHaveAttribute('href', '/services?q=Reiki')
  expect(screen.getByRole('link', { name: /Reiki Healing/ })).toHaveAttribute('href', '/services/reiki')
})

test('search results page lets the visitor revise their query directly', async () => {
  const user = userEvent.setup()
  render(<SearchPageClient />)
  const field = screen.getByRole('searchbox', { name: 'Search the website' })
  await user.clear(field)
  await user.type(field, 'yoga & movement')
  await user.click(screen.getByRole('button', { name: 'Search' }))
  expect(push).toHaveBeenCalledWith('/search?q=yoga+%26+movement')
})

test('no matches still allow browsing the catalog directories', () => {
  ;(useSearch as jest.Mock).mockReturnValue({ status: 'ready', results: empty, retry: jest.fn() })
  render(<SearchPageClient />)
  expect(screen.getByText('No results found. Try a different search term.')).toBeVisible()
  expect(screen.getByRole('navigation', { name: 'Browse all catalogs' })).toBeVisible()
})
