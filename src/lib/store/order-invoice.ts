import { prisma } from '@/lib/prisma'
import { invoiceViewerHref } from '@/lib/invoices/viewer-link'

/**
 * Resolve an issued store invoice through the owned order's saved payment ID.
 * Never trust a payment or invoice identifier from the URL.
 */
export async function ownedStoreInvoiceHref(ownerId: string, orderId: string, savedPaymentId: string | null) {
  if (!savedPaymentId) return null
  const payment = await prisma.payment.findFirst({
    where: { id: savedPaymentId, userId: ownerId, type: 'STORE' },
    select: { metadata: true, invoice: { select: { invoiceNumber: true, id: true } } },
  })
  if (!payment?.invoice) return null
  const metadata = payment.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const bound = (metadata as Record<string, unknown>).orderId
    // Legacy payments with no saved order reference remain readable through
    // the Order.paymentId relationship; an explicit mismatch fails closed.
    if (bound !== undefined && bound !== orderId) return null
  }
  return invoiceViewerHref(payment.invoice)
}
