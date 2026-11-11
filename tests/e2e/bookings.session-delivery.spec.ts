import { createHmac, randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'
import { clinicDate, clinicSlotInstant } from '../../src/lib/bookings/time'

test('a practitioner publishes a session link to its customer and calendar and completes only an ended session', async ({ page, browser, baseURL }) => {
  test.setTimeout(180000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const suffix = randomUUID(), users: string[] = []
  let serviceId = '', bookingId = ''
  const customerContext = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.81' } })
  const customer = await customerContext.newPage()
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.80' })
  try {
    for (const role of ['HEALER', 'USER'] as const) {
      const email = `delivery-${role.toLowerCase()}-${suffix}@example.test`
      users.push((await db.user.create({ data: { email, role, name: `${role} Session Delivery` } })).id)
      const target = role === 'HEALER' ? page : customer
      expect((await target.request.get(`/api/test/login?${new URLSearchParams({ role, email })}`)).status()).toBe(200)
    }
    const healer = await db.healer.create({ data: { userId: users[0], isVerified: true } })
    serviceId = (await db.service.create({ data: { slug: `delivery-${suffix}`, name: `Delivery ${suffix}`, description: 'Isolated session delivery fixture', category: 'Test', price: 10, duration: 60 } })).id
    bookingId = (await db.booking.create({ data: { healerId: healer.id, userId: users[1], serviceId, scheduledAt: new Date(Date.now() + 86400000), durationMin: 60, pricePaise: 1000, status: 'CONFIRMED', payment: { create: { gateway: 'vip_credit', amountPaise: 0, status: 'success' } } } })).id
    const ended = await db.booking.create({ data: { healerId: healer.id, userId: users[1], serviceId, scheduledAt: new Date(Date.now() - 7200000), durationMin: 60, pricePaise: 0, status: 'RESCHEDULED' } })
    await page.goto('/healer/bookings')
    const link = `https://meet.example.test/${suffix}`
    await page.getByLabel(`Session link for Delivery ${suffix}`, { exact: true }).fill(link)
    await page.getByRole('button', { name: 'Save session link', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Join session', exact: true })).toHaveAttribute('href', link, { timeout: 30000 })
    await expect(page.getByRole('button', { name: 'Complete session', exact: true })).toBeDisabled()
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('CONFIRMED')
    await customer.goto('/dashboard/bookings')
    await expect(customer.getByRole('link', { name: 'Join session', exact: true })).toHaveAttribute('href', link, { timeout: 30000 })
    const calendar = await customer.request.get(`/api/bookings/${bookingId}/calendar`)
    expect(calendar.status()).toBe(200)
    expect(await calendar.text()).toContain(`URL:${link}`)
    expect((await customer.request.get('/api/healer/bookings')).status()).toBe(403)
    await page.getByRole('tab', { name: 'Past (1)', exact: true }).click()
    await page.getByRole('button', { name: 'Complete session', exact: true }).click()
    await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible({ timeout: 30000 })
    expect((await db.booking.findUniqueOrThrow({ where: { id: ended.id } })).status).toBe('COMPLETED')
    expect((await db.payment.findUniqueOrThrow({ where: { bookingId } })).gateway).toBe('vip_credit')
  } finally {
    await customerContext.close()
    try {
      await db.activityLog.deleteMany({ where: { userId: { in: users } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      if (serviceId) await db.service.delete({ where: { id: serviceId } })
    } finally { await db.$disconnect() }
  }
})

test('an unpaid reschedule keeps its room private until payment verifies, while a free request waits for its practitioner', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(240000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const practitioner = await browser.newContext({ baseURL })
  const suffix = randomUUID(), users: string[] = [], services: string[] = []
  try {
    const login = await page.goto(`/api/test/login?role=USER&vip=1&email=delivery-funding-${suffix}@example.test`)
    expect(login?.ok()).toBeTruthy()
    const customerId = (await login!.json()).userId as string; users.push(customerId)
    const healerLogin = await practitioner.request.get(`/api/test/login?role=HEALER&email=delivery-practitioner-${suffix}@example.test`)
    expect(healerLogin.ok()).toBeTruthy()
    const practitionerId = (await healerLogin.json()).userId as string; users.push(practitionerId)
    const availability = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, { start: '09:00', end: '20:00' }]))
    const healer = await db.healer.create({ data: { userId: practitionerId, isActive: true, isVerified: true, availability, specializations: ['Priced delivery fixture', 'Free delivery fixture'] } })
    for (const price of [100, 0]) services.push((await db.service.create({ data: { slug: `delivery-${price}-${suffix}`, name: price ? 'Priced delivery fixture' : 'Free delivery fixture', description: 'Isolated browser funding check', category: 'Fixture', price, duration: 60 } })).id)
    const instant = (offset: number) => clinicSlotInstant(clinicDate(new Date(Date.now() + offset * 86400000)), '10:00').toISOString()
    const created = await page.request.post('/api/bookings', { data: { healerId: healer.id, serviceId: services[0], scheduledAt: instant(31) } })
    expect(created.status()).toBe(201)
    const bookingId = (await created.json()).data.id as string
    // A saved legacy room must not turn a reservation into an authorized session.
    await db.booking.update({ where: { id: bookingId }, data: { meetingLink: 'https://meeting.example.test/legacy-private-room' } })
    const current = (await (await page.request.get(`/api/bookings/${bookingId}`)).json()).data
    const moved = await page.request.put(`/api/bookings/${bookingId}`, { headers: { 'if-match': `"${current.reviewVersion}"` }, data: { scheduledAt: instant(33) } })
    expect(moved.status()).toBe(200)
    expect((await moved.json()).data).toMatchObject({ status: 'RESCHEDULED', meetingLink: null, needsConfirmation: true })
    const tentative = await (await page.request.get(`/api/bookings/${bookingId}/calendar`)).text()
    expect(tentative).toContain('STATUS:TENTATIVE'); expect(tentative).not.toContain('URL:')
    const saved = await db.booking.findUniqueOrThrow({ where: { id: bookingId } })
    expect((await practitioner.request.patch(`/api/healer/bookings/${bookingId}`, { data: { action: 'SET_MEETING_LINK', meetingLink: 'https://meeting.example.test/blocked', version: saved.updatedAt.toISOString() } })).status()).toBe(409)
    await page.goto('/dashboard/bookings')
    await expect(page.getByRole('button', { name: 'Continue payment', exact: true })).toBeEnabled()
    await expect(page.getByRole('link', { name: 'Join session', exact: true })).toHaveCount(0)
    const healerPage = await practitioner.newPage()
    await healerPage.goto('/healer/bookings')
    await expect(healerPage.getByRole('button', { name: 'Complete session', exact: true })).toBeDisabled()
    await expect(healerPage.getByRole('link', { name: 'Join session', exact: true })).toHaveCount(0)
    await expect(healerPage.getByRole('button', { name: 'Save session link', exact: true })).toHaveCount(0)

    const orderId = `order_${suffix}`, paymentId = `pay_${suffix}`
    await db.payment.create({ data: { userId: customerId, bookingId, type: 'SESSION', gateway: 'razorpay', gatewayOrderId: orderId, amountPaise: saved.pricePaise, status: 'pending', statusEnum: 'PENDING' } })
    const signature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest('hex')
    expect((await page.request.post('/api/payments/verify', { data: { orderId, paymentId, signature } })).status()).toBe(200)
    await healerPage.reload()
    const room = `https://meeting.example.test/funded-${suffix}`
    await healerPage.getByLabel('Session link for Priced delivery fixture', { exact: true }).fill(room)
    await healerPage.getByRole('button', { name: 'Save session link', exact: true }).click()
    await expect(healerPage.getByRole('link', { name: 'Join session', exact: true })).toHaveAttribute('href', room)
    await page.reload()
    await expect(page.getByRole('link', { name: 'Join session', exact: true })).toHaveAttribute('href', room)
    const funded = (await (await page.request.get(`/api/bookings/${bookingId}/calendar`)).text()).replace(/\r\n /g, '')
    expect(funded).toContain('STATUS:CONFIRMED'); expect(funded).toContain(`URL:${room}`)

    const balance = (await db.user.findUniqueOrThrow({ where: { id: customerId } })).freeSessionCredits
    const unwantedPayments: string[] = []
    page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/payments/') || path.endsWith('/confirm-with-credits')) unwantedPayments.push(path) })
    await page.goto(`/services/delivery-0-${suffix}?${new URLSearchParams({ openBooking: '1', healerId: healer.id })}`)
    const dialog = page.getByRole('dialog', { name: 'Book Free delivery fixture', exact: true })
    await dialog.getByLabel('Select Date', { exact: true }).fill(clinicDate(new Date(Date.now() + 35 * 86400000)))
    await dialog.getByRole('button', { name: '10:00 AM', exact: true }).click()
    const freeRequest = page.waitForResponse(response => new URL(response.url()).pathname === '/api/bookings' && response.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Confirm & Pay', exact: true }).click()
    const free = await freeRequest
    expect(free.status()).toBe(201)
    const freeId = (await free.json()).data.id as string
    await expect(dialog.getByRole('heading', { name: 'Booking request received', exact: true })).toBeVisible()
    await expect(dialog.getByText('Booking Confirmed!', { exact: true })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'View My Bookings', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard\/bookings$/)
    const freeCard = page.locator('[data-test="booking-card"]').filter({ hasText: 'Free delivery fixture' })
    await expect(freeCard.getByRole('status')).toContainText('No payment or session credit is required')
    await expect(freeCard.getByRole('button', { name: /payment|session credit/i })).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: testInfo.outputPath('free-booking-mobile.png'), fullPage: true })
    await healerPage.reload()
    await healerPage.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect.poll(async () => (await db.booking.findUniqueOrThrow({ where: { id: freeId } })).status).toBe('CONFIRMED')
    await page.reload()
    await expect(freeCard.getByLabel('status CONFIRMED')).toBeVisible()
    await expect(freeCard.getByRole('status')).toHaveCount(0)
    expect(await db.payment.count({ where: { bookingId: freeId } })).toBe(0)
    expect((await db.user.findUniqueOrThrow({ where: { id: customerId } })).freeSessionCredits).toBe(balance)
    expect(unwantedPayments).toEqual([])
    expect(await db.bookingEmail.count({ where: { bookingId: freeId, kind: 'CONFIRMED' } })).toBe(1)
  } finally {
    await practitioner.close()
    try {
      await db.activityLog.deleteMany({ where: { userId: { in: users } } })
      await db.funnelEvent.deleteMany({ where: { userId: { in: users } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      await db.service.deleteMany({ where: { id: { in: services } } })
    } finally { await db.$disconnect() }
  }
})
