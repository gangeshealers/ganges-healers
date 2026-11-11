import { webcrypto } from 'node:crypto'
import { TextEncoder } from 'node:util'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSession } from 'next-auth/react'
import { useCart } from '@/components/store/CartProvider'
import StoreCheckout from '@/app/store/checkout/CheckoutClient'
import { openRazorpayCheckout } from '@/lib/payments/openRazorpayCheckout'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useSearchParams: () => new URLSearchParams() }))
jest.mock('@/components/store/CartProvider', () => ({ useCart: jest.fn() }))
jest.mock('@/lib/payments/openRazorpayCheckout', () => ({ openRazorpayCheckout: jest.fn() }))
jest.mock('@/lib/analytics/meta-pixel', () => ({ trackInitiateCheckout: jest.fn(), trackPurchase: jest.fn() }))
jest.mock('@/lib/experiments/client', () => ({ readVariantClient: () => null }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const clearCart = jest.fn()
const item = { productId: 'product', slug: 'mat', title: 'Practice mat', pricePaise: 10000, quantity: 1, imageUrl: null }
const prepared = { orderId: 'saved-purchase', razorpayOrderId: 'order_pending', amountPaise: 10000, key: 'public_key' }
const signed = { razorpay_order_id: 'order_pending', razorpay_payment_id: 'pay_captured', razorpay_signature: 'signed_proof' }
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }) }
function checkoutCalls(fetch: jest.SpyInstance) { return fetch.mock.calls.filter(([url]) => url === '/api/store/checkout').map(([, options]) => JSON.parse(options.body)) }
async function fill(user: ReturnType<typeof userEvent.setup>) {
  for (const [label, value] of [['Address Line 1 *', 'Test lane'], ['City *', 'Delhi'], ['State *', 'Delhi'], ['Postal Code *', '110001']]) await user.type(screen.getByLabelText(label), value)
}

beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.clear()
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
  Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder })
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'buyer', name: 'Buyer' } }, status: 'authenticated' } as never)
  jest.mocked(useCart).mockReturnValue({ items: [item], totalPaise: 10000, clearCart, removeItem: jest.fn(), updateQuantity: jest.fn() } as never)
  jest.mocked(openRazorpayCheckout).mockRejectedValue(new Error('Payment dismissed'))
})
afterEach(() => jest.restoreAllMocks())

test('lost checkout responses retry with the same key, including after the page is reopened', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (url === '/api/store/checkout') throw new Error('Connection lost')
    return response({})
  })
  const user = userEvent.setup()
  const view = render(<StoreCheckout />)
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  await screen.findByRole('alert')
  await user.click(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  await waitFor(() => expect(checkoutCalls(fetch)).toHaveLength(2))
  view.unmount()
  render(<StoreCheckout />)
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  await waitFor(() => expect(checkoutCalls(fetch)).toHaveLength(3))
  expect(new Set(checkoutCalls(fetch).map(body => body.checkoutKey)).size).toBe(1)
  const stored = sessionStorage.getItem('ganges-store-checkout:buyer')!
  expect(stored).not.toContain('Test lane')
  expect(stored).not.toContain('Delhi')
  expect(openRazorpayCheckout).not.toHaveBeenCalled()
})

test('dismissal preserves the saved order and an edited address starts a new attempt', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => response(url === '/api/store/checkout' ? prepared : {}))
  const user = userEvent.setup()
  render(<StoreCheckout />)
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  await screen.findByText('Payment was cancelled. You can try again.')
  expect(screen.getByRole('link', { name: 'View saved order' })).toHaveAttribute('href', '/dashboard/orders/saved-purchase')
  await user.click(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  await waitFor(() => expect(openRazorpayCheckout).toHaveBeenCalledTimes(2))
  expect(checkoutCalls(fetch)[0].checkoutKey).toBe(checkoutCalls(fetch)[1].checkoutKey)
  await user.type(screen.getByLabelText('City *'), ' East')
  await user.click(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  await waitFor(() => expect(openRazorpayCheckout).toHaveBeenCalledTimes(3))
  expect(checkoutCalls(fetch)[2].checkoutKey).not.toBe(checkoutCalls(fetch)[1].checkoutKey)
  expect(clearCart).not.toHaveBeenCalled()
})

test('unconfirmed verification can be retried without reopening the payment dialog or creating another order', async () => {
  let verifications = 0
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (url === '/api/store/checkout') return response(prepared)
    if (url === '/api/payments/verify') return response(++verifications === 1 ? { ok: true } : { verified: true })
    return response({})
  })
  jest.mocked(openRazorpayCheckout).mockResolvedValue(signed)
  const user = userEvent.setup()
  const view = render(<StoreCheckout />)
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  await screen.findByRole('alert')
  expect(clearCart).not.toHaveBeenCalled()
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'buyer', name: 'Updated profile name' } }, status: 'authenticated' } as never)
  view.rerender(<StoreCheckout />)
  expect(screen.getByLabelText('Address Line 1 *')).toHaveValue('Test lane')
  expect(screen.getByLabelText('Full Name *')).toHaveValue('Buyer')
  await user.click(screen.getByRole('button', { name: 'Confirm payment' }))
  await screen.findByText('Order placed!')
  expect(clearCart).toHaveBeenCalledTimes(1)
  expect(checkoutCalls(fetch)).toHaveLength(1)
  expect(openRazorpayCheckout).toHaveBeenCalledTimes(1)
  expect(sessionStorage.getItem('ganges-store-checkout:buyer')).toBeNull()
})

test('gateway failures show the saved purchase reference and malformed successes cannot open checkout', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => response(url === '/api/store/checkout' ? { error: 'Gateway unavailable', orderId: 'saved-purchase' } : {}, url === '/api/store/checkout' ? 500 : 200))
  const user = userEvent.setup()
  render(<StoreCheckout />)
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Gateway unavailable')
  expect(screen.getByRole('link', { name: 'View saved order' })).toBeVisible()
  fetch.mockImplementation(async () => response({ orderId: 'saved-purchase' }))
  await user.click(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Checkout could not be prepared')
  expect(openRazorpayCheckout).not.toHaveBeenCalled()
})

test('an account switch while checkout is preparing cannot open payment for the previous owner', async () => {
  let resolve!: (value: Response) => void
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => url === '/api/store/checkout' ? new Promise<Response>(done => { resolve = done }) : response({}))
  const user = userEvent.setup()
  const view = render(<StoreCheckout />)
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  await waitFor(() => expect(checkoutCalls(fetch)).toHaveLength(1))
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'different-buyer' } }, status: 'authenticated' } as never)
  view.rerender(<StoreCheckout />)
  resolve(response(prepared))
  expect(await screen.findByRole('alert')).toHaveTextContent('Your account changed')
  expect(openRazorpayCheckout).not.toHaveBeenCalled()
  expect(clearCart).not.toHaveBeenCalled()
})

test('rapid repeated clicks prepare only one checkout while browser storage is unavailable', async () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked') })
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked') })
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => response(url === '/api/store/checkout' ? prepared : {}))
  const user = userEvent.setup()
  render(<StoreCheckout />)
  await fill(user)
  await user.dblClick(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  await screen.findByText('Payment was cancelled. You can try again.')
  expect(checkoutCalls(fetch)).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Pay ₹100.00' }))
  await waitFor(() => expect(checkoutCalls(fetch)).toHaveLength(2))
  expect(checkoutCalls(fetch)[0].checkoutKey).toBe(checkoutCalls(fetch)[1].checkoutKey)
})



test('saved shipping details are applied only after explicit buyer action and remain editable', async () => {
  const previous = {
    name: 'Past Recipient', line1: 'Saved Lane', city: 'Rishikesh',
    state: 'Uttarakhand', postalCode: '249201', phone: '8888888888',
  }
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async url =>
    response(url === '/api/store/shipping-address' ? { address: previous } : {}))
  const user = userEvent.setup()
  render(<StoreCheckout />)
  expect(fetch.mock.calls.filter(([url]) => url === '/api/store/shipping-address')).toHaveLength(0)
  expect(screen.getByLabelText('Address Line 1 *')).toHaveValue('')
  await user.click(screen.getByRole('button', { name: 'Use previous shipping address' }))
  expect(await screen.findByText('Previous shipping address loaded. Review or edit it before payment.')).toBeInTheDocument()
  expect(screen.getByLabelText('Full Name *')).toHaveValue('Past Recipient')
  expect(screen.getByLabelText('Address Line 1 *')).toHaveValue('Saved Lane')
  expect(screen.getByLabelText('Postal Code *')).toHaveValue('249201')
  expect(fetch.mock.calls.filter(([url]) => url === '/api/store/shipping-address')).toHaveLength(1)
  await user.type(screen.getByLabelText('City *'), ' North')
  expect(screen.getByLabelText('City *')).toHaveValue('Rishikesh North')
  expect(sessionStorage.getItem('ganges-store-checkout:buyer')).toBeNull()
})

test('an account switch prevents stale address data from being filled into a different checkout', async () => {
  let finish!: (response: Response) => void
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async url =>
    url === '/api/store/shipping-address' ? new Promise<Response>(resolve => { finish = resolve }) : response({}))
  const user = userEvent.setup()
  const view = render(<StoreCheckout />)
  await user.click(screen.getByRole('button', { name: 'Use previous shipping address' }))
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url === '/api/store/shipping-address')).toBe(true))
  jest.mocked(useSession).mockReturnValue({
    data: { user: { id: 'different-buyer', name: 'Second Buyer' } },
    status: 'authenticated',
  } as never)
  view.rerender(<StoreCheckout />)
  await act(async () => finish(response({ address: {
    name: 'Previous Buyer', line1: 'Private Address',
    city: 'Delhi', state: 'Delhi', postalCode: '110001',
  } })))
  expect(screen.getByLabelText('Full Name *')).toHaveValue('Second Buyer')
  expect(screen.getByLabelText('Address Line 1 *')).toHaveValue('')
  expect(screen.queryByText('Previous shipping address loaded. Review or edit it before payment.')).not.toBeInTheDocument()
})

test('missing and invalid saved addresses never prevent manual checkout entry', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => response(
    url === '/api/store/shipping-address' ? { address: null } : {},
  ))
  const user = userEvent.setup()
  render(<StoreCheckout />)
  await user.click(screen.getByRole('button', { name: 'Use previous shipping address' }))
  expect(await screen.findByText(/No complete shipping address was found/)).toBeInTheDocument()
  expect(screen.getByLabelText('Address Line 1 *')).toHaveValue('')
  fetch.mockImplementation(async url => response(url === '/api/store/shipping-address' ? { address: { name: 'Incomplete' } } : {}))
  await user.click(screen.getByRole('button', { name: 'Use previous shipping address' }))
  expect(await screen.findByText(/Could not load a previous address/)).toBeInTheDocument()
  await user.type(screen.getByLabelText('Address Line 1 *'), 'Manual lane')
  expect(screen.getByLabelText('Address Line 1 *')).toHaveValue('Manual lane')
})
