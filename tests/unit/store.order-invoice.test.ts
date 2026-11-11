import { prisma } from '@/lib/prisma'
import { ownedStoreInvoiceHref } from '@/lib/store/order-invoice'

jest.mock('@/lib/prisma', () => ({ prisma: { payment: { findFirst: jest.fn() } } }))
const findPayment = prisma.payment.findFirst as jest.Mock

beforeEach(() => { jest.clearAllMocks() })

describe('issued store receipts from an owned order', () => {
  test('unpaid orders do not query payments or invent an invoice link', async () => {
    expect(await ownedStoreInvoiceHref('owner', 'order', null)).toBeNull()
    expect(findPayment).not.toHaveBeenCalled()
  })

  test('reads only the owner-bound store payment, then links the real invoice number', async () => {
    findPayment.mockResolvedValue({
      metadata: { orderId: 'order_123' },
      invoice: { id: 'invoice_123', invoiceNumber: 'INV-123' },
    })
    await expect(ownedStoreInvoiceHref('owner_123', 'order_123', 'payment_123'))
      .resolves.toBe('/invoices/INV-123/view')
    expect(findPayment).toHaveBeenCalledWith({
      where: { id: 'payment_123', userId: 'owner_123', type: 'STORE' },
      select: { metadata: true, invoice: { select: { invoiceNumber: true, id: true } } },
    })
  })

  test('rejects a missing invoice or explicit mismatched resource binding', async () => {
    findPayment.mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ invoice: null, metadata: { orderId: 'order_123' } })
      .mockResolvedValueOnce({ invoice: { id: 'invoice_other', invoiceNumber: 'INV-OTHER' }, metadata: { orderId: 'order_other' } })
    for (let i = 0; i < 3; i++) {
      await expect(ownedStoreInvoiceHref('owner_123', 'order_123', 'payment_123')).resolves.toBeNull()
    }
  })

  test('preserves older settled orders whose payment did not carry a resource ID', async () => {
    findPayment.mockResolvedValue({
      metadata: null,
      invoice: { id: 'invoice_older', invoiceNumber: 'INV-OLDER' },
    })
    await expect(ownedStoreInvoiceHref('owner_123', 'order_older', 'payment_older'))
      .resolves.toBe('/invoices/INV-OLDER/view')
  })
})
