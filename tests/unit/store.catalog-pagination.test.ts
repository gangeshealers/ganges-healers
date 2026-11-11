import { listProducts } from '@/lib/store/queries'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findMany: jest.fn() },
  },
}))

const product = (id: string) => ({
  id, slug: `product-${id}`, title: `Product ${id}`, shortDescription: 'A sample',
  pricePaise: 12000, imageUrl: null, ratingAvg: null, stockStatus: 'IN_STOCK',
  isConsecrated: false, chakra: null, category: null,
})

beforeEach(() => jest.clearAllMocks())

test('an exactly full final page has no misleading next cursor', async () => {
  jest.mocked(prisma.product.findMany).mockResolvedValueOnce([product('1'), product('2')] as never)
  const page = await listProducts({ limit: 2 })
  expect(page.items).toHaveLength(2)
  expect(page.nextCursor).toBeNull()
  expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }))
})

test('an extra record permits continuation and is not displayed prematurely', async () => {
  jest.mocked(prisma.product.findMany).mockResolvedValueOnce([product('1'), product('2'), product('3')] as never)
  const page = await listProducts({ limit: 2, cursor: 'previous', q: 'Product' })
  expect(page.items.map(item => item.id)).toEqual(['1', '2'])
  expect(page.nextCursor).toBe('2')
  expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
    skip: 1, cursor: { id: 'previous' }, take: 3,
  }))
})
