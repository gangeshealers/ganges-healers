import { render, screen, within } from '@testing-library/react'
import HeroSection from '@/components/home/HeroSection'

test('homepage hero offers four real discovery destinations without fictitious trust stats', () => {
  render(<HeroSection />)
  const hero = screen.getByRole('region', { name: 'Transform Your Mind, Body & Spirit' })
  expect(within(hero).getByRole('heading', { name: 'Transform Your Mind, Body & Spirit' })).toBeVisible()
  expect(within(hero).getByRole('link', { name: 'Start Your Healing Journey' })).toHaveAttribute('href', '/services')
  expect(within(hero).getByRole('link', { name: 'Explore Free Audio' })).toHaveAttribute('href', '/audio')
  for (const [label, href] of [
    ['Personal healing sessions Explore one-to-one services and practitioners.', '/services'],
    ['Guided transformation Find structured, multi-session programs.', '/programs'],
    ['Learn at your pace Browse courses and individual lessons.', '/courses'],
    ['Find a moment of calm Listen to guided audio and meditations.', '/audio'],
  ]) {
    expect(within(hero).getByRole('link', { name: label })).toHaveAttribute('href', href)
  }
  expect(within(hero).queryByText(/five stars|thousands of satisfied|guaranteed healing/i)).not.toBeInTheDocument()
})
