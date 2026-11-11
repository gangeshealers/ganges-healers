import { prisma } from '@/lib/prisma'
import { resolveInvoiceUrl } from '@/lib/invoices/resolve'
import { generateInvoiceForPayment } from '@/lib/invoices/generate'

/**
 * The current Payment schema has no invoiceUrl column. These reads must work
 * against that real schema rather than relying on swallowed PostgreSQL 42703
 * errors; the relation-based invoice path is still authoritative.
 */
describe('optional legacy Payment.invoiceUrl compatibility', () => {
  let paymentId: string

  beforeAll(async () => {
    const payment = await prisma.payment.create({
      data: { gateway: 'razorpay', status: 'success', amountPaise: 2500 },
    })
    paymentId = payment.id
  })

  afterAll(async () => {
    if (paymentId) {
      await prisma.invoice.deleteMany({ where: { paymentId } })
      await prisma.payment.delete({ where: { id: paymentId } })
    }
    await prisma.$disconnect()
  })

  test('missing legacy column returns null rather than a database error', async () => {
    const rows = await prisma.$queryRaw<Array<{ invoiceUrl: string | null }>>`
      SELECT to_jsonb(p)->>'invoiceUrl' AS "invoiceUrl"
      FROM "Payment" p WHERE p."id" = ${paymentId} LIMIT 1
    `
    expect(rows).toEqual([{ invoiceUrl: null }])
    expect(await resolveInvoiceUrl(paymentId)).toBeNull()
  })

  test('related invoice remains discoverable and generation is idempotent', async () => {
    const url = 'https://blob.example.com/retained-invoice.pdf'
    const invoice = await prisma.invoice.create({
      data: {
        paymentId, invoiceNumber: `INV-LEGACY-${paymentId}`,
        billTo: { name: 'Test member' }, lineItems: [],
        subtotalPaise: 2500, taxPaise: 0, totalPaise: 2500, pdfUrl: url,
      },
    })
    expect(await resolveInvoiceUrl(paymentId)).toBe(url)
    expect(await resolveInvoiceUrl(invoice.invoiceNumber)).toBe(url)
    const result = await generateInvoiceForPayment({ paymentId, sendEmail: false })
    expect(result).toMatchObject({ ok: true, idempotent: true, url })
  })
})
