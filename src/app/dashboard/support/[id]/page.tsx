import type { Metadata } from 'next'
import SupportConversationPage from '@/components/support/SupportConversationPage'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Support conversation | Ganges Healers',
  robots: { index: false, follow: false },
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  return <SupportConversationPage id={id} scope="member" page={query.page} />
}
