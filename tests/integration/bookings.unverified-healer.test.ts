import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'
import { POST as createBooking } from '@/app/api/bookings/route'
import { GET as publicAvailability } from '@/app/api/availability/route'

jest.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: process.env.TEST_VERIFIED_BOOKING_MEMBER_ID } }),
}))

describe('new booking verification policy with database-backed handlers', () => {
  const suffix = randomUUID()
  let memberId: string
  let healerUserId: string
  let healerId: string
  let serviceId: string
  const day = clinicDate(new Date(Date.now() + 7 * 86400000))
  const slot = clinicSlotInstant(day, '11:00')

  beforeAll(async () => {
    memberId = (await prisma.user.create({ data: { email: 'unverified-booking-member-' + suffix + '@example.test' } })).id
    process.env.TEST_VERIFIED_BOOKING_MEMBER_ID = memberId
    const healer = await prisma.healer.create({
      data: {
        isActive: true,
        isVerified: false,
        availability: {
          monday: { start: '09:00', end: '17:00' },
          tuesday: { start: '09:00', end: '17:00' },
          wednesday: { start: '09:00', end: '17:00' },
          thursday: { start: '09:00', end: '17:00' },
          friday: { start: '09:00', end: '17:00' },
          saturday: { start: '09:00', end: '17:00' },
          sunday: { start: '09:00', end: '17:00' },
        },
        user: { create: { email: 'unverified-booking-healer-' + suffix + '@example.test', role: 'HEALER' } },
      },
    })
    healerId = healer.id
    healerUserId = healer.userId
    serviceId = (await prisma.service.create({
      data: { slug: 'unverified-booking-' + suffix, name: 'Unverified practitioner fixture', description: 'Isolated booking eligibility fixture', category: 'Fixture', price: 100, duration: 60, isActive: true },
    })).id
  })

  afterAll(async () => {
    try {
      if (memberId) await prisma.user.delete({ where: { id: memberId } })
      if (healerUserId) await prisma.user.delete({ where: { id: healerUserId } })
      if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
    } finally {
      delete process.env.TEST_VERIFIED_BOOKING_MEMBER_ID
      await prisma.$disconnect()
    }
  })

  it('returns no discoverable availability for an unverified healer', async () => {
    const url = new URL('http://localhost/api/availability')
    url.searchParams.set('healerId', healerId)
    url.searchParams.set('serviceId', serviceId)
    url.searchParams.set('date', day)
    const result = await publicAvailability(new NextRequest(url))
    expect(result.status).toBe(200)
    expect((await result.json()).data.slots).toEqual([])
  })

  it('refuses direct new-booking POST even with a valid healer ID and open working hours', async () => {
    const req = new NextRequest('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ healerId, serviceId, scheduledAt: slot.toISOString() }),
    })
    const result = await createBooking(req)
    expect(result.status).toBe(409)
    expect((await result.json()).error).toMatch(/unavailable for new bookings/)
    expect(await prisma.booking.count({ where: { healerId, userId: memberId } })).toBe(0)
  })
})
