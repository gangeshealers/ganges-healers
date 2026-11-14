import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { authPathWithCallback } from '@/lib/auth/callback-url'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import MetricsDashboardClient from './MetricsDashboardClient'

export const dynamic = 'force-dynamic'

export default async function AdminPaymentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect(authPathWithCallback('/auth/signin', '/admin/payments'))
  if (session.user.role !== 'ADMIN') notFound()
  try {
    await requireCurrentAdmin()
  } catch (error) {
    if ((error as { status?: number })?.status === 403) notFound()
    throw error
  }
  return <MetricsDashboardClient />
}
