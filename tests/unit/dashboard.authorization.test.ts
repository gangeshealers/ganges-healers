import DashboardPage from '@/app/dashboard/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  booking: { findMany: jest.fn() }, communityPost: { findMany: jest.fn() }, courseEnrollment: { findMany: jest.fn() },
  notification: { count: jest.fn() },
} }))
jest.mock('@/lib/programs/enrollments', () => ({ listMemberProgramPreviews: jest.fn().mockResolvedValue([]) }))
jest.mock('@/app/dashboard/DashboardClient', () => ({ __esModule: true, default: () => null }))
jest.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`) } }))

const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const db = jest.requireMock<{ prisma: { booking: { findMany: jest.Mock }; communityPost: { findMany: jest.Mock }; courseEnrollment: { findMany: jest.Mock }; notification: { count: jest.Mock } } }>('@/lib/prisma').prisma
const programs = jest.requireMock<{ listMemberProgramPreviews: jest.Mock }>('@/lib/programs/enrollments').listMemberProgramPreviews
beforeEach(() => {
  jest.clearAllMocks()
  ;[db.booking, db.communityPost, db.courseEnrollment].forEach(model => model.findMany.mockResolvedValue([]))
  db.notification.count.mockResolvedValue(2)
})

test.each([null, { user: {} }, { user: { id: '' } }])('rejects incomplete sessions before reading dashboard records: %j', async session => {
  auth.mockResolvedValue(session)
  await expect(DashboardPage()).rejects.toThrow('redirect:/auth/signin')
  ;[db.booking, db.communityPost, db.courseEnrollment].forEach(model => expect(model.findMany).not.toHaveBeenCalled())
  expect(db.notification.count).not.toHaveBeenCalled()
  expect(programs).not.toHaveBeenCalled()
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
  expect(db.notification.count).toHaveBeenCalledWith({ where: { userId: 'customer', read: false } })
  expect(programs).toHaveBeenCalledWith('customer', expect.any(Date))
})

test('dashboard community preview excludes soft-deleted posts and deleted comments', async () => {
  auth.mockResolvedValue({ user: { id: 'customer' } })
  await DashboardPage()
  expect(db.communityPost.findMany).toHaveBeenCalledWith({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true, title: true,
      user: { select: { name: true } },
      _count: { select: { comments: { where: { deletedAt: null } }, likes: true } },
    },
  })
})

test('dashboard reads display fields without private practitioner profiles or payment payloads', async () => {
  auth.mockResolvedValue({ user: { id: 'customer', name: 'Member' } })
  const page = await DashboardPage()
  const bookingQuery = db.booking.findMany.mock.calls[0][0]
  expect(bookingQuery.include).toBeUndefined()
  expect(bookingQuery.select.healer).toEqual({ select: { user: { select: { name: true } } } })
  expect(Object.keys(bookingQuery.select.payment.select).sort()).toEqual(['gateway', 'gatewayPaymentId', 'id', 'paymentId', 'status', 'statusEnum'])
  const courseQuery = db.courseEnrollment.findMany.mock.calls[0][0]
  expect(courseQuery.select.course.select.lessons.select).toEqual({ id: true, order: true, title: true })
  expect(courseQuery.where).toEqual({ userId: 'customer', status: { in: ['active', 'completed'] } })
  expect(page.props).toMatchObject({ name: 'Member', unreadCount: 2, programs: [] })
})
