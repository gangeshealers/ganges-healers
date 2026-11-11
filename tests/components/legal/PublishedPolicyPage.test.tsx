import { render, screen } from '@testing-library/react'
import PublishedPolicyPage from '@/components/legal/PublishedPolicyPage'
import { getPublishedPolicy } from '@/lib/legal/publication'
import { generateMetadata as privacyMetadata } from '@/app/privacy/page'
import { generateMetadata as termsMetadata } from '@/app/terms/page'

jest.mock('@/lib/legal/publication', () => ({
  POLICY_PAGES: {
    privacy: { slug: 'privacy-policy', title: 'Privacy Policy', description: 'Published Ganges Healers privacy information.' },
    terms: { slug: 'terms-of-service', title: 'Terms of Service', description: 'Published Ganges Healers service terms.' },
  },
  getPublishedPolicy: jest.fn(),
}))

const getPolicy = getPublishedPolicy as jest.Mock

beforeEach(() => jest.clearAllMocks())

test('missing legal text is identified as unavailable and cannot be indexed', async () => {
  getPolicy.mockResolvedValue(null)
  render(await PublishedPolicyPage({ kind: 'privacy' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy is not published yet' })).toBeInTheDocument()
  expect(screen.getByText(/not a policy or a legal agreement/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', '/dashboard/support')
  const meta = await privacyMetadata()
  expect(meta.robots).toEqual({ index: false, follow: false })
})

test('published terms render escaped article text and a real revision date', async () => {
  getPolicy.mockResolvedValue({
    slug: 'terms-of-service', title: 'Terms of Service', content: 'Approved commercial terms, line 1\nLine 2',
    updatedAt: new Date('2026-11-11T00:00:00.000Z'),
  })
  render(await PublishedPolicyPage({ kind: 'terms' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
  expect(screen.getByText(/Approved commercial terms, line 1/)).toBeInTheDocument()
  expect(screen.getByText(/Last updated/)).toBeInTheDocument()
  expect((await termsMetadata()).robots).toBeUndefined()
})
