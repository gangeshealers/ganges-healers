import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import PublishedPolicyPage from '@/components/legal/PublishedPolicyPage'
import { getPublishedPolicy, POLICY_PAGES } from '@/lib/legal/publication'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const published = await getPublishedPolicy('terms')
  return {
    title: `${POLICY_PAGES.terms.title} | Ganges Healers`,
    description: POLICY_PAGES.terms.description,
    alternates: { canonical: canonicalOf('/terms') },
    ...(!published ? { robots: { index: false, follow: false } } : {}),
  }
}

export default function TermsPage() {
  return <PublishedPolicyPage kind="terms" />
}
