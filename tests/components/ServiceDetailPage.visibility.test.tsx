import '../mocks/service-detail'
import { prisma } from '@/lib/prisma'
import ServiceDetailPage, { generateMetadata } from '@/app/services/[slug]/page'

jest.mock('@/components/booking/BookingModal', () => ({ __esModule: true, default: () => null }))

beforeEach(() => {
  jest.clearAllMocks()
})

test('public service page only reads active services and displays verified healers', async () => {
  await ServiceDetailPage({
    params: Promise.resolve({ slug: 'yoga-healing' }),
    searchParams: Promise.resolve({}),
  })
  expect(prisma.service.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { slug: 'yoga-healing', isActive: true },
  }))
  expect(prisma.healer.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      isActive: true,
      isVerified: true,
      specializations: { has: 'Yoga Healing' },
    },
  }))
})

test('service metadata excludes archived service content', async () => {
  await generateMetadata({ params: Promise.resolve({ slug: 'yoga-healing' }) })
  expect(prisma.service.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { slug: 'yoga-healing', isActive: true },
  }))
})
