import DashboardPage from '@/app/dashboard/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  booking: { findMany: jest.fn() }, communityPost: { findMany: jest.fn() }, courseEnrollment: { findMany: jest.fn() },
} }))
jest.mock('@/app/dashboard/DashboardClient', () => ({ __esModule: true, default: () => null }))
jest.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`) } }))

const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const db = jest.requireMock<{ prisma: Record<string, { findMany: jest.Mock }> }>('@/lib/prisma').prisma
beforeEach(() => {
  jest.clearAllMocks()
  Object.values(db).forEach(model => model.findMany.mockResolvedValue([]))
})

test.each([null, { user: {} }, { user: { id: '' } }])('rejects incomplete sessions before reading dashboard records: %j', async session => {
  auth.mockResolvedValue(session)
  await expect(DashboardPage()).rejects.toThrow('redirect:/auth/signin')
  Object.values(db).forEach(model => expect(model.findMany).not.toHaveBeenCalled())
})

test('scopes bookings and enrollments to the signed-in customer', async () => {
  auth.mockResolvedValue({ user: { id: 'customer' } })
  await DashboardPage()
  expect(db.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      userId: 'customer',
      scheduledAt: { gte: expect.any(Date) },
      status: { in: ['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
    },
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    take: 5,
  }))
  expect(db.courseEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'customer' }) }))
})

test('dashboard community preview excludes soft-deleted posts and deleted comments', async () => {
  auth.mockResolvedValue({ user: { id: 'customer' } })
  await DashboardPage()
  expect(db.communityPost.findMany).toHaveBeenCalledWith({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      user: { select: { name: true, image: true } },
      _count: { select: { comments: { where: { deletedAt: null } }, likes: true } },
    },
  })
})
