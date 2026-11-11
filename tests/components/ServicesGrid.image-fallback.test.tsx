import { render, screen, within } from '@testing-library/react'
import ServicesGrid from '@/components/services/ServicesGrid'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-testid="service-card-photo" data-src={src} />
  ),
}))

const base = {
  description: 'Guided wellness service',
  price: 1500,
  duration: 60,
  category: 'Wellness',
  averageRating: null,
  totalSessions: 0,
  totalReviews: 0,
}

test('missing and blank service images show a meaningful branded fallback, not a broken photo', () => {
  render(<ServicesGrid services={[
    { ...base, id: 'no-photo', name: 'Yoga Healing', slug: 'yoga-healing' },
    { ...base, id: 'blank-photo', name: 'Reiki', slug: 'reiki', image: '   ' },
  ]} />)
  const cards = screen.getAllByTestId('service-card-image-fallback')
  expect(cards).toHaveLength(2)
  cards.forEach(card => {
    expect(card).toHaveAttribute('aria-hidden', 'true')
    expect(card).toHaveTextContent('Ganges Healers')
  })
  expect(screen.queryByTestId('service-card-photo')).not.toBeInTheDocument()
  const yoga = screen.getByRole('link', { name: /Yoga Healing/i })
  expect(yoga).toHaveAttribute('href', '/services/yoga-healing')
  expect(within(yoga).getByRole('heading', { name: 'Yoga Healing' })).toBeVisible()
})

test('approved service photos continue to render with service name alt text', () => {
  render(<ServicesGrid services={[
    { ...base, id: 'photo', name: 'Sound Healing', slug: 'sound-healing', image: ' https://assets.example.test/healing.webp ' },
  ]} />)
  expect(screen.queryByTestId('service-card-image-fallback')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Sound Healing' })).toHaveAttribute('data-src', 'https://assets.example.test/healing.webp')
  expect(screen.getByRole('link', { name: /Sound Healing/i })).toHaveAttribute('href', '/services/sound-healing')
})
