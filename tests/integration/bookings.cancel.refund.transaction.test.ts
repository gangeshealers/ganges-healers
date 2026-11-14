import { randomUUID, createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DELETE, PATCH, GET as getBooking } from '@/app/api/bookings/[id]/route'
import { POST as webhook } from '@/app/api/payments/webhook/route'
import { bookingReviewVersion } from '@/lib/bookings/transactions'
import { recordRefundOutcome } from '@/lib/payments/refunds'

jest.mock('@/lib/invoices', () => ({ createAndStoreInvoicePdf: jest.fn() }))

type RefundArgs = Parameters<typeof import('@/lib/payments/razorpay-refunds').refundPayment>[0]
type RefundResult = Awaited<ReturnType<typeof import('@/lib/payments/razorpay-refunds').refundPayment>>

const mockRefundPayment = jest.fn<Promise<RefundResult>, [args: RefundArgs]>()
const mockFetchRefundStatus = jest.fn<
  Promise<RefundResult>,
  [refundId: string, paymentId: string]
>()

jest.mock('@/lib/auth', () => ({
  auth: async () => process.env.REFUND_INTEGRATION_USER_ID
    ? { user: { id: process.env.REFUND_INTEGRATION_USER_ID, role: 'USER' } }
    : null,
}))

jest.mock('@/lib/payments/razorpay-refunds', () => ({
  hasRazorpayRefundCredentials: () => true,
  refundPayment: (...args: Parameters<typeof mockRefundPayment>) => mockRefundPayment(...args),
  fetchRefundStatus: (...args: Parameters<typeof mockFetchRefundStatus>) => mockFetchRefundStatus(...args),
}))

jest.setTimeout(30000)

let userId: string
let healerUserId: string
let healerId: string
let serviceId: string
let previousTestMode: string | undefined
let previousEventsEnabled: string | undefined
let previousWebhookSecret: string | undefined
const webhookSecret = 'refund-integration-secret'

async function createPaidBooking() {
  const booking = await prisma.booking.create({
    data: {
      userId,
      healerId,
      serviceId,
      scheduledAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      durationMin: 60,
      status: 'CONFIRMED',
      pricePaise: 15000,
    },
  })
  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      userId,
      gateway: 'razorpay',
      status: 'success',
      statusEnum: 'SUCCESS',
      amountPaise: 15000,
      gatewayPaymentId: `pay_${randomUUID()}`,
    },
  })
  return { booking, payment }
}

function cancel(method: 'DELETE' | 'PATCH', bookingId: string) {
  const request = new NextRequest(new Request(`http://localhost/api/bookings/${bookingId}`, {
    method,
    headers: method === 'PATCH' ? { 'content-type': 'application/json' } : undefined,
    body: method === 'PATCH' ? JSON.stringify({ action: 'cancel' }) : undefined,
  }))
  const context = { params: Promise.resolve({ id: bookingId }) }
  return method === 'DELETE' ? DELETE(request, context) : PATCH(request, context)
}

beforeAll(async () => {
  previousTestMode = process.env.TEST_MODE
  previousEventsEnabled = process.env.PAYMENT_EVENTS_ENABLED
  previousWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  process.env.PAYMENT_EVENTS_ENABLED = 'true'
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret
  delete process.env.TEST_MODE
  const suffix = randomUUID()
  const user = await prisma.user.create({
    data: { email: `refund-test-${suffix}@example.test`, password: 'unused', role: 'USER' },
  })
  userId = user.id
  process.env.REFUND_INTEGRATION_USER_ID = userId

  const healerUser = await prisma.user.create({
    data: { email: `refund-healer-${suffix}@example.test`, password: 'unused', role: 'HEALER' },
  })
  healerUserId = healerUser.id
  healerId = (await prisma.healer.create({ data: { userId: healerUserId } })).id
  serviceId = (await prisma.service.create({
    data: {
      slug: `refund-test-${suffix}`,
      name: 'Refund Test',
      description: 'Refund integration test',
      category: 'Test',
      price: 150,
      duration: 60,
    },
  })).id
})

afterAll(async () => {
  if (previousTestMode === undefined) delete process.env.TEST_MODE
  else process.env.TEST_MODE = previousTestMode
  if (previousEventsEnabled === undefined) delete process.env.PAYMENT_EVENTS_ENABLED
  else process.env.PAYMENT_EVENTS_ENABLED = previousEventsEnabled
  if (previousWebhookSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET
  else process.env.RAZORPAY_WEBHOOK_SECRET = previousWebhookSecret
  delete process.env.REFUND_INTEGRATION_USER_ID
  if (userId) await prisma.user.delete({ where: { id: userId } })
  if (healerUserId) await prisma.user.delete({ where: { id: healerUserId } })
  if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  await prisma.$disconnect()
})

async function sendRefund(gatewayRefundId: string, gatewayPaymentId: string, amount: number, status = 'processed', validSignature = true) {
  const body = JSON.stringify({ event: `refund.${status === 'pending' ? 'created' : status}`, payload: { refund: { entity: {
    id: gatewayRefundId, payment_id: gatewayPaymentId, amount, currency: 'INR', status,
  } } } })
  const signature = createHmac('sha256', webhookSecret).update(body).digest('hex')
  return webhook(new Request('http://localhost/api/payments/webhook', {
    method: 'POST', body, headers: { 'x-razorpay-signature': validSignature ? signature : '0'.repeat(64) },
  }))
}

describe('verified refund webhook reconciliation', () => {
  async function pendingRefund(amountPaise = 15000) {
    const fixture = await createPaidBooking()
    const refund = await prisma.refund.create({ data: {
      paymentId: fixture.payment.id, amountPaise, gatewayRefundId: `rfnd_${randomUUID()}`, status: 'PENDING', reason: 'booking-cancellation',
    } })
    return { ...fixture, refund }
  }

  test('signature and disabled-event gates prevent any refund writes', async () => {
    const { payment, refund } = await pendingRefund()
    expect((await sendRefund(refund.gatewayRefundId!, payment.gatewayPaymentId!, 15000, 'processed', false)).status).toBe(401)
    process.env.PAYMENT_EVENTS_ENABLED = 'false'
    try {
      expect((await sendRefund(refund.gatewayRefundId!, payment.gatewayPaymentId!, 15000)).status).toBe(200)
      expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe('PENDING')
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).statusEnum).toBe('SUCCESS')
    } finally { process.env.PAYMENT_EVENTS_ENABLED = 'true' }
  })

  test('concurrent duplicate delivery and a delayed API response preserve one confirmed refund', async () => {
    const { payment, refund } = await pendingRefund()
    const responses = await Promise.all([
      sendRefund(refund.gatewayRefundId!, payment.gatewayPaymentId!, 15000),
      sendRefund(refund.gatewayRefundId!, payment.gatewayPaymentId!, 15000),
    ])
    expect(responses.map(response => response.status)).toEqual([200, 200])
    await recordRefundOutcome(refund.id, refund.gatewayRefundId, 'PENDING')
    await sendRefund(refund.gatewayRefundId!, payment.gatewayPaymentId!, 15000, 'failed')
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(1)
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe('SUCCESS')
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).statusEnum).toBe('REFUNDED')
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  test('a legacy unbound success remains under review after a signed partial refund, cancellation and reload', async () => {
    const { booking, payment, refund } = await pendingRefund(7500)
    await prisma.refund.create({ data: { paymentId: payment.id, amountPaise: 7500, status: 'processed' } })
    const event = await sendRefund(refund.gatewayRefundId!, payment.gatewayPaymentId!, 7500)
    expect(event.status).toBe(200)
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).statusEnum).toBe('SUCCESS')

    const cancelled = await cancel('DELETE', booking.id)
    const recovered = await getBooking(new NextRequest(`http://localhost/api/bookings/${booking.id}`), { params: Promise.resolve({ id: booking.id }) })
    expect((await cancelled.json()).refund.status).toBe('UNKNOWN')
    expect((await recovered.json()).data.cancellationRefund.status).toBe('UNKNOWN')
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(2)
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  test('simultaneous partial refunds sum atomically to the full captured amount', async () => {
    const { payment, refund } = await pendingRefund(7500)
    const second = await prisma.refund.create({ data: {
      paymentId: payment.id, amountPaise: 7500, gatewayRefundId: `rfnd_${randomUUID()}`, status: 'PENDING',
    } })
    const responses = await Promise.all([refund, second].map(row => sendRefund(row.gatewayRefundId!, payment.gatewayPaymentId!, 7500)))
    expect(responses.map(response => response.status)).toEqual([200, 200])
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).statusEnum).toBe('REFUNDED')
    expect(await prisma.refund.count({ where: { paymentId: payment.id, status: 'SUCCESS' } })).toBe(2)
  })

  test('a partial confirmation leaves the original payment captured', async () => {
    const { payment, refund } = await pendingRefund(7500)
    expect((await sendRefund(refund.gatewayRefundId!, payment.gatewayPaymentId!, 7500)).status).toBe(200)
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe('SUCCESS')
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).statusEnum).toBe('SUCCESS')
  })

  test.each(['amount', 'payment'] as const)('a signed but mismatched %s leaves both records unchanged', async mismatch => {
    const { payment, refund } = await pendingRefund()
    const response = await sendRefund(refund.gatewayRefundId!, mismatch === 'payment' ? 'pay_wrong' : payment.gatewayPaymentId!, mismatch === 'amount' ? 1 : 15000)
    expect(response.status).toBe(500)
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe('PENDING')
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).statusEnum).toBe('SUCCESS')
  })

  test('over-refunding rolls back the rejected confirmation', async () => {
    const { payment, refund } = await pendingRefund()
    await prisma.refund.create({ data: { paymentId: payment.id, amountPaise: 1, status: 'SUCCESS', gatewayRefundId: `rfnd_${randomUUID()}` } })
    expect((await sendRefund(refund.gatewayRefundId!, payment.gatewayPaymentId!, 15000)).status).toBe(500)
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe('PENDING')
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).statusEnum).toBe('SUCCESS')
  })

  test('a webhook winning a cancellation status fetch cannot be overwritten by its stale pending result', async () => {
    const { booking, payment, refund } = await pendingRefund()
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } })
    mockFetchRefundStatus.mockImplementationOnce(async refundId => {
      expect((await sendRefund(refundId, payment.gatewayPaymentId!, 15000)).status).toBe(200)
      return { gatewayRefundId: refundId, status: 'PENDING', raw: {} }
    })
    expect((await (await cancel('DELETE', booking.id)).json()).refund.status).toBe('SUCCESS')
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe('SUCCESS')
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })
})

beforeEach(() => {
  mockRefundPayment.mockReset().mockImplementation(async ({ paymentId }) => ({
    gatewayRefundId: `rfnd_${paymentId}`,
    status: 'SUCCESS',
    raw: {},
  }))
  mockFetchRefundStatus.mockReset().mockImplementation(async refundId => ({
    gatewayRefundId: refundId,
    status: 'SUCCESS',
    raw: {},
  }))
})

describe('booking cancellation refund transactions', () => {
  test('concurrent retries after a partial refund reuse the deferred intent and respect the original cancellation band', async () => {
    const { booking, payment } = await createPaidBooking()
    const cancelledAt = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await prisma.booking.update({ where: { id: booking.id }, data: {
      status: 'CANCELLED', updatedAt: cancelledAt, scheduledAt: new Date(cancelledAt.getTime() + 36 * 60 * 60 * 1000),
    } })
    const deferred = await prisma.refund.create({ data: {
      paymentId: payment.id, amountPaise: 7500, reason: 'gateway-not-configured', status: 'UNAVAILABLE',
    } })
    const previous = await prisma.refund.create({ data: {
      paymentId: payment.id, amountPaise: 2500, reason: 'other', status: 'PENDING', gatewayRefundId: `rfnd_${randomUUID()}`,
    } })
    expect((await sendRefund(previous.gatewayRefundId!, payment.gatewayPaymentId!, 2500)).status).toBe(200)

    const replies = await Promise.all([cancel('PATCH', booking.id), cancel('DELETE', booking.id)])
    expect(replies.map(response => response.status)).toEqual([200, 200])
    expect(mockRefundPayment).toHaveBeenCalledTimes(1)
    expect(mockRefundPayment).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 5000 }))
    expect(await prisma.refund.findUniqueOrThrow({ where: { id: deferred.id } })).toMatchObject({
      status: 'SUCCESS', reason: 'booking-cancellation', amountPaise: 5000,
    })
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(2)
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).statusEnum).toBe('SUCCESS')
    const recovered = await getBooking(new NextRequest(`http://localhost/api/bookings/${booking.id}`), { params: Promise.resolve({ id: booking.id }) })
    expect((await recovered.json()).data.cancellationRefund).toMatchObject({ band: 'HALF', refundPaise: 7500, status: 'SUCCESS' })
  })

  test('commits a pending refund intent before calling the mocked gateway', async () => {
    const { booking, payment } = await createPaidBooking()
    let observedBeforeGateway: { bookingStatus: string; refundStatus: string | null; amountPaise: number } | undefined
    mockRefundPayment.mockImplementationOnce(async ({ paymentId, amountPaise }) => {
      const [storedBooking, intent] = await Promise.all([
        prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
        prisma.refund.findFirst({
          where: { paymentId: payment.id },
          orderBy: { createdAt: 'desc' },
        }),
      ])
      observedBeforeGateway = {
        bookingStatus: storedBooking.status,
        refundStatus: intent?.status ?? null,
        amountPaise: intent?.amountPaise ?? 0,
      }
      return { gatewayRefundId: `rfnd_${paymentId}`, status: 'SUCCESS', raw: { amountPaise } }
    })

    const response = await cancel('DELETE', booking.id)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.refund.status).toBe('SUCCESS')
    expect(observedBeforeGateway).toEqual({
      bookingStatus: 'CANCELLED',
      refundStatus: 'PENDING',
      amountPaise: 15000,
    })
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(1)
    expect((await prisma.refund.findFirstOrThrow({ where: { paymentId: payment.id } })).status).toBe('SUCCESS')
  })

  test('concurrent DELETE and PATCH requests create one intent and submit one refund', async () => {
    const { booking, payment } = await createPaidBooking()
    let signalGatewayStarted!: () => void
    let finishGateway!: (result: RefundResult) => void
    const gatewayStarted = new Promise<void>(resolve => { signalGatewayStarted = resolve })
    const gatewayResult = new Promise<RefundResult>(resolve => { finishGateway = resolve })
    mockRefundPayment.mockImplementationOnce(async () => {
      signalGatewayStarted()
      return gatewayResult
    })

    const firstRequest = cancel('DELETE', booking.id)
    await gatewayStarted
    const secondResponse = await cancel('PATCH', booking.id)
    finishGateway({ gatewayRefundId: 'rfnd_concurrent', status: 'SUCCESS', raw: {} })
    const firstResponse = await firstRequest

    expect((await firstResponse.json()).refund.status).toBe('SUCCESS')
    expect((await secondResponse.json()).refund.status).toBe('UNKNOWN')
    expect(mockRefundPayment).toHaveBeenCalledTimes(1)
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(1)
    expect((await prisma.refund.findFirstOrThrow({ where: { paymentId: payment.id } })).status).toBe('SUCCESS')
  })

  test('an uncertain gateway response persists as unknown and is not resubmitted on retry', async () => {
    const { booking, payment } = await createPaidBooking()
    mockRefundPayment.mockRejectedValueOnce(new Error('mock timeout'))

    const firstResponse = await cancel('DELETE', booking.id)
    const retryResponse = await cancel('PATCH', booking.id)

    expect((await firstResponse.json()).refund.status).toBe('UNKNOWN')
    expect((await retryResponse.json()).refund.status).toBe('UNKNOWN')
    expect(mockRefundPayment).toHaveBeenCalledTimes(1)
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(1)
    expect((await prisma.refund.findFirstOrThrow({ where: { paymentId: payment.id } })).status).toBe('UNKNOWN')
  })
})


test('a stale reviewed paid cancellation creates no refund and does not call Razorpay', async () => {
  const { booking, payment } = await createPaidBooking()
  await prisma.booking.update({ where: { id: booking.id }, data: { scheduledAt: new Date(booking.scheduledAt.getTime() + 86400000), updatedAt: booking.updatedAt } })
  const reply = await DELETE(new NextRequest(`http://localhost/api/bookings/${booking.id}`, { method: 'DELETE', headers: { 'if-match': `"${bookingReviewVersion(booking)}"` } }), { params: Promise.resolve({ id: booking.id }) })
  expect(reply.status).toBe(409)
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED')
  expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0)
  expect(mockRefundPayment).not.toHaveBeenCalled()
})

test('reading a saved cancellation recovers its recorded refund without a provider call or private references', async () => {
  const { booking, payment } = await createPaidBooking()
  const reply = await cancel('DELETE', booking.id)
  expect(reply.status).toBe(200)
  const record = await prisma.refund.findFirstOrThrow({ where: { paymentId: payment.id } })
  const calls = mockRefundPayment.mock.calls.length
  const response = await getBooking(new NextRequest(`http://localhost/api/bookings/${booking.id}`), { params: Promise.resolve({ id: booking.id }) })
  const body = await response.json()
  expect(body.data.cancellationRefund).toMatchObject({ status: 'SUCCESS', refundPaise: booking.pricePaise })
  expect(JSON.stringify(body)).not.toContain(payment.gatewayPaymentId)
  expect(JSON.stringify(body)).not.toContain(record.gatewayRefundId)
  expect(mockRefundPayment).toHaveBeenCalledTimes(calls)
  expect(mockFetchRefundStatus).not.toHaveBeenCalled()
  await prisma.refund.update({ where: { id: record.id }, data: { status: 'UNKNOWN', gatewayRefundId: null } })
  const uncertain = await getBooking(new NextRequest(`http://localhost/api/bookings/${booking.id}`), { params: Promise.resolve({ id: booking.id }) })
  expect((await uncertain.json()).data.cancellationRefund.status).toBe('UNKNOWN')
  expect(mockFetchRefundStatus).not.toHaveBeenCalled()
})
