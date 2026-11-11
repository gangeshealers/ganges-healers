import type { Metadata } from 'next'
import HelpCenter from '@/components/help/HelpCenter'
import { canonicalOf } from '@/config/site'

export const metadata: Metadata = {
  title: 'Help Center | Ganges Healers',
  description: 'Find guidance for session bookings, cancellation and refunds, store orders, courses, programs and account settings.',
  alternates: { canonical: canonicalOf('/help') },
}

export default function HelpPage() {
  return <HelpCenter />
}
