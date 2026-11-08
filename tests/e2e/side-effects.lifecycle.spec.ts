import crypto from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'

test('payment responds while optional activity is blocked, then saves invoice, activity and request-scoped analytics', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = crypto.randomUUID()
  const gatewayOrderId = `order_${token}`, gatewayPaymentId = `pay_${token}`
  let userId = '', productId = '', paymentId = ''
  let release: (() => void) | undefined
  let blocker: Promise<void> | undefined
  try {
    const login = await page.goto(`/api/test/login?role=USER&email=side-effects-${token}@example.test`)
    expect(login?.ok()).toBeTruthy()
    userId = (await login!.json()).userId
    await page.context().addCookies([
      { name: 'gh_sid', value: token, url: baseURL! },
      { name: 'ghx_lifecycle', value: 'B', url: baseURL! },
    ])
    const product = await db.product.create({ data: { slug: `side-effects-${token}`, title: 'Lifecycle fixture', pricePaise: 10000, stockCount: 2 } })
    productId = product.id
    const order = await db.order.create({ data: { userId, totalPaise: 10000, items: { create: { productId, quantity: 1, pricePaise: 10000 } } } })
    const payment = await db.payment.create({ data: { userId, type: 'STORE', gateway: 'razorpay', gatewayOrderId, amountPaise: 10000, status: 'pending', statusEnum: 'PENDING', metadata: { orderId: order.id } } })
    paymentId = payment.id
    // Compile/authenticate the route before holding the database lock.
    expect((await page.request.post('/api/payments/verify', { data: {} })).status()).toBe(400)

    let locked!: () => void
    const acquired = new Promise<void>(resolve => { locked = resolve })
    const released = new Promise<void>(resolve => { release = resolve })
    blocker = db.$transaction(async tx => {
      await tx.$executeRaw`LOCK TABLE "ActivityLog" IN SHARE MODE`
      locked()
      await released
    }, { timeout: 30_000 })
    await Promise.race([acquired, blocker])
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${gatewayOrderId}|${gatewayPaymentId}`).digest('hex')
    const response = await page.request.post('/api/payments/verify', {
      data: { orderId: gatewayOrderId, paymentId: gatewayPaymentId, signature }, timeout: 15_000,
    })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ verified: true, payment: { id: paymentId } })
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('paid')
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockCount).toBe(1)
    expect(await db.activityLog.count({ where: { userId, action: 'payment_verified' } })).toBe(0)
    release?.()
    await blocker

    await expect.poll(() => db.activityLog.count({ where: { userId, action: 'payment_verified', entityId: paymentId } })).toBe(1)
    await expect.poll(() => db.invoice.count({ where: { paymentId } })).toBe(1)
    await expect.poll(() => db.funnelEvent.count({ where: { userId, type: 'purchase', sessionId: token, experimentVariant: 'lifecycle:B' } })).toBe(1)
    // An idempotent payment retry keeps the same fulfillment and optional records.
    const retry = await page.request.post('/api/payments/verify', { data: { orderId: gatewayOrderId, paymentId: gatewayPaymentId, signature } })
    expect(await retry.json()).toMatchObject({ verified: true, idempotent: true })
    expect(await db.activityLog.count({ where: { userId, action: 'payment_verified' } })).toBe(1)
    expect(await db.invoice.count({ where: { paymentId } })).toBe(1)
    expect(await db.funnelEvent.count({ where: { userId, type: 'purchase' } })).toBe(1)
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockCount).toBe(1)
  } finally {
    release?.()
    try {
      await blocker
      if (userId) {
        await db.activityLog.deleteMany({ where: { userId } })
        await db.funnelEvent.deleteMany({ where: { userId } })
        await db.user.deleteMany({ where: { id: userId } })
      }
      if (productId) await db.product.deleteMany({ where: { id: productId } })
    } finally {
      await db.$disconnect()
    }
  }
})
