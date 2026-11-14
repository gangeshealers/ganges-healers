import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'
import { BOOKING_TIME_ZONE, clinicDate, clinicSlotInstant } from '../../src/lib/bookings/time'

async function fixture(page: Page) {
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = randomUUID()
  const login = await page.goto(`/api/test/login?role=USER&email=manage-${token}@example.test`)
  expect(login?.ok()).toBeTruthy()
  const userId = (await login!.json()).userId as string
  const practitioner = await db.user.create({ data: { email: `manage-healer-${token}@example.test`, name: 'Recovery practitioner', role: 'HEALER' } })
  const availability = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, { start: '09:00', end: '20:00' }]))
  const healer = await db.healer.create({ data: { userId: practitioner.id, isActive: true, isVerified: true, availability } })
  const service = await db.service.create({ data: { slug: `manage-${token}`, name: `Recovery appointment ${token}`, description: 'Isolated booking recovery fixture', category: 'Fixture', duration: 60, price: 100 } })
  const date = (offset: number) => clinicDate(new Date(Date.now() + offset * 86400000))
  const booking = await db.booking.create({ data: { userId, healerId: healer.id, serviceId: service.id, scheduledAt: clinicSlotInstant(date(12), '10:00'), durationMin: 60, status: 'CONFIRMED', pricePaise: 10000 } })
  return { db, token, booking, date, async close() {
    try {
      await db.user.deleteMany({ where: { id: { in: [userId, practitioner.id] } } })
      await db.service.delete({ where: { id: service.id } })
    } finally { await db.$disconnect() }
  } }
}

async function chooseTime(page: Page, date: string) {
  const dialog = page.getByRole('dialog', { name: 'Reschedule booking' })
  await dialog.getByLabel('Select date').fill(date)
  const label = clinicSlotInstant(date, '11:00').toLocaleTimeString('en-US', { timeZone: BOOKING_TIME_ZONE, hour: 'numeric', minute: '2-digit' })
  await dialog.getByRole('button', { name: label, exact: true }).click()
  return { dialog, instant: clinicSlotInstant(date, '11:00').toISOString() }
}

test('stale reschedules are rejected and a lost saved response is recovered through an owned reload', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const f = await fixture(page)
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard/bookings')
    const card = page.locator('[data-test="booking-card"]')
    await card.getByRole('button', { name: 'Reschedule', exact: true }).click()
    const first = await chooseTime(page, f.date(14))
    const concurrentTime = clinicSlotInstant(f.date(13), '10:00')
    await f.db.booking.update({ where: { id: f.booking.id }, data: { scheduledAt: concurrentTime, updatedAt: f.booking.updatedAt } })
    const denied = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === `/api/bookings/${f.booking.id}`)
    await first.dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    expect((await denied).status()).toBe(409)
    await expect(first.dialog.getByRole('alert')).toContainText('Booking changed')
    await expect(first.dialog.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
    expect((await f.db.booking.findUniqueOrThrow({ where: { id: f.booking.id } })).scheduledAt).toEqual(concurrentTime)
    await first.dialog.getByRole('button', { name: 'Reload bookings' }).click()
    await expect(first.dialog).toHaveCount(0)
    await card.getByRole('button', { name: 'Reschedule', exact: true }).click()
    const second = await chooseTime(page, f.date(15))
    let writes = 0
    await page.route(`**/api/bookings/${f.booking.id}`, async route => {
      if (route.request().method() === 'PUT') {
        writes++
        expect(route.request().headers()['if-match']).toMatch(/^"[a-f0-9]{64}"$/)
        await route.fetch()
        await route.abort('failed')
      } else await route.continue()
    })
    await second.dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(second.dialog.getByRole('alert')).toContainText('could not be confirmed')
    await expect(second.dialog.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('reschedule-uncertain-mobile.png'), fullPage: true })
    const saved = await f.db.booking.findUniqueOrThrow({ where: { id: f.booking.id } })
    expect(saved).toMatchObject({ status: 'RESCHEDULED', pricePaise: f.booking.pricePaise, durationMin: f.booking.durationMin })
    expect(saved.scheduledAt.toISOString()).toBe(second.instant)
    await second.dialog.getByRole('button', { name: 'Reload bookings' }).click()
    await expect(card.getByLabel('status RESCHEDULED')).toBeVisible()
    const current = await page.request.get(`/api/bookings/${f.booking.id}`)
    expect((await current.json()).data.scheduledAt).toBe(second.instant)
    expect(writes).toBe(1)
    expect(await f.db.bookingEmail.count({ where: { bookingId: f.booking.id } })).toBe(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: testInfo.outputPath('booking-reschedule-recovered-mobile.png'), fullPage: true })
  } finally { await f.close() }
})

test('lost cancellation replies recover saved refund states without another write or exposing gateway references', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const f = await fixture(page)
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard/bookings')
    await page.locator('[data-test="booking-card"]').getByRole('button', { name: 'Cancel', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Cancel booking' })
    let cancellations = 0
    await page.route(`**/api/bookings/${f.booking.id}`, async route => {
      if (route.request().method() === 'DELETE') {
        cancellations++
        await route.fetch()
        await route.abort('failed')
      } else await route.continue()
    })
    await dialog.getByRole('button', { name: 'Confirm cancel' }).click()
    await expect(dialog.getByRole('alert')).toContainText('could not be confirmed')
    await expect(dialog.getByRole('button', { name: 'Confirm cancel' })).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('cancellation-uncertain-mobile.png'), fullPage: true })
    expect((await f.db.booking.findUniqueOrThrow({ where: { id: f.booking.id } })).status).toBe('CANCELLED')
    expect(await f.db.refund.count({ where: { payment: { bookingId: f.booking.id } } })).toBe(0)
    await dialog.getByRole('button', { name: 'Reload bookings' }).click()
    await page.getByRole('tab', { name: /Past/ }).click()
    const outcome = page.getByRole('region', { name: 'Cancellation outcome' })
    await expect(outcome).toContainText('No cash refund is due')

    // Recorded provider states are synthetic fixtures in the verified isolated database.
    // Reading them must never invoke a cancellation or provider action.
    const privatePayment = `private-payment-${f.token}`, privateRefund = `private-refund-${f.token}`
    const payment = await f.db.payment.create({ data: { userId: f.booking.userId, bookingId: f.booking.id, gateway: 'razorpay', type: 'SESSION', status: 'success', statusEnum: 'SUCCESS', amountPaise: 10000, gatewayPaymentId: privatePayment } })
    const refund = await f.db.refund.create({ data: { paymentId: payment.id, amountPaise: 10000, status: 'PENDING', gatewayRefundId: privateRefund, reason: 'booking-cancellation' } })
    await page.reload()
    await page.getByRole('tab', { name: /Past/ }).click()
    await expect(outcome).toContainText('pending Razorpay confirmation')
    const response = await page.request.get('/api/bookings')
    const text = await response.text()
    expect(text).not.toContain(privatePayment)
    expect(text).not.toContain(privateRefund)
    expect(await f.db.refund.findUniqueOrThrow({ where: { id: refund.id } })).toEqual(refund)
    await f.db.refund.update({ where: { id: refund.id }, data: { status: 'SUCCESS' } })
    await f.db.payment.update({ where: { id: payment.id }, data: { status: 'refunded', statusEnum: 'REFUNDED' } })
    await page.reload()
    await page.getByRole('tab', { name: /Past/ }).click()
    await expect(outcome).toContainText('Razorpay confirmed the refund')
    expect(cancellations).toBe(1)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: testInfo.outputPath('booking-cancellation-recovered-mobile.png'), fullPage: true })
  } finally { await f.close() }
})
