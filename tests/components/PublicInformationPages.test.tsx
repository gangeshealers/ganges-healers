import { render, screen, within } from '@testing-library/react'
import AboutPage from '@/app/about/page'
import ContactPage from '@/app/contact/page'
import SiteFooter from '@/components/navigation/SiteFooter'

describe('public company information and contact routes', () => {
  test('About page links to available discovery and support routes without invented contact details', () => {
    render(<AboutPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'A place to explore your wellness journey' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Meet the healers' })).toHaveAttribute('href', '/healers')
    expect(screen.getByRole('link', { name: 'Contact and support' })).toHaveAttribute('href', '/contact')
    expect(screen.getByText(/not a diagnosis, medical treatment/i)).toBeInTheDocument()
  })

  test('Contact page uses the existing private support and help workspaces', () => {
    render(<ContactPage />)
    expect(screen.getByRole('heading', { level: 1, name: "We're here to help you find answers" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open support center' })).toHaveAttribute('href', '/dashboard/support')
    expect(screen.getByRole('link', { name: 'Browse help topics' })).toHaveAttribute('href', '/help')
    expect(screen.getByRole('link', { name: 'Orders and purchases' })).toHaveAttribute('href', '/dashboard/orders')
    expect(screen.getByText(/not a monitored emergency channel/i)).toBeInTheDocument()
  })

  test('Footer presents links to public information and publish-gated policies', () => {
    render(<SiteFooter />)
    const nav = screen.getByRole('navigation', { name: 'Footer navigation' })
    expect(within(nav).getByRole('link', { name: 'About Ganges Healers' })).toHaveAttribute('href', '/about')
    expect(within(nav).getByRole('link', { name: 'Contact and support' })).toHaveAttribute('href', '/contact')
    expect(within(nav).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(within(nav).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
  })
})
