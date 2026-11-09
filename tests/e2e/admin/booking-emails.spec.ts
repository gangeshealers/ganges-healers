import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../../scripts/test-database'

test('administrators can record booking email reviews without exposing or changing stored messages', async ({ page }) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = randomUUID()
  const email = `booking-email-admin-${token}@example.test`
  const password = `Test-${token}!`
  const recipient = `private-recipient-${token}@example.test`
  const privatePayload = `private-payload-${token}`
  const privateError = `private-provider-error-${token}`
  const privateReceipt = `private-receipt-${token}`
  const privateLease = `private-lease-${token}`
  const bookingIds = Array.from({ length: 26 }, (_, index) => `booking-email-${token}-${index}`)
  const reviewId = (index: number) => `review-${token}-${index}`
  const users: string[] = []
  let serviceId: string | undefined
  const path = '/admin/booking-emails'
  const activity = page.getByRole('list', { name: 'Booking email activity' })
  async function expectPrivateResponse(...privateValues: string[]) {
    const response = await page.request.get(page.url())
    expect(response.ok()).toBe(true)
    const html = await response.text()
    for (const value of privateValues) {
      expect(html.includes(value), 'The server response must omit private fixture data').toBe(false)
    }
  }

  try {
    const anonymous = await page.request.get(path, { maxRedirects: 0 })
    expect(anonymous.status()).toBe(307)
    expect(anonymous.headers().location).toContain('/auth/signin')

    const admin = await db.user.create({ data: { email, role: 'ADMIN', password: await bcrypt.hash(password, 4) } })
    users.push(admin.id)
    const buyer = await db.user.create({ data: { email: recipient } })
    users.push(buyer.id)
    const practitioner = await db.user.create({ data: { email: `email-healer-${token}@example.test`, role: 'HEALER' } })
    users.push(practitioner.id)
    const healer = await db.healer.create({ data: { userId: practitioner.id } })
    const service = await db.service.create({ data: { slug: `email-review-${token}`, name: 'Booking email fixture', description: 'Isolated browser fixture', category: 'Meditation', price: 100, duration: 30 } })
    serviceId = service.id
    const scheduledAt = new Date(Date.now() + 86_400_000)
    await db.booking.createMany({ data: bookingIds.map(id => ({ id, userId: buyer.id, healerId: healer.id, serviceId: service.id, scheduledAt, durationMin: 30, pricePaise: 10000, status: 'CONFIRMED' })) })
    // Recorded delivery states are isolated fixtures. Visiting the queue never calls a provider.
    await db.bookingEmail.createMany({ data: [
      ...bookingIds.map((bookingId, index) => ({
        id: reviewId(index), bookingId, kind: 'REQUESTED' as const, status: 'REVIEW' as const, attempts: 8,
        createdAt: new Date(Date.UTC(2000, 0, 1, 0, 0, index)), lastError: index === 0 ? 'ATTEMPTS_EXHAUSTED' : privateError,
        payload: { recipient, privatePayload },
      })),
      { id: `accepted-${token}`, bookingId: bookingIds[0], kind: 'CONFIRMED', status: 'SENT', sentAt: new Date(), providerMessageId: privateReceipt, payload: { recipient, privatePayload } },
      { id: `pending-${token}`, bookingId: bookingIds[1], kind: 'CONFIRMED', status: 'PENDING', leaseUntil: new Date(Date.now() + 60_000), claimToken: privateLease, payload: { recipient, privatePayload } },
    ] })
    const readFixtures = () => db.bookingEmail.findMany({ where: { bookingId: { in: bookingIds } }, orderBy: { id: 'asc' } })
    const before = await readFixtures()

    await page.goto('/auth/signin')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
    await page.goto('/admin')
    await page.getByRole('link', { name: 'Booking Emails', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Booking emails', exact: true })).toBeVisible()
    await expect(activity.getByText(`booking-email/${reviewId(0)}`, { exact: true })).toBeVisible()
    await expect(activity.getByText('The automatic attempt limit was reached.')).toBeVisible()
    await expect(activity.getByText(`booking-email/${reviewId(25)}`, { exact: true })).toHaveCount(0)
    await expectPrivateResponse(recipient, privatePayload, privateError)

    await page.getByRole('link', { name: 'Next page' }).click()
    await expect(activity.getByText(`booking-email/${reviewId(25)}`, { exact: true })).toBeVisible()
    await expect(activity.getByText(`booking-email/${reviewId(0)}`, { exact: true })).toHaveCount(0)
    await page.getByLabel('Booking reference', { exact: true }).fill(bookingIds[0])
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    await expect(activity.getByRole('listitem')).toHaveCount(1)
    await expect(activity.getByText(`booking-email/${reviewId(0)}`, { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Provider accepted', exact: true }).click()
    await expect(activity.getByText(`booking-email/accepted-${token}`, { exact: true })).toBeVisible()
    await expect(activity.getByText('Accepted at')).toBeVisible()
    await expectPrivateResponse(recipient, privatePayload, privateReceipt)

    await page.getByRole('link', { name: 'Pending', exact: true }).click()
    await expect(page.getByText('No booking emails match this queue and filter.')).toBeVisible()
    await page.getByRole('link', { name: 'Clear filter', exact: true }).click()
    await expect(page.getByLabel('Booking reference', { exact: true })).toHaveValue('')
    await expect(activity.getByText(`booking-email/pending-${token}`, { exact: true })).toBeVisible()
    await expect(activity.getByText('Eligible after').first()).toBeVisible()
    await expectPrivateResponse(privateLease)

    await page.goto(`${path}?booking=one&booking=two`)
    await expect(page.getByRole('alert')).toHaveText('Enter one valid booking reference.')
    await expect(activity).toHaveCount(0)

    await page.goto(`${path}?booking=${bookingIds[0]}`)
    await activity.getByLabel('Review outcome').selectOption('FOLLOW_UP_COMPLETE')
    await activity.getByRole('button', { name: 'Record review', exact: true }).click()
    await expect(page.getByText('No booking emails match this queue and filter.')).toBeVisible()
    await page.getByRole('link', { name: 'Reviewed', exact: true }).click()
    await expect(activity.getByText(/Customer follow-up completed/)).toBeVisible()
    await expect(activity.getByRole('button', { name: 'Record review', exact: true })).toHaveCount(0)
    await expectPrivateResponse(recipient, privatePayload, privateError)
    const reviews = { action: 'booking_email_reviewed', entityType: 'booking_email' }
    expect(await db.activityLog.findMany({ where: { ...reviews, entityId: reviewId(0) } })).toEqual([
      expect.objectContaining({ userId: admin.id, metadata: { version: expect.any(String), outcome: 'FOLLOW_UP_COMPLETE' } }),
    ])
    expect(await readFixtures()).toEqual(before)

    await page.goto(`${path}?booking=${bookingIds[1]}`)
    await activity.getByLabel('Review outcome').selectOption('NO_FOLLOW_UP')
    await db.user.update({ where: { id: admin.id }, data: { role: 'USER' } })
    await activity.getByRole('button', { name: 'Record review', exact: true }).click()
    await expect(activity.getByRole('alert')).toHaveText('Administrator access is required.')
    expect(await db.activityLog.count({ where: { ...reviews, entityId: reviewId(1) } })).toBe(0)
    const denied = await page.request.get(path, { maxRedirects: 0 })
    expect(denied.status()).toBe(307)
    expect(await denied.text()).not.toContain(reviewId(0))
  } finally {
    try {
      await db.activityLog.deleteMany({ where: { action: 'booking_email_reviewed', entityId: { in: bookingIds.map((_, index) => reviewId(index)) } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      if (serviceId) await db.service.delete({ where: { id: serviceId } })
    } finally { await db.$disconnect() }
  }
})
