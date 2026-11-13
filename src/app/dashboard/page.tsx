import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import type { Metadata } from 'next'
import { listMemberProgramPreviews } from '@/lib/programs/enrollments'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your Dashboard | Ganges Healers', robots: { index: false, follow: false } }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const now = new Date()
  const [bookings, recentPosts, courseEnrollments, programs, unreadCount] = await Promise.all([
    prisma.booking.findMany({
      // The dashboard is an upcoming snapshot, not an oldest-first lifetime history.
      where: {
        userId: session.user.id,
        scheduledAt: { gte: now },
        status: { in: ['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: 5,
      select: {
        id: true, status: true, scheduledAt: true,
        service: { select: { name: true } },
        healer: { select: { user: { select: { name: true } } } },
        payment: { select: { id: true, paymentId: true, gatewayPaymentId: true, status: true, statusEnum: true, gateway: true } },
      },
    }),
    prisma.communityPost.findMany({
      // Dashboard previews must follow the same moderation boundary as the public feed.
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true, title: true,
        user: { select: { name: true } },
        _count: { select: { comments: { where: { deletedAt: null } }, likes: true } },
      },
    }),
    prisma.courseEnrollment.findMany({
      where: { userId: session.user.id, status: { in: ['active', 'completed'] } },
      take: 3,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, status: true, progress: true,
        course: { select: {
          slug: true, title: true, isActive: true,
          lessons: { orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { id: true, order: true, title: true } },
        } },
      },
    }),
    listMemberProgramPreviews(session.user.id, now),
    prisma.notification.count({ where: { userId: session.user.id, read: false } }),
  ])

  return <DashboardClient name={session.user.name} bookings={bookings} recentPosts={recentPosts} courseEnrollments={courseEnrollments} programs={programs} unreadCount={unreadCount} />
}
