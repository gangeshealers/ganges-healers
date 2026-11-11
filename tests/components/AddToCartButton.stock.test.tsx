import { fireEvent, render, screen } from '@testing-library/react'
import AddToCartButton from '@/components/store/AddToCartButton'
import { useCart } from '@/components/store/CartProvider'

jest.mock('@/components/store/CartProvider', () => ({ useCart: jest.fn() }))
jest.mock('@/lib/analytics/meta-pixel', () => ({ trackAddToCart: jest.fn() }))
jest.mock('@/lib/analytics/track-client-event', () => ({ trackClientEvent: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))

const mockCart = { addItem: jest.fn(), setIsOpen: jest.fn() }
const props = { productId: 'oil-id', slug: 'oil', title: 'Oil', pricePaise: 10000, imageUrl: null }

beforeEach(() => {
  jest.clearAllMocks()
  ;(useCart as jest.Mock).mockReturnValue(mockCart)
})

test('stale in-stock flag never enables checkout when quantity is zero', () => {
  render(<AddToCartButton {...props} stockStatus="IN_STOCK" stockCount={0} />)
  const button = screen.getByRole('button', { name: 'Out of stock' })
  expect(button).toBeDisabled()
  fireEvent.click(button)
  expect(mockCart.addItem).not.toHaveBeenCalled()
})

test('positive tracked quantity can be added while server checkout remains authoritative', () => {
  render(<AddToCartButton {...props} stockStatus="IN_STOCK" stockCount={2} />)
  const button = screen.getByRole('button', { name: 'Add to Cart' })
  expect(button).toBeEnabled()
  fireEvent.click(button)
  expect(mockCart.addItem).toHaveBeenCalledWith(props)
  expect(mockCart.setIsOpen).toHaveBeenCalledWith(true)
})

test('legacy out-of-stock status remains unavailable even when count is positive', () => {
  render(<AddToCartButton {...props} stockStatus="OUT" stockCount={2} />)
  expect(screen.getByRole('button', { name: 'Out of stock' })).toBeDisabled()
})
