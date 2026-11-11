import { render, screen } from '@testing-library/react'
import NotFound from '@/app/not-found'

test('unavailable public links offer clear, working recovery destinations', () => {
  render(<NotFound />)
  expect(screen.getByRole('heading', { level: 1, name: 'This page isn’t available' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Return to homepage' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('link', { name: 'Explore healing services' })).toHaveAttribute('href', '/services')
  expect(screen.getByRole('link', { name: 'Or browse guided programs' })).toHaveAttribute('href', '/programs')
})
