import { createHmac, randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'
import { clinicDate } from '../../src/lib/bookings/time'

test('public booking recovers lost creation, credit and payment replies without another reservation or checkout', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(240000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const cashContext = await browser.newContext({ baseURL }), cash = await cashContext.newPage()
  const token = randomUUID(), users: string[] = [], bookings: string[] = []
  let serviceId = '', cashOrders = 0, bookingPosts = 0, creditPosts = 0
  const orderIds = [`order_${token}_1`, `order_${token}_2`]
  const proofs = Object.fromEntries(orderIds.map((orderId, i) => { const paymentId = `pay_${token}_${i}`; return [orderId, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest('hex') }] }))
  try {
    const practitioner = await db.user.create({ data: { email: `public-recovery-healer-${token}@example.test`, role: 'HEALER', name: 'Recovery Practitioner' } }); users.push(practitioner.id)
    const availability = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, { start: '09:00', end: '20:00' }]))
    const healer = await db.healer.create({ data: { userId: practitioner.id, isActive: true, isVerified: true, specializations: ['Public recovery appointment'], availability } })
    const service = await db.service.create({ data: { slug: `public-recovery-${token}`, name: 'Public recovery appointment', description: 'Isolated public checkout recovery', category: 'Fixture', duration: 60, price: 100 } }); serviceId = service.id
    const vipLogin = await page.goto(`/api/test/login?role=USER&vip=1&email=public-recovery-vip-${token}@example.test`)
    const vipId = (await vipLogin!.json()).userId as string; users.push(vipId)
    // The test helper intentionally defaults new accounts to VIP; create this cash fixture explicitly.
    await db.user.create({ data: { email: `public-recovery-cash-${token}@example.test`, role: 'USER', vip: false, freeSessionCredits: 0 } })
    const cashLogin = await cash.goto(`/api/test/login?role=USER&credits=0&email=public-recovery-cash-${token}@example.test`)
    const cashId = (await cashLogin!.json()).userId as string; users.push(cashId)
    const credits = (await db.user.findUniqueOrThrow({ where: { id: vipId } })).freeSessionCredits
    await cash.addInitScript(receipts => {
      window.Razorpay = class {
        constructor(private options: { order_id: string; handler: (value: unknown) => void }) {}
        open() { sessionStorage.setItem('public-checkout-opens', String(Number(sessionStorage.getItem('public-checkout-opens') || '0') + 1)); this.options.handler(receipts[this.options.order_id]) }
      }
    }, proofs)
    const choose = async (target: Page, day: number) => {
      await target.goto(`/services/${service.slug}?${new URLSearchParams({ openBooking: '1', healerId: healer.id })}`)
      const dialog = target.getByRole('dialog', { name: 'Book Public recovery appointment', exact: true })
      await dialog.getByLabel('Select Date', { exact: true }).fill(clinicDate(new Date(Date.now() + day * 86400000)))
      await dialog.getByRole('button', { name: '10:00 AM', exact: true }).click()
      await dialog.getByRole('button', { name: 'Confirm & Pay', exact: true }).click()
      return dialog
    }
    await cash.route('**/api/bookings', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const response = await route.fetch(); expect(response.status()).toBe(201)
      const row = (await response.json()).data; bookings.push(row.id); bookingPosts++
      // Provide the existing gateway order fixture before the real create-order route resumes it.
      await db.payment.create({ data: { userId: cashId, bookingId: row.id, type: 'SESSION', gateway: 'razorpay', gatewayOrderId: orderIds[bookings.length - 1], amountPaise: row.pricePaise, status: 'pending', statusEnum: 'PENDING' } })
      await route.fulfill({ response })
    })
    cash.on('request', request => { if (new URL(request.url()).pathname === '/api/payments/create-order') cashOrders++ })
    let losePaidReply = true
    await cash.route('**/api/payments/verify', async route => {
      if (!losePaidReply) return route.continue()
      losePaidReply = false
      // Commit once, then lose the reply: the next verification must be idempotent.
      const response = await route.fetch(); expect(response.status()).toBe(200)
      await route.abort('failed')
    })
    const first = await choose(cash, 12)
    await expect(first.getByRole('button', { name: 'Confirm payment', exact: true })).toBeEnabled()
    await expect(first.getByText('Booking Confirmed!', { exact: true })).toHaveCount(0)
    await first.getByRole('button', { name: 'Confirm payment', exact: true }).click()
    await expect(first.getByText('Booking Confirmed!', { exact: true })).toBeVisible()
    expect(await cash.evaluate(() => sessionStorage.getItem('public-checkout-opens'))).toBe('1')
    expect(await db.payment.count({ where: { bookingId: bookings[0] } })).toBe(1)

    await cash.unroute('**/api/payments/verify')
    let loseUnverifiedReply = true
    await cash.route('**/api/payments/verify', async route => { if (loseUnverifiedReply) { loseUnverifiedReply = false; await route.abort('failed') } else await route.continue() })
    const second = await choose(cash, 14)
    await expect(second.getByRole('button', { name: 'Confirm payment', exact: true })).toBeEnabled()
    await cash.setViewportSize({ width: 390, height: 844 })
    await cash.screenshot({ path: testInfo.outputPath('public-payment-recovery-mobile.png'), fullPage: true })
    await second.getByRole('button', { name: 'View My Bookings', exact: true }).click()
    await expect(cash).toHaveURL(/\/dashboard\/bookings$/)
    await cash.getByRole('button', { name: 'Confirm payment', exact: true }).click()
    await expect(cash.locator('[aria-label="status CONFIRMED"]')).toHaveCount(2)
    expect(await cash.evaluate(() => sessionStorage.getItem('public-checkout-opens'))).toBe('2')
    expect(cashOrders).toBe(2)
    await expect.poll(() => db.funnelEvent.count({ where: { userId: cashId, type: 'purchase' } })).toBe(2)

    let loseCreation = true
    await page.route('**/api/bookings', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const response = await route.fetch(); expect(response.status()).toBe(201)
      bookings.push((await response.json()).data.id); bookingPosts++
      if (loseCreation) { loseCreation = false; await route.abort('failed') } else await route.fulfill({ response })
    })
    page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/confirm-with-credits')) creditPosts++ })
    const uncertain = await choose(page, 16)
    await expect(uncertain.getByRole('alert')).toContainText('Check My Bookings before requesting another appointment')
    await expect(uncertain.getByRole('button', { name: 'Confirm & Pay', exact: true })).toHaveCount(0)
    await uncertain.getByRole('button', { name: 'View My Bookings', exact: true }).click()
    await page.getByRole('button', { name: 'Use session credit', exact: true }).click()
    await expect(page.locator('[aria-label="status CONFIRMED"]')).toHaveCount(1)
    expect((await db.user.findUniqueOrThrow({ where: { id: vipId } })).freeSessionCredits).toBe(credits - 1)

    await page.route('**/api/bookings/*/confirm-with-credits', async route => {
      const response = await route.fetch(); expect(response.status()).toBe(200)
      await route.abort('failed')
    })
    const unknownCredit = await choose(page, 18)
    await expect(unknownCredit.getByRole('alert')).toContainText('session credit result could not be confirmed')
    await unknownCredit.getByRole('button', { name: 'View My Bookings', exact: true }).click()
    await expect(page.locator('[aria-label="status CONFIRMED"]')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Use session credit', exact: true })).toHaveCount(0)
    expect((await db.user.findUniqueOrThrow({ where: { id: vipId } })).freeSessionCredits).toBe(credits - 2)
    expect(bookingPosts).toBe(4); expect(creditPosts).toBe(2)
    expect(await db.booking.count({ where: { userId: { in: [vipId, cashId] } } })).toBe(4)
    expect(await db.bookingEmail.count({ where: { bookingId: { in: bookings }, kind: 'CONFIRMED' } })).toBe(4)
  } finally {
    await cashContext.close()
    try {
      await db.activityLog.deleteMany({ where: { userId: { in: users } } })
      await db.funnelEvent.deleteMany({ where: { userId: { in: users } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      if (serviceId) await db.service.delete({ where: { id: serviceId } })
    } finally { await db.$disconnect() }
  }
})
