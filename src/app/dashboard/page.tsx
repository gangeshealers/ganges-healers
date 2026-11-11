import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - local client component resolution (Next build will transpile)
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const [bookings, recentPosts, courseEnrollments] = await Promise.all([
    prisma.booking.findMany({
      // The dashboard is an upcoming snapshot, not an oldest-first lifetime history.
      where: {
        userId: session.user.id,
        scheduledAt: { gte: new Date() },
        status: { in: ['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: 5,
      include: { service: true, healer: { include: { user: true } }, payment: true },
    }),
    prisma.communityPost.findMany({
      // Dashboard previews must follow the same moderation boundary as the public feed.
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: {
        user: { select: { name: true, image: true } },
        _count: { select: { comments: { where: { deletedAt: null } }, likes: true } },
      },
    }),
    prisma.courseEnrollment.findMany({
      where: { userId: session.user.id, status: { in: ['active', 'completed'] } },
      take: 3,
      orderBy: { createdAt: 'desc' },
      include: { course: { include: { _count: { select: { lessons: true } } } } },
    }),
  ])

  return <DashboardClient bookings={bookings} recentPosts={recentPosts} courseEnrollments={courseEnrollments} />
}
