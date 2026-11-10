import { render, screen } from '@testing-library/react'
import HealersPage from '@/app/healers/page'

jest.mock('@/lib/healers/queries', () => ({
  getHealerServiceOptions: jest.fn(async () => []),
  listHealers: jest.fn(async () => ({ items: [], nextCursor: null }))
}))

describe('HealersPage empty state', () => {
  test('shows empty copy and clear filters when filters present', async () => {
    const ui = (await HealersPage({ searchParams: Promise.resolve({ q: 'a', serviceSlug: 'x' }) })) as unknown as React.ReactElement
    render(ui)
    expect(screen.getByText('No healers found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /clear filters/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Service' })).toHaveValue('x')
    expect(screen.getByRole('combobox', { name: 'Service' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('option', { name: 'Unavailable service' })).toBeInTheDocument()
    expect(new FormData(screen.getByRole('form', { name: 'Find healers' }) as HTMLFormElement).get('serviceSlug')).toBe('x')
  })
})
