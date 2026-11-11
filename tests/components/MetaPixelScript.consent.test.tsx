import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MetaPixelScript from '@/components/analytics/MetaPixelScript'
import PrivacyChoicesButton from '@/components/analytics/PrivacyChoicesButton'
import { MARKETING_CONSENT_KEY } from '@/lib/analytics/consent'
import { trackAddToCart } from '@/lib/analytics/meta-pixel'
import { usePathname } from 'next/navigation'

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }))
jest.mock('next/script', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="marketing-pixel-script">{children}</div>,
}))

const usePath = usePathname as jest.Mock
const pixel = '1234567890'

beforeEach(() => {
  window.localStorage.clear()
  delete window.fbq
  usePath.mockReturnValue('/services')
})
afterEach(() => jest.clearAllMocks())

test('visitors never load Meta Pixel before choosing to allow tracking', async () => {
  render(<MetaPixelScript pixelId={pixel} />)
  expect(screen.queryByTestId('marketing-pixel-script')).not.toBeInTheDocument()
  const chooser = await screen.findByRole('region', { name: 'Optional analytics preferences' })
  expect(chooser).toHaveTextContent('No marketing pixel loads before you allow it')
  fireEvent.click(screen.getByRole('button', { name: 'Reject optional analytics' }))
  expect(window.localStorage.getItem(MARKETING_CONSENT_KEY)).toBe('denied')
  expect(screen.queryByTestId('marketing-pixel-script')).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Optional analytics preferences' })).not.toBeInTheDocument()
})

test('visitors can later allow and revoke tracking using the footer control', async () => {
  const fbq = jest.fn()
  Object.defineProperty(window, 'fbq', { configurable: true, writable: true, value: fbq })
  render(<><MetaPixelScript pixelId={pixel} /><PrivacyChoicesButton pixelId={pixel} /></>)
  await screen.findByRole('region', { name: 'Optional analytics preferences' })
  fireEvent.click(screen.getByRole('button', { name: 'Allow optional analytics' }))
  expect(window.localStorage.getItem(MARKETING_CONSENT_KEY)).toBe('allowed')
  expect(screen.getByTestId('marketing-pixel-script')).toBeInTheDocument()
  fbq.mockClear()
  trackAddToCart({ content_name: 'Test service', content_ids: ['s1'], value: 100, currency: 'INR' })
  expect(fbq).toHaveBeenCalledWith('track', 'AddToCart', expect.objectContaining({ content_ids: ['s1'] }))
  fireEvent.click(screen.getByRole('button', { name: 'Privacy preferences' }))
  expect(screen.getByRole('region', { name: 'Optional analytics preferences' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reject optional analytics' }))
  expect(fbq).toHaveBeenCalledWith('consent', 'revoke')
  fbq.mockClear()
  trackAddToCart({ content_name: 'Test service', content_ids: ['s1'], value: 100, currency: 'INR' })
  expect(fbq).not.toHaveBeenCalled()
})

test('stored consent is honored without automatically reopening the chooser', async () => {
  window.localStorage.setItem(MARKETING_CONSENT_KEY, 'allowed')
  render(<MetaPixelScript pixelId={pixel} />)
  await waitFor(() => expect(screen.getByTestId('marketing-pixel-script')).toBeInTheDocument())
  expect(screen.queryByRole('region', { name: 'Optional analytics preferences' })).not.toBeInTheDocument()
})

test('marketing code never runs on authentication pages, even after opt-in', async () => {
  window.localStorage.setItem(MARKETING_CONSENT_KEY, 'allowed')
  usePath.mockReturnValue('/auth/reset-password')
  render(<MetaPixelScript pixelId={pixel} />)
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Optional analytics preferences' })).not.toBeInTheDocument())
  expect(screen.queryByTestId('marketing-pixel-script')).not.toBeInTheDocument()
})

test('moving to an authentication route revokes an already-loaded pixel', async () => {
  window.localStorage.setItem(MARKETING_CONSENT_KEY, 'allowed')
  const fbq = jest.fn()
  Object.defineProperty(window, 'fbq', { configurable: true, writable: true, value: fbq })
  const { rerender } = render(<MetaPixelScript pixelId={pixel} />)
  await waitFor(() => expect(screen.getByTestId('marketing-pixel-script')).toBeInTheDocument())
  fbq.mockClear()
  usePath.mockReturnValue('/auth/signin')
  rerender(<MetaPixelScript pixelId={pixel} />)
  expect(screen.queryByTestId('marketing-pixel-script')).not.toBeInTheDocument()
  await waitFor(() => expect(fbq).toHaveBeenCalledWith('consent', 'revoke'))
})

test('no consent UI or pixel is rendered without a valid configured identifier', () => {
  render(<><MetaPixelScript pixelId="bad<script>" /><PrivacyChoicesButton pixelId="bad<script>" /></>)
  expect(screen.queryByTestId('marketing-pixel-script')).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Optional analytics preferences' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Privacy preferences' })).not.toBeInTheDocument()
})
