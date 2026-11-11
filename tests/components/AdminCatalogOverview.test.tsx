import { render, screen, within } from '@testing-library/react'
import { AdminCatalogOverview } from '@/components/admin/catalog-overview'

test('admin content inventory links to real workspaces and distinguishes empty from active catalogs', () => {
  render(<AdminCatalogOverview items={[
    { label: 'Services', count: 10, href: '/admin/services', meaning: 'Active healing services' },
    { label: 'Courses', count: 0, href: '/admin/courses', meaning: 'Active self-paced courses' },
  ]} />)

  const heading = screen.getByRole('heading', { name: 'Catalog overview' })
  expect(heading).toBeVisible()
  const section = heading.closest('section')!
  expect(within(section).getByLabelText('10 Active healing services')).toBeVisible()
  expect(within(section).getByLabelText('0 Active self-paced courses')).toBeVisible()
  expect(within(section).getByRole('link', { name: 'Open Services workspace' })).toHaveAttribute('href', '/admin/services')
  expect(within(section).getByRole('link', { name: 'Open Courses workspace' })).toHaveAttribute('href', '/admin/courses')
  expect(within(section).getByText(/Counts help you find missing content; they do not certify launch readiness/)).toBeVisible()
  expect(within(section).getByText('No entries currently visible in this section.')).toBeVisible()
})
