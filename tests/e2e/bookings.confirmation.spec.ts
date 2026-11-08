import crypto from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'
import { clinicDate, clinicSlotInstant } from '../../src/lib/bookings/time'

async function reserve(page: Page, db: PrismaClient, offset: number) {
  const service = await db.service.findUniqueOrThrow({ where: { slug: 'yoga-therapy' } })
  const healer = await db.healer.findFirstOrThrow({ where: { isActive: true, isVerified: true, specializations: { has: 'Yoga' } } })
  for (let i = offset; i < offset + 10; i++) {
    const date = clinicDate(new Date(Date.now() + i * 86400000))
    const response = await page.request.get(`/api/availability?healerId=${healer.id}&serviceId=${service.id}&date=${date}`)
    expect(response.ok()).toBeTruthy()
    const slot = ((await response.json()).data.slots as Array<{ time: string; available: boolean }>).find(s => s.available)
    if (!slot) continue
    const created = await page.request.post('/api/bookings', { data: { healerId: healer.id, serviceId: service.id, scheduledAt: clinicSlotInstant(date, slot.time).toISOString() } })
    expect(created.status()).toBe(201)
    return { booking: (await created.json()).data as { id: string; pricePaise: number }, service }
  }
  throw new Error('No isolated future booking slot')
}

test('a customer confirms a saved request with one credit from the mobile bookings page', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  let userId = ''
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    const login = await page.goto(`/api/test/login?role=USER&vip=1&credits=2&email=credit-confirm-${crypto.randomUUID()}@example.test`)
    expect(login?.ok()).toBeTruthy()
    userId = (await login!.json()).userId
    const { booking } = await reserve(page, db, 32)
    const creditsBefore = (await db.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits
    expect(await db.bookingEmail.count({ where: { bookingId: booking.id, kind: 'REQUESTED', status: 'PENDING' } })).toBe(1)
    await page.goto('/dashboard/bookings')
    const card = page.locator('[data-test="booking-card"]').first()
    await expect(card.getByRole('button', { name: 'Use session credit' })).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath('pending-booking-mobile.png'), fullPage: true })
    const submitted = page.waitForResponse(r => r.url().endsWith(`/api/bookings/${booking.id}/confirm-with-credits`) && r.request().method() === 'POST')
    await card.getByRole('button', { name: 'Use session credit' }).click()
    expect((await submitted).status()).toBe(200)
    await expect(page.locator('[data-test="booking-card"]').getByLabel('status CONFIRMED')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use session credit' })).toHaveCount(0)
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits).toBe(creditsBefore - 1)
    expect((await db.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })).gateway).toBe('vip_credit')
    expect(await db.bookingEmail.count({ where: { bookingId: booking.id, kind: 'CONFIRMED', status: 'PENDING' } })).toBe(1)
    expect((await page.request.post(`/api/bookings/${booking.id}/confirm-with-credits`)).status()).toBe(400)
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits).toBe(creditsBefore - 1)
  } finally {
    try {
      if (userId) { await db.activityLog.deleteMany({ where: { userId } }); await db.user.deleteMany({ where: { id: userId } }) }
    } finally { await db.$disconnect() }
  }
})

test('saved appointment payment retains its price and proof through a lost confirmation and refresh', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = crypto.randomUUID(), orderId = `order_${token}`, paymentId = `pay_${token}`
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest('hex')
  let userId = '', serviceId = '', originalPrice = 0
  try {
    const login = await page.goto(`/api/test/login?role=USER&email=paid-confirm-${token}@example.test`)
    expect(login?.ok()).toBeTruthy()
    userId = (await login!.json()).userId
    const { booking, service } = await reserve(page, db, 45)
    serviceId = service.id; originalPrice = service.price
    await db.service.update({ where: { id: service.id }, data: { price: originalPrice + 500 } })
    await db.payment.create({ data: { userId, bookingId: booking.id, type: 'SESSION', gateway: 'razorpay', gatewayOrderId: orderId, amountPaise: booking.pricePaise, status: 'pending', statusEnum: 'PENDING' } })
    await page.addInitScript(proof => {
      window.Razorpay = class {
        constructor(private options: { amount: number; handler: (value: typeof proof) => void }) {}
        open() {
          sessionStorage.setItem('fixture-checkout-opens', String(Number(sessionStorage.getItem('fixture-checkout-opens') || '0') + 1))
          sessionStorage.setItem('fixture-checkout-amount', String(this.options.amount))
          this.options.handler(proof)
        }
      }
    }, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature })
    let loseResponse = true
    await page.route('**/api/payments/verify', async route => { if (loseResponse) { loseResponse = false; await route.abort('failed') } else await route.continue() })
    await page.goto('/dashboard/bookings')
    await page.getByRole('button', { name: 'Continue payment', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: /could not confirm/i })).toBeVisible()
    expect(await page.evaluate(() => sessionStorage.getItem('fixture-checkout-amount'))).toBe(String(booking.pricePaise))
    await page.reload()
    await expect(page.getByRole('button', { name: 'Confirm payment', exact: true })).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath('saved-booking-confirmation-recovery.png'), fullPage: true })
    await page.getByRole('button', { name: 'Confirm payment', exact: true }).click()
    await expect(page.locator('[data-test="booking-card"]').getByLabel('status CONFIRMED')).toBeVisible()
    expect(await page.evaluate(() => sessionStorage.getItem('fixture-checkout-opens'))).toBe('1')
    expect(await db.payment.count({ where: { bookingId: booking.id } })).toBe(1)
    expect(await db.bookingEmail.count({ where: { bookingId: booking.id, kind: 'CONFIRMED', status: 'PENDING' } })).toBe(1)
    await expect.poll(() => db.funnelEvent.count({ where: { userId, type: 'purchase' } })).toBe(1)
  } finally {
    try {
      if (serviceId) await db.service.update({ where: { id: serviceId }, data: { price: originalPrice } })
      if (userId) { await db.activityLog.deleteMany({ where: { userId } }); await db.funnelEvent.deleteMany({ where: { userId } }); await db.user.deleteMany({ where: { id: userId } }) }
    } finally { await db.$disconnect() }
  }
})
