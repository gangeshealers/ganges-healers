import { render, screen, within } from '@testing-library/react'
import SiteFooter from '@/components/navigation/SiteFooter'

test('site footer links visitors to existing public and member destinations', () => {
  render(<SiteFooter />)
  const nav = screen.getByRole('navigation', { name: 'Footer navigation' })
  const expected: [string, string][] = [
    ['Browse healing services', '/services'],
    ['Discover healing programs', '/programs'],
    ['Explore courses', '/courses'],
    ['Listen to guided audio', '/audio'],
    ['Meet our healers', '/healers'],
    ['Visit the healing store', '/store'],
    ['Read wellness articles', '/blog'],
    ['Explore community discussions', '/community'],
    ['View your bookings', '/dashboard/bookings'],
    ['Explore membership', '/dashboard/membership'],
    ['Your learning dashboard', '/courses/enrolled'],
    ['Manage account settings', '/dashboard/settings'],
  ]
  for (const [label, href] of expected) {
    expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', href)
  }
  expect(screen.getByRole('link', { name: 'Ganges Healers home' })).toHaveAttribute('href', '/')
  expect(screen.getByText(/do not replace, professional medical care/i)).toBeVisible()
})
