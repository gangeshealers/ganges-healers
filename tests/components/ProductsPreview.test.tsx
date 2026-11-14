import { render, screen } from '@testing-library/react'
import ProductsPreview from '@/components/home/ProductsPreview'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: { product: { findMany: jest.fn() } },
}))

beforeEach(() => jest.clearAllMocks())

test('featured products use active available inventory, stored price and real store detail links', async () => {
  jest.mocked(prisma.product.findMany).mockResolvedValueOnce([{
    id: 'p1', slug: 'crystal-kit', title: 'Crystal Kit',
    shortDescription: 'A meditation tool', pricePaise: 129900,
    imageUrl: null, chakra: 'Heart', isConsecrated: false,
  }] as never)
  render(await ProductsPreview())
  expect(screen.getByRole('heading', { name: 'Tools for Your Daily Practice' })).toBeVisible()
  expect(screen.getByRole('link', { name: /Crystal Kit/ })).toHaveAttribute('href', '/store/crystal-kit')
  expect(screen.getByText('₹1,299')).toBeVisible()
  expect(screen.getByText('Heart Chakra')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Browse the Store' })).toHaveAttribute('href', '/store')
  expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      isActive: true,
      stockStatus: { not: 'OUT' },
      OR: [{ stockCount: null }, { stockCount: { gt: 0 } }],
    },
    take: 4,
  }))
})

test('does not advertise products when the catalog has no available stock', async () => {
  jest.mocked(prisma.product.findMany).mockResolvedValueOnce([])
  expect(await ProductsPreview()).toBeNull()
})
