import type { Prisma } from '@prisma/client'
import { BY_TYPE_KEYS } from './metrics-constants'

/** A missing type includes older records with no saved payment type. */
export function reportType(value: string | null) {
  if (!value || value === 'ALL') return {}
  const type = BY_TYPE_KEYS.find(key => key === value)
  return type ? { type } : null
}

// A fully refunded capture still contributes its original amount to gross.
export const capturedPaymentWhere: Prisma.PaymentWhereInput = {
  OR: [
    { statusEnum: { in: ['SUCCESS', 'REFUNDED'] } },
    { statusEnum: null, status: { in: ['success', 'refunded'], mode: 'insensitive' } },
  ],
}

// Older INR payments can predate the currency default.
export const inrPaymentWhere: Prisma.PaymentWhereInput = {
  OR: [{ currency: 'INR' }, { currency: null }],
}
