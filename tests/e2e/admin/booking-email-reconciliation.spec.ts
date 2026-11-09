import crypto from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../../scripts/test-database'

async function database() {
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  return new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
}
async function fixtures(db: PrismaClient, token: string, count: number, active = false) {
  const user = await db.user.create({ data: { email: `delivery-customer-${token}@example.test`, name: 'Delivery review customer' } })
  const service = await db.service.findUniqueOrThrow({ where: { slug: 'yoga-therapy' } })
  const healer = await db.healer.findFirstOrThrow({ where: { isActive: true, isVerified: true } })
  const scheduledAt = new Date(Date.now() + 14 * 86400000)
  const bookingIds = Array.from({ length: count }, (_, i) => `delivery-booking-${token}-${i}`)
  const eventIds = Array.from({ length: count }, (_, i) => `delivery-event-${token}-${i}`)
  await db.booking.createMany({ data: bookingIds.map(id => ({ id, userId: user.id, healerId: healer.id, serviceId: service.id, scheduledAt, durationMin: 60, pricePaise: 10000, status: 'CONFIRMED' as const })) })
  await db.bookingEmail.createMany({ data: eventIds.map((id, i) => ({
    id, bookingId: bookingIds[i], kind: 'CONFIRMED' as const, status: active ? 'PENDING' as const : 'REVIEW' as const,
    attempts: 2, firstAttemptAt: new Date(Date.now() - 60000), createdAt: new Date(1000 + i),
    leaseUntil: active ? new Date(Date.now() + 120000) : null, claimToken: active ? 'private-active-claim' : null,
    lastError: 'PROVIDER_UNCONFIRMED', payload: { message: { from: 'Fixture <fixture@example.test>', to: user.email, subject: 'Fixture delivery', html: '<p>PRIVATE_FROZEN_MESSAGE_BODY</p>' }, scheduledAt: scheduledAt.toISOString(), healerId: healer.id, serviceId: service.id },
  })) })
  return { user, bookingIds, eventIds }
}
async function cleanup(db: PrismaClient, actorIds: string[], customerId: string) {
  try {
    if (actorIds.length) { await db.activityLog.deleteMany({ where: { userId: { in: actorIds } } }); await db.user.deleteMany({ where: { id: { in: actorIds } } }) }
    if (customerId) await db.user.deleteMany({ where: { id: customerId } })
  } finally { await db.$disconnect() }
}

test('staff page bounds review queues and records a fresh verified outcome without changing the appointment or payment', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000)
  const db = await database(), token = crypto.randomUUID()
  const actors: string[] = []
  let customerId = ''
  try {
    const login = await page.goto(`/api/test/login?role=ADMIN&email=delivery-admin-${token}@example.test`)
    expect(login?.ok()).toBeTruthy()
    const actorId = (await login!.json()).userId as string
    actors.push(actorId)
    const fixture = await fixtures(db, token, 27)
    customerId = fixture.user.id
    const eventId = fixture.eventIds[26], bookingId = fixture.bookingIds[26]
    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } })
    const payment = await db.payment.create({ data: { userId: customerId, bookingId, type: 'SESSION', gateway: 'razorpay', status: 'success', statusEnum: 'SUCCESS', amountPaise: 10000 } })
    await page.goto('/admin')
    await page.getByRole('link', { name: 'Booking Emails', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Booking emails', exact: true })).toBeVisible()
    await expect(page.locator(`a[href^="/admin/booking-emails/delivery-event-${token}"]`)).toHaveCount(25)
    await page.getByRole('link', { name: 'Next page', exact: true }).click()
    await expect(page).toHaveURL(/page=2$/)
    await expect(page.locator(`a[href^="/admin/booking-emails/delivery-event-${token}"]`)).toHaveCount(2)
    await page.locator(`a[href="/admin/booking-emails/${eventId}"]`).click()
    await expect(page.getByRole('heading', { name: 'Booking email delivery', exact: true })).toBeVisible()
    await expect(page.getByText(fixture.user.email, { exact: true })).toBeVisible()
    const privateResponse = await page.request.get(page.url())
    expect(await privateResponse.text()).not.toMatch(/PRIVATE_FROZEN_MESSAGE_BODY|private-active-claim/)
    const providerId = `provider-${token}`
    await page.getByLabel('Verified provider message ID', { exact: true }).fill(providerId)
    await page.getByLabel('Reason for decision', { exact: true }).fill('Verified the fixture acceptance in provider records')
    await page.getByRole('button', { name: 'Record provider acceptance', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Record verified acceptance?' })).toBeVisible()
    const reviewed = await db.bookingEmail.findUniqueOrThrow({ where: { id: eventId } })
    await db.bookingEmail.update({ where: { id: eventId }, data: { attempts: 3, updatedAt: reviewed.updatedAt } })
    await page.getByRole('button', { name: 'Confirm acceptance', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Review delivery outcome' }).getByRole('alert')).toContainText('changed since you reviewed')
    expect((await db.bookingEmail.findUniqueOrThrow({ where: { id: eventId } })).status).toBe('REVIEW')
    expect(await db.activityLog.count({ where: { entityId: eventId } })).toBe(0)
    await page.getByRole('button', { name: 'Reload message', exact: true }).click()
    await expect(page.getByLabel('Reason for decision', { exact: true })).toHaveValue('')
    await page.getByLabel('Verified provider message ID', { exact: true }).fill(providerId)
    await page.getByLabel('Reason for decision', { exact: true }).fill('Verified the latest fixture provider record')
    let loseAcknowledgement = true
    await page.route(`**/admin/booking-emails/${eventId}*`, async route => {
      if (route.request().method() === 'POST' && loseAcknowledgement) {
        loseAcknowledgement = false
        await route.fetch()
        await route.abort('failed')
      } else await route.continue()
    })
    await page.getByRole('button', { name: 'Record provider acceptance', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm acceptance', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Review delivery outcome' }).getByRole('alert')).toContainText('outcome could not be confirmed')
    expect((await db.bookingEmail.findUniqueOrThrow({ where: { id: eventId } })).status).toBe('SENT')
    expect(await db.activityLog.count({ where: { entityId: eventId, action: 'booking_email_acceptance_recorded' } })).toBe(1)
    await page.getByRole('button', { name: 'Reload message', exact: true }).click()
    await expect(page.getByText('SENT', { exact: true })).toBeVisible()
    await expect(page.getByText('Verified the latest fixture provider record', { exact: true })).toBeVisible()
    expect(await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).toEqual(booking)
    expect(await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).toEqual(payment)
    expect(await db.activityLog.count({ where: { entityId: eventId, action: 'booking_email_acceptance_recorded' } })).toBe(1)
    const saved = await db.bookingEmail.findUniqueOrThrow({ where: { id: eventId } })
    expect(saved.providerMessageId).toBe(providerId)
    expect(saved.payload).toEqual(reviewed.payload)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: testInfo.outputPath('booking-email-review-mobile.png'), fullPage: true })
    for (const role of ['USER', 'HEALER', 'CLOSED_ADMIN']) {
      const reader = await browser.newContext({ baseURL })
      try {
        const login = await reader.request.get(`/api/test/login?role=${role === 'CLOSED_ADMIN' ? 'ADMIN' : role}&email=delivery-reader-${role}-${token}@example.test`)
        expect(login.ok()).toBeTruthy()
        const readerId = (await login.json()).userId
        actors.push(readerId)
        if (role === 'CLOSED_ADMIN') await db.user.update({ where: { id: readerId }, data: { closedAt: new Date() } })
        for (const path of ['/admin/booking-emails', `/admin/booking-emails/${eventId}`]) {
          const denied = await reader.request.get(path, { maxRedirects: 0 })
          expect(denied.status()).toBe(307)
          expect(await denied.text()).not.toContain(fixture.user.email)
        }
      } finally { await reader.close() }
    }
    await page.goto(`/admin/booking-emails?status=SENT&booking=${bookingId}`)
    await expect(page.locator(`a[href="/admin/booking-emails/${eventId}"]`)).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Needs review', exact: true })).toBeVisible()
  } finally { await cleanup(db, actors, customerId) }
})

test('active attempts and revoked staff are blocked, then an expired intent can be stopped and reconciled', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const db = await database(), token = crypto.randomUUID()
  const actors: string[] = []
  let customerId = ''
  try {
    const login = await page.goto(`/api/test/login?role=ADMIN&email=delivery-stop-${token}@example.test`)
    expect(login?.ok()).toBeTruthy()
    const actorId = (await login!.json()).userId as string
    actors.push(actorId)
    const fixture = await fixtures(db, token, 1, true)
    customerId = fixture.user.id
    const eventId = fixture.eventIds[0], path = `/admin/booking-emails/${eventId}`
    await page.goto(path)
    await expect(page.getByText(/A delivery attempt is active\./)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Stop automatic retries', exact: true })).toHaveCount(0)
    await db.bookingEmail.update({ where: { id: eventId }, data: { leaseUntil: new Date(Date.now() - 1000) } })
    await page.getByRole('button', { name: 'Reload message', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Stop automatic retries', exact: true })).toBeEnabled()
    await page.getByLabel('Reason for decision', { exact: true }).fill('Reviewed the expired fixture delivery')
    await page.getByRole('button', { name: 'Stop automatic retries', exact: true }).click()
    await db.user.update({ where: { id: actorId }, data: { role: 'USER' } })
    const deniedResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === path)
    await page.getByRole('button', { name: 'Confirm stop', exact: true }).click()
    await deniedResponse
    await expect(page.getByRole('region', { name: 'Review delivery outcome' }).getByRole('alert')).toContainText('Administrator access is required')
    expect((await db.bookingEmail.findUniqueOrThrow({ where: { id: eventId } })).status).toBe('PENDING')
    expect(await db.activityLog.count({ where: { entityId: eventId } })).toBe(0)
    await db.user.update({ where: { id: actorId }, data: { role: 'ADMIN' } })
    expect((await page.goto(`/api/test/login?role=ADMIN&email=delivery-stop-${token}@example.test`))?.ok()).toBeTruthy()
    await page.goto(path)
    await page.getByLabel('Reason for decision', { exact: true }).fill('Stop unresolved fixture retries after review')
    await page.getByRole('button', { name: 'Stop automatic retries', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm stop', exact: true }).click()
    await expect(page.getByText('SKIPPED', { exact: true })).toBeVisible()
    const stopped = await db.bookingEmail.findUniqueOrThrow({ where: { id: eventId } })
    expect(stopped).toMatchObject({ lastError: 'STAFF_STOPPED', claimToken: null, leaseUntil: null })
    await page.getByLabel('Verified provider message ID', { exact: true }).fill(`late-provider-${token}`)
    await page.getByLabel('Reason for decision', { exact: true }).fill('Verified late acceptance in fixture provider records')
    await page.getByRole('button', { name: 'Record provider acceptance', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm acceptance', exact: true }).click()
    await expect(page.getByText('SENT', { exact: true })).toBeVisible()
    expect(await db.activityLog.count({ where: { entityId: eventId, entityType: 'booking_email' } })).toBe(2)
    expect((await db.bookingEmail.findUniqueOrThrow({ where: { id: eventId } })).payload).toEqual(stopped.payload)
    await page.screenshot({ path: testInfo.outputPath('booking-email-reconciled-history.png'), fullPage: true })
  } finally { await cleanup(db, actors, customerId) }
})
