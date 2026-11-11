import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSession } from 'next-auth/react'
import MyBookingsPage from '@/app/dashboard/bookings/page'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  ;(useSession as jest.Mock).mockReturnValue({ data: { user: { id: 'member-1' } }, status: 'authenticated' })
  global.fetch = jest.fn()
})

test('empty upcoming and past bookings have useful next actions', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }))
  const user = userEvent.setup()
  render(<MyBookingsPage />)
  expect(await screen.findByText('No upcoming bookings.')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Explore healing services' })).toHaveAttribute('href', '/services')
  await user.click(screen.getByRole('tab', { name: 'Past (0)' }))
  expect(screen.getByText('No past bookings.')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Discover healing sessions' })).toHaveAttribute('href', '/services')
})

test('failed booking read offers a real retry without creating another booking', async () => {
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'offline' }), { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }))
  const user = userEvent.setup()
  render(<MyBookingsPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Your bookings could not be loaded')
  expect(screen.getByRole('link', { name: 'Browse healing services' })).toHaveAttribute('href', '/services')
  await user.click(screen.getByRole('button', { name: 'Try loading bookings again' }))
  expect(await screen.findByText('No upcoming bookings.')).toBeVisible()
  expect(global.fetch).toHaveBeenCalledTimes(2)
})

test('signed-out visitors get an explicit sign-in path rather than a broken fetch', async () => {
  ;(useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' })
  render(<MyBookingsPage />)
  const link = await screen.findByRole('link', { name: 'Sign in to see bookings' })
  expect(link).toHaveAttribute('href', '/auth/signin?callbackUrl=%2Fdashboard%2Fbookings')
  expect(global.fetch).not.toHaveBeenCalled()
})
