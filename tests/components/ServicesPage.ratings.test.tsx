import { render, screen } from '@testing-library/react'
import ServicesPage from '@/app/services/page'
import { prisma } from '@/lib/prisma'

jest.mock('@/components/services/ServicesFilter', () => ({ __esModule: true, default: () => null }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  service: { count: jest.fn(async () => 2), findMany: jest.fn(async () => [
    { id: 'rated', slug: 'yoga', name: 'Yoga', description: 'A session', category: 'Yoga', price: 100, duration: 60, image: null, _count: { bookings: 5 } },
    { id: 'new', slug: 'meditation', name: 'Meditation', description: 'A session', category: 'Meditation', price: 200, duration: 30, image: null, _count: { bookings: 0 } },
  ]) },
  review: { groupBy: jest.fn(async (args?: { having?: { rating?: { _avg?: { gte?: number } } } }) => (args?.having?.rating?._avg?.gte ?? 0) > 3.5 ? [] : [{ serviceId: 'rated', _avg: { rating: 3.5 }, _count: { rating: 2 } }]) },
} }))

beforeEach(() => jest.clearAllMocks())

test('catalog cards show actual average/count and a truthful unrated state in one batched query', async () => {
  render(await ServicesPage({ searchParams: Promise.resolve({}) }))
  expect(screen.getByLabelText('3.5 out of 5 from 2 reviews')).toBeVisible()
  expect(screen.getByLabelText('5 completed sessions')).toBeVisible()
  expect(screen.getByLabelText('5 completed sessions')).toHaveTextContent(/^5 completed$/)
  expect(screen.getByLabelText('0 completed sessions')).toBeVisible()
  expect(prisma.service.findMany).toHaveBeenCalledWith(expect.objectContaining({
    select: expect.objectContaining({
      _count: { select: { bookings: { where: { status: 'COMPLETED' } } } },
    }),
  }))
  expect(screen.getByText('No reviews yet')).toBeVisible()
  expect(screen.queryByText('5.0')).not.toBeInTheDocument()
  expect(prisma.review.groupBy).toHaveBeenCalledTimes(1)
  expect(prisma.review.groupBy).toHaveBeenCalledWith({ by: ['serviceId'], where: { serviceId: { in: ['rated', 'new'] } }, _avg: { rating: true }, _count: { rating: true } })
  expect(prisma.service.findMany).toHaveBeenCalledWith({ where: { isActive: true }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } })
})

test('malformed prices and repeated search values never reach Prisma as NaN, infinity or comma-joined terms', async () => {
  await ServicesPage({ searchParams: Promise.resolve({ minPrice: 'NaN', maxPrice: 'Infinity', search: ['first', 'second'], category: ['one', 'two'] }) })
  expect(prisma.service.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true }, select: expect.objectContaining({ name: true }) }))
})

test('valid search and category filters retain a zero minimum price', async () => {
  await ServicesPage({ searchParams: Promise.resolve({ minPrice: '0', maxPrice: '9000', search: 'hypnotherapy', category: 'Therapy' }) })
  expect(prisma.service.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, category: 'Therapy', price: { gte: 0, lte: 9000 }, OR: [
    { name: { contains: 'hypnotherapy', mode: 'insensitive' } }, { description: { contains: 'hypnotherapy', mode: 'insensitive' } },
  ] } }))
})

test('a minimum rating matches the actual review average and excludes unrated services', async () => {
  render(await ServicesPage({ searchParams: Promise.resolve({ minRating: '3.5' }) }))
  expect(screen.getByRole('heading', { name: 'Yoga' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Meditation' })).not.toBeInTheDocument()
  expect(prisma.review.groupBy).toHaveBeenCalledTimes(1)
})

test('a higher threshold shows the clearable empty state', async () => {
  render(await ServicesPage({ searchParams: Promise.resolve({ minRating: '3.6' }) }))
  expect(screen.getByText('No matching services')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/services')
})

test.each(['Infinity', '0', '5.1', '4.51', ['4', '5']].map(minRating => ({ minRating })))('ignores malformed or repeated ratings (%j)', async ({ minRating }) => {
  render(await ServicesPage({ searchParams: Promise.resolve({ minRating }) }))
  expect(screen.getByRole('heading', { name: 'Meditation' })).toBeVisible()
})

test.each([
  ['newest', [{ createdAt: 'desc' }, { id: 'desc' }]],
  ['popular', [{ popularity: 'desc' }, { name: 'asc' }, { id: 'asc' }]],
  ['price_asc', [{ price: 'asc' }, { name: 'asc' }, { id: 'asc' }]],
  ['price_desc', [{ price: 'desc' }, { name: 'asc' }, { id: 'asc' }]],
])('sorts the complete services query before applying catalog pagination (%s)', async (sort, orderBy) => {
  await ServicesPage({ searchParams: Promise.resolve({ sort, category: 'Therapy', search: 'yoga' }) })
  expect(prisma.service.findMany).toHaveBeenCalledWith(expect.objectContaining({
    orderBy,
    skip: 0,
    take: 12,
    where: expect.objectContaining({ category: 'Therapy' }),
  }))
})

test('preserves a validated sort, search, and category in next-page links', async () => {
  jest.mocked(prisma.service.count).mockResolvedValueOnce(25)
  render(await ServicesPage({ searchParams: Promise.resolve({ sort: 'price_asc', search: 'yoga', category: 'Therapy' }) }))
  const next = screen.getByRole('link', { name: 'Next services' })
  const href = new URL(next.getAttribute('href')!, 'https://example.test')
  expect(href.pathname).toBe('/services')
  expect(Object.fromEntries(href.searchParams)).toEqual({
    category: 'Therapy',
    search: 'yoga',
    sort: 'price_asc',
    page: '2',
  })
})

test('unknown sort inputs fall back to newest ordering and never round-trip into pagination', async () => {
  jest.mocked(prisma.service.count).mockResolvedValueOnce(25)
  render(await ServicesPage({ searchParams: Promise.resolve({ sort: ['popular', 'price_desc'] }) }))
  expect(prisma.service.findMany).toHaveBeenCalledWith(expect.objectContaining({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  }))
  expect(screen.getByRole('link', { name: 'Next services' })).toHaveAttribute('href', '/services?page=2')
})

test.each([
  ['online', ['ONLINE', 'BOTH']],
  ['in_person', ['OFFLINE', 'BOTH']],
])('session format %s includes services that support both delivery modes', async (format, modes) => {
  await ServicesPage({ searchParams: Promise.resolve({ format, category: 'Therapy' }) })
  expect(prisma.service.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ isActive: true, category: 'Therapy', mode: { in: modes } }),
    select: expect.objectContaining({ mode: true, name: true }),
  }))
  expect(prisma.service.count).toHaveBeenCalledWith({
    where: expect.objectContaining({ mode: { in: modes } }),
  })
})

test('format, sorting and search survive service pagination and malformed formats do not', async () => {
  jest.mocked(prisma.service.count).mockResolvedValueOnce(25)
  render(await ServicesPage({ searchParams: Promise.resolve({ format: 'online', sort: 'popular', search: 'sound' }) }))
  const next = new URL(screen.getByRole('link', { name: 'Next services' }).getAttribute('href')!, 'https://example.test')
  expect(Object.fromEntries(next.searchParams)).toEqual({ search: 'sound', sort: 'popular', format: 'online', page: '2' })

  jest.clearAllMocks()
  jest.mocked(prisma.service.count).mockResolvedValueOnce(25)
  render(await ServicesPage({ searchParams: Promise.resolve({ format: ['online', 'in_person'] }) }))
  expect(screen.getAllByRole('link', { name: 'Next services' }).at(-1)).toHaveAttribute('href', '/services?page=2')
})
