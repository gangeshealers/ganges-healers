import React from 'react'
import { render, screen } from '@testing-library/react'
import Page from '@/app/store/page'
import { listProducts } from '@/lib/store/queries'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    productCategory: { findMany: jest.fn(async () => []) },
    product: { findMany: jest.fn(async () => []) },
  },
}))

jest.mock('@/lib/store/queries', () => ({
  parseProductSort: (value: unknown) => value === 'price_asc' || value === 'price_desc' ? value : 'default',
  listProducts: jest.fn(async () => ({
    items: [
      { id: '1', slug: 'oil-1', title: 'Oil 1', shortDescription: 'Nice oil', pricePaise: 19900, imageUrl: null, ratingAvg: 4.7, stockStatus: 'IN_STOCK', category: { slug: 'oils', title: 'Oils' } },
      { id: '2', slug: 'crystal-1', title: 'Crystal 1', shortDescription: 'Nice crystal', pricePaise: 29900, imageUrl: null, ratingAvg: null, stockStatus: 'LOW', category: { slug: 'crystals', title: 'Crystals' } },
    ],
    nextCursor: null
  }))
}))

describe('StorePage smoke', () => {
  test('subsequent pages send the cursor and preserve the active search when returning to first page', async () => {
    const ui = await Page({ searchParams: Promise.resolve({ q: 'Oil', categorySlug: 'oils', cursor: 'next_prod_1' }) })
    render(ui)
    expect(listProducts).toHaveBeenCalledWith({
      q: 'Oil', categorySlug: 'oils', chakra: undefined, sort: 'default', limit: 20, cursor: 'next_prod_1',
    })
    expect(screen.getByRole('link', { name: 'Back to first page' }))
      .toHaveAttribute('href', '/store?q=Oil&categorySlug=oils')
  })

  test('price sorting survives active category and chakra selections and first-page return', async () => {
    const ui = await Page({ searchParams: Promise.resolve({ q: 'Oil', categorySlug: 'oils', chakra: 'Heart', sort: 'price_asc', cursor: 'next_prod_1' }) })
    render(ui)
    expect(listProducts).toHaveBeenCalledWith({
      q: 'Oil', categorySlug: 'oils', chakra: 'Heart', sort: 'price_asc', limit: 20, cursor: 'next_prod_1',
    })
    expect(screen.getByRole('combobox', { name: 'Sort products' })).toHaveValue('price_asc')
    expect(screen.getByRole('link', { name: 'Back to first page' })).toHaveAttribute('href', '/store?q=Oil&categorySlug=oils&chakra=Heart&sort=price_asc')
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('href', '/store?q=Oil&categorySlug=oils&sort=price_asc')
  })

  test('renders product cards', async () => {
    const ui = (await Page({ searchParams: Promise.resolve({}) })) as unknown as React.ReactElement
    render(ui)
  expect(await screen.findByRole('heading', { level: 1, name: /Store/i })).toBeInTheDocument()
    expect(screen.getByText(/Oil 1/i)).toBeInTheDocument()
    expect(screen.getByText(/Crystal 1/i)).toBeInTheDocument()
  })
})
