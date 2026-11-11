import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { healerActivityStart } from "@/lib/healer/payment-activity"

export const dynamic = "force-dynamic"

export default async function HealerDashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const healer = await prisma.healer.findUnique({
    where: { userId: session.user.id },
  })
  if (!healer) redirect("/dashboard")

  // Fetch upcoming bookings
  const now = new Date()
  const upcomingBookings = await prisma.booking.findMany({
    where: {
      healerId: healer.id,
      scheduledAt: { gte: now },
      status: { notIn: ["CANCELLED", "COMPLETED"] },
    },
    include: {
      user: { select: { name: true, email: true } },
      service: { select: { name: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 5,
  })

  const upcomingCount = await prisma.booking.count({
    where: {
      healerId: healer.id,
      scheduledAt: { gte: now },
      status: { notIn: ["CANCELLED", "COMPLETED"] },
    },
  })

  // Earnings
  const monthStart = healerActivityStart('month', now)!

  const totalAgg = await prisma.payment.aggregate({
    where: { booking: { healerId: healer.id }, statusEnum: "SUCCESS" },
    _sum: { amountPaise: true },
    _count: { id: true },
  })

  const monthAgg = await prisma.payment.aggregate({
    where: {
      booking: { healerId: healer.id },
      statusEnum: "SUCCESS",
      createdAt: { gte: monthStart },
    },
    _sum: { amountPaise: true },
  })

  const totalPaise = totalAgg._sum.amountPaise ?? 0
  const thisMonthPaise = monthAgg._sum.amountPaise ?? 0

  const statusColor: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    PENDING: "outline",
    SCHEDULED: "secondary",
    CONFIRMED: "default",
    RESCHEDULED: "secondary",
    COMPLETED: "default",
    CANCELLED: "destructive",
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Healer Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Upcoming Bookings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{upcomingCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Gross Session Collections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              ₹{(totalPaise / 100).toLocaleString("en-IN")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Collected This Month (IST)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              ₹{(thisMonthPaise / 100).toLocaleString("en-IN")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Rating
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {healer.rating > 0 ? healer.rating.toFixed(1) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Gross successful session payments shown above are not practitioner payouts or net compensation.
        <Link href="/healer/payments" className="ml-2 font-semibold text-primary underline-offset-4 hover:underline">View payment activity</Link>
      </p>

      {/* Upcoming Bookings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Next Upcoming</h2>
          <Link
            href="/healer/bookings"
            className="text-sm text-primary hover:underline"
          >
            View all →
          </Link>
        </div>

        {upcomingBookings.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No upcoming bookings
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingBookings.map((b) => (
              <Card key={b.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {b.user.name || b.user.email}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {b.service.name}
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-sm">
                      {format(new Date(b.scheduledAt), "MMM d, yyyy · h:mm a")}
                    </p>
                    <Badge variant={statusColor[b.status] ?? "outline"}>
                      {b.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/healer/bookings">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="py-4 text-center text-sm font-medium">
              Manage Bookings
            </CardContent>
          </Card>
        </Link>
        <Link href="/healer/availability">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="py-4 text-center text-sm font-medium">
              Edit Availability
            </CardContent>
          </Card>
        </Link>
        <Link href="/healer/profile">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="py-4 text-center text-sm font-medium">
              Edit Profile
            </CardContent>
          </Card>
        </Link>
        <Link href="/healer/payments">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="py-4 text-center text-sm font-medium">
              Session Payments
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
