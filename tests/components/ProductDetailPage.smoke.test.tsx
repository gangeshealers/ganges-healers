import '../mocks/product-page-context'
import type { ProductDetail } from '@/lib/store/queries'
import React from 'react'
import { render, screen } from '@testing-library/react'
import Page from '@/app/store/[slug]/page'
import { getVariant } from '@/lib/experiments/ab-testing'
import { getProductBySlug } from '@/lib/store/queries'
import { trackClientEvent } from '@/lib/analytics/track-client-event'

jest.mock('@/components/store/AddToCartButton', () => ({
  __esModule: true,
  default: ({ stockStatus }: { stockStatus: string }) => <div data-testid="add-to-cart" data-stock={stockStatus} />,
}))

jest.mock('@/lib/store/queries', () => ({
  getProductBySlug: jest.fn(async (): Promise<ProductDetail> => ({
    id: '1', slug: 'oil-1', title: 'Oil 1', shortDescription: 'Nice oil', longDescription: 'Long desc', pricePaise: 19900, imageUrl: null, ratingAvg: 4.7, stockStatus: 'IN_STOCK', stockCount: null, isConsecrated: false, chakra: null, category: { slug: 'oils', title: 'Oils' }
  }))
}))

describe('ProductDetailPage smoke', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(getVariant).mockResolvedValue('A')
  })

  test('renders title price and stock', async () => {
    const ui = (await Page({ params: Promise.resolve({ slug: 'oil-1' }), searchParams: Promise.resolve({}) })) as unknown as React.ReactElement
    render(ui)

    expect(await screen.findByRole('heading', { level: 1, name: /Oil 1/i })).toBeInTheDocument()
    expect(screen.getByText('₹199.00')).toBeInTheDocument()
    expect(screen.getByText(/In stock/i)).toBeInTheDocument()
    expect(trackClientEvent).toHaveBeenCalledTimes(1)
    expect(trackClientEvent).toHaveBeenCalledWith('product_view', expect.objectContaining({
      metadata: { productId: '1', title: 'Oil 1', pricePaise: 19900 },
    }))
  })

  test.each([
    { count: 0, status: 'IN_STOCK', expected: 'Out of stock', passedToCart: 'OUT' },
    { count: null, status: 'IN_STOCK', expected: 'In stock', passedToCart: 'IN_STOCK' },
    { count: 3, status: 'IN_STOCK', expected: 'Only 3 left', passedToCart: 'IN_STOCK' },
  ] as const)('shows truthful availability for quantity $count', async ({ count, status, expected, passedToCart }) => {
    jest.mocked(getProductBySlug).mockResolvedValueOnce({
      id: 'stock-check', slug: 'oil-stock', title: 'Stock Test Oil',
      shortDescription: 'Product for stock test', longDescription: 'Long desc',
      pricePaise: 1000, imageUrl: null, ratingAvg: null, stockStatus: status,
      stockCount: count, isConsecrated: false, chakra: null, category: null,
    })
    render(await Page({ params: Promise.resolve({ slug: 'oil-stock' }), searchParams: Promise.resolve({}) }))
    expect(screen.getByText(expected, { exact: true })).toBeInTheDocument()
    expect(screen.getByTestId('add-to-cart')).toHaveAttribute('data-stock', passedToCart)
    expect(screen.queryByText(/selling fast|few pieces available/i)).not.toBeInTheDocument()
  })

  test.each(['A', 'B'] as const)('renders the assigned %s headline variant without changing the product price', async variant => {
    jest.mocked(getVariant).mockResolvedValue(variant)
    jest.mocked(getProductBySlug).mockResolvedValueOnce({
      id: '1', slug: 'oil-1', title: 'Oil 1', shortDescription: 'Nice oil', longDescription: 'Long desc',
      pricePaise: 19900, imageUrl: null, ratingAvg: 4.7, stockStatus: 'IN_STOCK',
      stockCount: null, isConsecrated: false, chakra: 'Heart', category: { slug: 'oils', title: 'Oils' },
    })
    const { container } = render(await Page({ params: Promise.resolve({ slug: 'oil-1' }), searchParams: Promise.resolve({}) }))
    expect(container.querySelector('[data-variant]')).toHaveAttribute('data-variant', variant)
    expect(getVariant).toHaveBeenCalledWith('product_headline')
    const headline = screen.queryByText('Aligned with your Heart Chakra energy')
    if (variant === 'B') expect(headline).toBeInTheDocument()
    else expect(headline).not.toBeInTheDocument()
    expect(screen.getByText('₹199.00')).toBeInTheDocument()
  })

  test('persists the rendered variant before sending the product view event', async () => {
    jest.mocked(getVariant).mockResolvedValue('B')
    jest.mocked(trackClientEvent).mockImplementationOnce(() => {
      expect(document.cookie).toContain('ghx_product_headline=B')
    })
    render(await Page({ params: Promise.resolve({ slug: 'oil-1' }), searchParams: Promise.resolve({}) }))
    expect(trackClientEvent).toHaveBeenCalledTimes(1)
  })
})
