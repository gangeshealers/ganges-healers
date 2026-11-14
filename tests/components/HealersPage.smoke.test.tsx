/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react'

jest.mock('@/lib/healers/queries', () => ({
  parseHealerDirectorySort: (value: unknown) => value === 'experience' ? 'experience' : 'default',
  getHealerServiceOptions: jest.fn(async () => [{ slug: 'yoga-healing', name: 'Yoga Therapy' }, { slug: 'reiki-healing', name: 'Reiki Healing' }]),
  listHealers: jest.fn(async () => ({
    items: [
      { id: 'h1', slug: 'h1', name: 'Alice', title: 'Yoga Healer', yearsExperience: 5, ratingAvg: 4.8, reviewCount: 2, avatarUrl: null, shortBio: 'Bio A', services: [{ slug: 'yoga-healing', title: 'Yoga Therapy' }] },
      { id: 'h2', slug: 'h2', name: 'Bob', title: 'Reiki Healer', yearsExperience: 3, ratingAvg: 0, reviewCount: 0, avatarUrl: null, shortBio: 'Bio B', services: [{ slug: 'reiki-healing', title: 'Reiki Healing' }] },
    ],
    nextCursor: null,
  }))
}))

import HealersPage from '@/app/healers/page'

describe('HealersPage smoke', () => {
  test('service names and accessible labels preserve the existing query fields', async () => {
    render(await HealersPage({ searchParams: Promise.resolve({ q: 'Yoga', serviceSlug: 'yoga-healing' }) }))
    expect(screen.getByRole('form', { name: 'Find healers' })).toHaveAttribute('action', '/healers')
    expect(screen.getByRole('textbox', { name: 'Search healers' })).toHaveValue('Yoga')
    expect(screen.getByRole('combobox', { name: 'Service' })).toHaveValue('yoga-healing')
    expect(screen.getByRole('combobox', { name: 'Sort healers' })).toHaveValue('default')
    expect(screen.getByRole('option', { name: 'Yoga Therapy' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All services' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Service slug (optional)')).not.toBeInTheDocument()
  })
  test('sort selection survives a filtered search and uses the existing endpoint', async () => {
    render(await HealersPage({ searchParams: Promise.resolve({ sort: 'experience', q: 'Yoga', serviceSlug: 'yoga-healing' }) }))
    const form = screen.getByRole('form', { name: 'Find healers' }) as HTMLFormElement
    expect(new FormData(form).get('sort')).toBe('experience')
    expect(screen.getByRole('combobox', { name: 'Sort healers' })).toHaveValue('experience')
    expect(new FormData(form).get('serviceSlug')).toBe('yoga-healing')
  })
  test('renders healer cards with names and ratings', async () => {
    const el = await (HealersPage as any)({ searchParams: Promise.resolve({}) })
    render(el)
  expect(screen.getByRole('heading', { level: 1, name: 'Healers' })).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText(/⭐ 4\.8 \(2 reviews\)/)).toBeInTheDocument()
    expect(screen.getByText(/No reviews yet/)).toBeInTheDocument()
  })
})
