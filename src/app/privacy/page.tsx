import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import PublishedPolicyPage from '@/components/legal/PublishedPolicyPage'
import { getPublishedPolicy, POLICY_PAGES } from '@/lib/legal/publication'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const published = await getPublishedPolicy('privacy')
  return {
    title: `${POLICY_PAGES.privacy.title} | Ganges Healers`,
    description: POLICY_PAGES.privacy.description,
    alternates: { canonical: canonicalOf('/privacy') },
    ...(!published ? { robots: { index: false, follow: false } } : {}),
  }
}

export default function PrivacyPage() {
  return <PublishedPolicyPage kind="privacy" />
}
