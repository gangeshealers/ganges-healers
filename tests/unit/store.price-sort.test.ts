import { prisma } from '@/lib/prisma'
import { listProducts, parseProductSort } from '@/lib/store/queries'

jest.mock('@/lib/prisma', () => ({
  prisma: { product: { findMany: jest.fn(async () => []) } },
}))

const findMany = prisma.product.findMany as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  findMany.mockResolvedValue([])
})

describe('store price sort', () => {
  test('only accepts supported sort values', () => {
    expect(parseProductSort('price_asc')).toBe('price_asc')
    expect(parseProductSort('price_desc')).toBe('price_desc')
    expect(parseProductSort('anything')).toBe('default')
    expect(parseProductSort(['price_desc', 'default'])).toBe('default')
    expect(parseProductSort(undefined)).toBe('default')
  })

  test('uses a stable ID tiebreaker for both price directions', async () => {
    await listProducts({ sort: 'price_asc', limit: 10, q: 'Oil' })
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ pricePaise: 'asc' }, { id: 'asc' }],
      where: expect.objectContaining({ isActive: true, OR: expect.any(Array) }),
      take: 11,
    }))
    await listProducts({ sort: 'price_desc', limit: 8 })
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      orderBy: [{ pricePaise: 'desc' }, { id: 'asc' }], take: 9,
    }))
  })

  test('keeps existing unfiltered default order and publication policy', async () => {
    await listProducts()
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ id: 'asc' }], where: { isActive: true }, take: 21,
    }))
  })
})
