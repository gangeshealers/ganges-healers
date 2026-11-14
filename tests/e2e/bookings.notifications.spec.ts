import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'
import { clinicDate, clinicSlotInstant } from '../../src/lib/bookings/time'

test('customers and practitioners receive owned booking lifecycle notices with useful destinations and stable read state', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(240_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const practitioner = await browser.newContext({ baseURL })
  const token = randomUUID(), users: string[] = []
  let serviceId = ''
  try {
    const customerLogin = await page.goto(`/api/test/login?role=USER&vip=1&credits=3&email=booking-inbox-${token}@example.test`)
    expect(customerLogin?.ok()).toBeTruthy()
    const customerId = (await customerLogin!.json()).userId as string
    users.push(customerId)
    const initialCredits = (await db.user.findUniqueOrThrow({ where: { id: customerId } })).freeSessionCredits
    const healerLogin = await practitioner.request.get(`/api/test/login?role=HEALER&email=booking-inbox-healer-${token}@example.test`)
    expect(healerLogin.ok()).toBeTruthy()
    const practitionerId = (await healerLogin.json()).userId as string
    users.push(practitionerId)
    const availability = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, { start: '09:00', end: '20:00' }]))
    const healer = await db.healer.upsert({ where: { userId: practitionerId }, update: { isActive: true, isVerified: true, availability }, create: { userId: practitionerId, isActive: true, isVerified: true, availability } })
    const service = await db.service.create({ data: { slug: `booking-inbox-${token}`, name: 'Inbox lifecycle appointment', description: 'Isolated browser fixture', category: 'Fixture', duration: 60, price: 100 } })
    serviceId = service.id
    const day = (offset: number) => clinicDate(new Date(Date.now() + offset * 86400000))
    const created = await page.request.post('/api/bookings', { data: { healerId: healer.id, serviceId, scheduledAt: clinicSlotInstant(day(22), '10:00').toISOString() } })
    expect(created.status()).toBe(201)
    const bookingId = (await created.json()).data.id as string
    const healerPage = await practitioner.newPage()
    await page.goto('/dashboard/notifications')
    await expect(page.getByRole('article', { name: 'Booking request received', exact: true })).toContainText('awaiting confirmation')
    await healerPage.goto('/dashboard/notifications')
    const requestNotice = healerPage.getByRole('article', { name: 'New booking request', exact: true })
    await expect(requestNotice).toBeVisible()
    await requestNotice.getByRole('button', { name: 'Mark as read', exact: true }).click()
    await expect(requestNotice.getByRole('button', { name: 'Mark as unread', exact: true })).toBeVisible()
    const originalHealer = await (await practitioner.request.get('/api/notifications?type=booking')).json()
    const readId = originalHealer.notifications[0].id as string

    expect((await page.request.post(`/api/bookings/${bookingId}/confirm-with-credits`)).status()).toBe(200)
    expect((await page.request.post(`/api/bookings/${bookingId}/confirm-with-credits`)).status()).toBe(400)
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Booking confirmed', exact: true })).toBeVisible()
    const current = (await (await page.request.get(`/api/bookings/${bookingId}`)).json()).data
    const movedTo = clinicSlotInstant(day(24), '11:00').toISOString()
    const moved = await page.request.put(`/api/bookings/${bookingId}`, { headers: { 'if-match': `"${current.reviewVersion}"` }, data: { scheduledAt: movedTo } })
    expect(moved.status()).toBe(200)
    const reviewVersion = (await moved.json()).data.reviewVersion as string
    expect((await page.request.put(`/api/bookings/${bookingId}`, { data: { scheduledAt: movedTo } })).status()).toBe(200)
    const cancelled = await page.request.delete(`/api/bookings/${bookingId}`, { headers: { 'if-match': `"${reviewVersion}"` } })
    expect(cancelled.status()).toBe(200)
    expect((await cancelled.json()).refund).toMatchObject({ status: 'NOT_REQUIRED', refundPaise: 0 })
    expect((await page.request.patch(`/api/bookings/${bookingId}`, { data: { action: 'cancel' } })).status()).toBe(200)

    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.getByLabel('Activity type').selectOption('booking')
    await expect(page.getByRole('article')).toHaveCount(4)
    const customerCancel = page.getByRole('article', { name: 'Booking cancelled', exact: true })
    await expect(customerCancel).toContainText('saved refund outcome')
    await customerCancel.getByRole('link', { name: 'View my bookings' }).click()
    await expect(page).toHaveURL(/\/dashboard\/bookings$/)
    await page.getByRole('tab', { name: /Past/ }).click()
    await expect(page.getByRole('region', { name: 'Cancellation outcome' })).toContainText('No cash refund is due')

    await healerPage.getByRole('button', { name: 'Refresh', exact: true }).click()
    await healerPage.getByLabel('Activity type').selectOption('booking')
    await expect(healerPage.getByRole('article')).toHaveCount(4)
    const healerCancel = healerPage.getByRole('article', { name: 'Appointment cancelled', exact: true })
    await healerCancel.getByRole('link', { name: 'View practitioner bookings' }).click()
    await expect(healerPage).toHaveURL(/\/healer\/bookings$/)
    await healerPage.getByRole('tab', { name: /Past/ }).click()
    await expect(healerPage.getByText('Inbox lifecycle appointment', { exact: true })).toBeVisible()
    expect((await db.notification.findUniqueOrThrow({ where: { id: readId } })).read).toBe(true)
    const customerInbox = await (await page.request.get(`/api/notifications?type=booking&userId=${practitionerId}`)).json()
    expect(customerInbox.notifications).toHaveLength(4)
    expect(customerInbox.notifications.every((row: { userId: string }) => row.userId === customerId)).toBe(true)
    expect((await practitioner.request.patch(`/api/notifications/${customerInbox.notifications[0].id}/read`, { data: { read: false } })).status()).toBe(404)
    expect((await db.user.findUniqueOrThrow({ where: { id: customerId } })).freeSessionCredits).toBe(initialCredits - 1)
    await page.goto('/dashboard/notifications')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('article')).toHaveCount(4)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: testInfo.outputPath('booking-inbox-mobile.png'), fullPage: true })
  } finally {
    await practitioner.close()
    try {
      await db.activityLog.deleteMany({ where: { userId: { in: users } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      if (serviceId) await db.service.delete({ where: { id: serviceId } })
    } finally { await db.$disconnect() }
  }
})
