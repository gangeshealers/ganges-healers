import { createHmac, randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET as listHealer } from '@/app/api/healer/bookings/route'
import { PATCH } from '@/app/api/healer/bookings/[id]/route'
import { GET as listCustomer } from '@/app/api/bookings/route'
import { GET as detailCustomer } from '@/app/api/bookings/[id]/route'
import { GET as calendar } from '@/app/api/bookings/[id]/calendar/route'
import { POST as paymentWebhook } from '@/app/api/payments/webhook/route'
import { uploadInvoicePDF } from '@/lib/invoices/storage'
import { lockTransaction } from '@/lib/db/locks'

let mockActor: { user: { id: string; role: string } } | null
jest.mock('@/lib/auth', () => ({ auth: jest.fn(async () => mockActor) }))
jest.mock('@/lib/invoices/storage', () => ({ uploadInvoicePDF: jest.fn() }))
const users: string[] = [], healers: string[] = []
let serviceId = '', bookingId = ''
const request = (body: object) => new NextRequest('http://localhost/api/healer/bookings/booking', { method: 'PATCH', body: JSON.stringify(body) })
const params = () => ({ params: Promise.resolve({ id: bookingId }) })
const patch = (body: object) => PATCH(request(body), params())
const fresh = () => prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })
const link = async (meetingLink: string | null, version?: string) => patch({ action: 'SET_MEETING_LINK', meetingLink, version: version ?? (await fresh()).updatedAt.toISOString() })
beforeAll(async () => {
  for (const role of ['HEALER', 'HEALER', 'USER'] as const) {
    const user = await prisma.user.create({ data: { email: `delivery-${randomUUID()}@example.test`, role, freeSessionCredits: 2 } }); users.push(user.id)
    if (role === 'HEALER') healers.push((await prisma.healer.create({ data: { userId: user.id } })).id)
  }
  serviceId = (await prisma.service.create({ data: { name: 'Delivery Service', slug: `delivery-${randomUUID()}`, description: 'Isolated session delivery', category: 'Test', price: 10, duration: 60 } })).id
})
beforeEach(async () => {
  mockActor = { user: { id: users[0], role: 'HEALER' } }
  bookingId = (await prisma.booking.create({ data: { userId: users[2], healerId: healers[0], serviceId, scheduledAt: new Date(Date.now() + 86400000), durationMin: 60, status: 'CONFIRMED', pricePaise: 1000, payment: { create: { gateway: 'razorpay', status: 'success', statusEnum: 'SUCCESS', amountPaise: 1000 } } } })).id
})
afterAll(async () => {
  try {
    await prisma.activityLog.deleteMany({ where: { userId: { in: users } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  } finally { await prisma.$disconnect() }
})

test('an owned session link reaches customer bookings and private calendar without changing appointment or payment', async () => {
  const before = await fresh(), payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId } })
  const response = await link('https://meeting.example.test/session')
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await fresh()).toMatchObject({ scheduledAt: before.scheduledAt, status: before.status, durationMin: before.durationMin, pricePaise: before.pricePaise, meetingLink: 'https://meeting.example.test/session' })
  expect(await prisma.payment.findUniqueOrThrow({ where: { bookingId } })).toEqual(payment)
  const audit = await prisma.activityLog.findFirstOrThrow({ where: { entityId: bookingId, action: 'booking_meeting_link_updated' } })
  expect(JSON.stringify(audit.metadata)).not.toContain('meeting.example.test')
  mockActor = { user: { id: users[2], role: 'USER' } }
  const listed = await listCustomer(new NextRequest('http://localhost/api/bookings'))
  expect(listed.headers.get('cache-control')).toBe('private, no-store')
  expect((await listed.json()).data.find((row: { id: string }) => row.id === bookingId)).toMatchObject({ meetingLink: 'https://meeting.example.test/session' })
  const exported = await calendar(new Request('http://localhost/calendar'), params())
  expect(await exported.text()).toContain('URL:https://meeting.example.test/session')
})

test('lists the issued session receipt only when its payment belongs to the booking member', async () => {
  mockActor = { user: { id: users[2], role: 'USER' } }
  const listedBooking = async () => {
    const response = await listCustomer(new NextRequest('http://localhost/api/bookings'))
    expect(response.status).toBe(200)
    return (await response.json()).data.find((row: { id: string }) => row.id === bookingId)
  }
  const payment = await prisma.payment.update({ where: { bookingId }, data: { userId: users[2], type: 'SESSION' } })
  expect((await listedBooking()).receiptId).toBeNull()
  const invoice = await prisma.invoice.create({ data: {
    paymentId: payment.id, invoiceNumber: `INV-${randomUUID()}`, billTo: {}, lineItems: [],
    subtotalPaise: 1000, totalPaise: 1000, pdfUrl: '',
  } })
  expect(await listedBooking()).toMatchObject({ receiptId: invoice.id })
  expect((await listedBooking()).payment).toEqual({ status: 'success', amountPaise: 1000 })
  await prisma.payment.update({ where: { id: payment.id }, data: { type: null } })
  expect((await listedBooking()).receiptId).toBe(invoice.id)
  await prisma.payment.update({ where: { id: payment.id }, data: { userId: users[1] } })
  expect((await listedBooking()).receiptId).toBeNull()
  await prisma.payment.update({ where: { id: payment.id }, data: { userId: users[2], type: 'STORE' } })
  expect((await listedBooking()).receiptId).toBeNull()
})

test('a captured session without a browser callback still issues one printable receipt during a PDF outage', async () => {
  const previousFlag = process.env.PAYMENT_EVENTS_ENABLED
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  const secret = 'test-booking-receipt-webhook'
  try {
    process.env.PAYMENT_EVENTS_ENABLED = 'true'
    process.env.RAZORPAY_WEBHOOK_SECRET = secret
    jest.mocked(uploadInvoicePDF).mockRejectedValueOnce(new Error('test storage outage'))
    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'PENDING' } })
    const orderId = `order_${randomUUID()}`, gatewayPaymentId = `pay_${randomUUID()}`
    const payment = await prisma.payment.update({ where: { bookingId }, data: {
      userId: users[2], type: 'SESSION', status: 'pending', statusEnum: 'PENDING', gatewayOrderId: orderId,
    } })
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: {
      id: gatewayPaymentId, order_id: orderId, amount: 1000, currency: 'INR', status: 'captured',
    } } } })
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    const callback = () => paymentWebhook(new Request('http://localhost/api/payments/webhook', {
      method: 'POST', body, headers: { 'x-razorpay-signature': signature },
    }))
    expect((await callback()).status).toBe(200)
    expect((await callback()).status).toBe(200)
    expect(await fresh()).toMatchObject({ status: 'CONFIRMED' })
    const invoices = await prisma.invoice.findMany({ where: { paymentId: payment.id } })
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({ pdfUrl: '', totalPaise: 1000, lineItems: [{ description: 'Delivery Service Session', amountPaise: 1000 }] })
    expect(uploadInvoicePDF).toHaveBeenCalledTimes(1)
    expect(await prisma.bookingEmail.count({ where: { bookingId, kind: 'CONFIRMED' } })).toBe(1)
    mockActor = { user: { id: users[2], role: 'USER' } }
    const response = await listCustomer(new NextRequest('http://localhost/api/bookings'))
    expect((await response.json()).data.find((row: { id: string }) => row.id === bookingId).receiptId).toBe(invoices[0].id)
  } finally {
    jest.mocked(uploadInvoicePDF).mockReset()
    if (previousFlag === undefined) delete process.env.PAYMENT_EVENTS_ENABLED
    else process.env.PAYMENT_EVENTS_ENABLED = previousFlag
    if (previousSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret
  }
})

test('foreign healers, ordinary users, missing sessions and revoked roles cannot manage another appointment', async () => {
  mockActor = { user: { id: users[1], role: 'HEALER' } }
  expect((await link('https://meeting.example.test/foreign')).status).toBe(403)
  expect((await (await listHealer(new NextRequest('http://localhost/api/healer/bookings'))).json()).data.map((row: { id: string }) => row.id)).not.toContain(bookingId)
  mockActor = { user: { id: users[2], role: 'USER' } }; expect((await link(null)).status).toBe(403)
  mockActor = null; expect((await link(null)).status).toBe(401)
  mockActor = { user: { id: users[0], role: 'HEALER' } }
  try {
    await prisma.user.update({ where: { id: users[0] }, data: { role: 'USER' } })
    expect((await link(null)).status).toBe(403)
  } finally { await prisma.user.update({ where: { id: users[0] }, data: { role: 'HEALER' } }) }
})

test('two competing link versions cannot overwrite each other and cancelled sessions cannot be revived', async () => {
  const version = (await fresh()).updatedAt.toISOString()
  const responses = await Promise.all([link('https://meeting.example.test/one', version), link('https://meeting.example.test/two', version)])
  expect(responses.map(response => response.status).sort()).toEqual([200, 409])
  expect(await prisma.activityLog.count({ where: { entityId: bookingId, action: 'booking_meeting_link_updated' } })).toBe(1)
  const saved = await fresh(); expect(saved.meetingLink).toMatch(/\/(one|two)$/)
  expect((await link(null, version)).status).toBe(409)
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } })
  expect((await link('https://meeting.example.test/revive')).status).toBe(409)
  expect((await fresh()).status).toBe('CANCELLED')
})

test('meeting writes require safe HTTPS, the saved version and an active confirmed session', async () => {
  for (const meetingLink of ['javascript:alert(1)', 'http://meeting.example.test', 'https://user:password@meeting.example.test']) expect((await link(meetingLink)).status).toBe(400)
  expect((await patch({ action: 'SET_MEETING_LINK', meetingLink: 'https://meeting.example.test' })).status).toBe(400)
  expect((await PATCH(new NextRequest('http://localhost/action', { method: 'PATCH', body: '{' }), params())).status).toBe(400)
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'PENDING', meetingLink: 'https://meeting.example.test/pending-room' } })
  expect((await link('https://meeting.example.test')).status).toBe(409)
  const content = await (await calendar(new Request('http://localhost/calendar'), params())).text()
  expect(content).toContain('STATUS:TENTATIVE')
  expect(content).not.toContain('URL:')
})

test('completion waits for the scheduled end and supports an ended rescheduled session', async () => {
  expect((await patch({ action: 'COMPLETE' })).status).toBe(409)
  for (const status of ['CONFIRMED', 'RESCHEDULED'] as const) {
    await prisma.booking.update({ where: { id: bookingId }, data: { scheduledAt: new Date(Date.now() - 7200000), status } })
    expect((await patch({ action: 'COMPLETE' })).status).toBe(200)
    expect((await fresh()).status).toBe('COMPLETED')
    expect((await patch({ action: 'COMPLETE' })).status).toBe(400)
  }
})

test('unpaid positive-price confirmation is refused and a genuinely free pending booking can be confirmed', async () => {
  await prisma.payment.delete({ where: { bookingId } })
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'PENDING' } })
  expect((await patch({ action: 'CONFIRM' })).status).toBe(409)
  await prisma.booking.update({ where: { id: bookingId }, data: { pricePaise: 0 } })
  expect((await patch({ action: 'CONFIRM' })).status).toBe(200)
})

test('practitioner cancellation cannot discard a captured payment or used credit; unpaid holds can be released', async () => {
  expect((await patch({ action: 'CANCEL' })).status).toBe(409)
  expect((await fresh()).status).toBe('CONFIRMED')
  await prisma.payment.update({ where: { bookingId }, data: { gateway: 'vip_credit', amountPaise: 0, statusEnum: null } })
  const credits = (await prisma.user.findUniqueOrThrow({ where: { id: users[2] } })).freeSessionCredits
  expect((await patch({ action: 'CANCEL' })).status).toBe(409)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: users[2] } })).freeSessionCredits).toBe(credits)
  await prisma.payment.delete({ where: { bookingId } })
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'PENDING' } })
  expect((await patch({ action: 'CANCEL' })).status).toBe(200)
  expect((await fresh()).status).toBe('CANCELLED')
})

test('a role revoked while waiting for the reservation lock is rechecked before a meeting write', async () => {
  const version = (await fresh()).updatedAt.toISOString()
  let acquired!: () => void, release!: () => void
  const locked = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve })
  const blocker = prisma.$transaction(async tx => {
    await lockTransaction(tx, 'healer', healers[0]); acquired(); await unlock
    await tx.user.update({ where: { id: users[0] }, data: { role: 'USER' } })
  }, { timeout: 15000 })
  await locked
  const waiting = link('https://meeting.example.test/revoked', version)
  try {
    let queued = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=72102::oid AND objid=(hashtext(${healers[0]})::bigint & 4294967295)::oid) AS waiting`
      if (rows[0].waiting) { queued = true; break }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(queued).toBe(true)
  } finally {
    release(); await blocker; await waiting
    await prisma.user.update({ where: { id: users[0] }, data: { role: 'HEALER' } })
  }
  expect((await waiting).status).toBe(403)
  expect((await fresh()).meetingLink).toBeNull()
})

test.each(['missing', 'pending', 'mismatch', 'refunded', 'credit-pending'])('an unfunded reschedule (%s) exposes no room and cannot be delivered', async funding => {
  if (funding === 'missing') await prisma.payment.delete({ where: { bookingId } })
  else await prisma.payment.update({ where: { bookingId }, data: funding === 'pending' ? { statusEnum: 'PENDING' }
    : funding === 'mismatch' ? { amountPaise: 1 }
      : funding === 'refunded' ? { statusEnum: 'REFUNDED' }
        : { gateway: 'vip_credit', amountPaise: 0, statusEnum: 'PENDING' } })
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'RESCHEDULED', meetingLink: 'https://meeting.example.test/private-legacy-room' } })
  const paymentBefore = await prisma.payment.findUnique({ where: { bookingId } })
  const creditsBefore = (await prisma.user.findUniqueOrThrow({ where: { id: users[2] } })).freeSessionCredits
  expect((await link('https://meeting.example.test/blocked')).status).toBe(409)
  const practitionerRows = await (await listHealer(new NextRequest('http://localhost/api/healer/bookings'))).json()
  expect(practitionerRows.data.find((row: { id: string }) => row.id === bookingId).meetingLink).toBeNull()
  mockActor = { user: { id: users[2], role: 'USER' } }
  const listed = await (await listCustomer(new NextRequest('http://localhost/api/bookings'))).json()
  expect(listed.data.find((row: { id: string }) => row.id === bookingId)).toMatchObject({ meetingLink: null, needsConfirmation: true })
  const detail = await detailCustomer(new NextRequest('http://localhost/booking'), params())
  expect((await detail.json()).data).toMatchObject({ meetingLink: null, needsConfirmation: true })
  const exported = await calendar(new Request('http://localhost/calendar'), params())
  const content = await exported.text()
  expect(content).toContain('STATUS:TENTATIVE')
  expect(content).not.toContain('URL:')
  expect(content).not.toContain('private-legacy-room')
  await prisma.booking.update({ where: { id: bookingId }, data: { scheduledAt: new Date(Date.now() - 7200000) } })
  mockActor = { user: { id: users[0], role: 'HEALER' } }
  expect((await patch({ action: 'COMPLETE' })).status).toBe(409)
  expect((await fresh()).status).toBe('RESCHEDULED')
  expect(await prisma.payment.findUnique({ where: { bookingId } })).toEqual(paymentBefore)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: users[2] } })).freeSessionCredits).toBe(creditsBefore)
  expect(await prisma.activityLog.count({ where: { entityId: bookingId } })).toBe(0)
})

test.each(['paid', 'credit', 'free', 'legacy-confirmed'])('a %s appointment still exposes its room through owned reads and calendar', async funding => {
  if (funding === 'free' || funding === 'legacy-confirmed') await prisma.payment.delete({ where: { bookingId } })
  if (funding === 'credit') await prisma.payment.update({ where: { bookingId }, data: { gateway: 'vip_credit', amountPaise: 0 } })
  await prisma.booking.update({ where: { id: bookingId }, data: { status: funding === 'legacy-confirmed' ? 'CONFIRMED' : 'RESCHEDULED', ...(funding === 'free' ? { pricePaise: 0 } : {}) } })
  expect((await link('https://meeting.example.test/funded-room')).status).toBe(200)
  mockActor = { user: { id: users[2], role: 'USER' } }
  const detail = await detailCustomer(new NextRequest('http://localhost/booking'), params())
  expect((await detail.json()).data).toMatchObject({ meetingLink: 'https://meeting.example.test/funded-room', needsConfirmation: false })
  const content = await (await calendar(new Request('http://localhost/calendar'), params())).text()
  expect(content).toContain('STATUS:CONFIRMED')
  expect(content).toContain('URL:https://meeting.example.test/funded-room')
})
