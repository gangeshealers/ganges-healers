import { prisma } from '@/lib/prisma'
import { endMembershipNow, MembershipCancellationError } from '@/lib/memberships/cancel'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    vIPMembership: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
    payment: { findUnique: jest.fn() },
    user: { update: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/db/locks', () => ({ lockTransaction: jest.fn(async () => undefined) }))

const db = prisma as unknown as {
  vIPMembership: { findFirst: jest.Mock; update: jest.Mock; count: jest.Mock }
  payment: { findUnique: jest.Mock }
  user: { update: jest.Mock }
  $transaction: jest.Mock
}

const owner = 'user_owner'
const id = 'membership_123'
const subscriptionId = 'sub_123'
const planId = 'plan_123'
const membership = { id, userId: owner, subscriptionId, status: 'active' }
const quote = { userId: owner, metadata: { kind: 'membership', membershipId: id, subscriptionId, razorpayPlanId: planId } }

function provider(status: string = 'active') {
  return {
    fetch: jest.fn(async () => ({ id: subscriptionId, plan_id: planId, status })),
    cancel: jest.fn(async () => ({ id: subscriptionId, plan_id: planId, status: 'cancelled' })),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  db.vIPMembership.findFirst.mockResolvedValue(membership)
  db.payment.findUnique.mockResolvedValue(quote)
  db.vIPMembership.count.mockResolvedValue(0)
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db))
})

describe('VIP owner-initiated cancellation', () => {
  it('does not access the provider for a missing or unowned membership', async () => {
    db.vIPMembership.findFirst.mockResolvedValueOnce(null)
    const gateway = provider()
    await expect(endMembershipNow(owner, id, gateway)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(gateway.fetch).not.toHaveBeenCalled()
    expect(db.vIPMembership.update).not.toHaveBeenCalled()
  })

  it('refuses legacy/unbound quotes before any gateway mutation', async () => {
    db.payment.findUnique.mockResolvedValueOnce({ ...quote, userId: 'someone_else' })
    const gateway = provider()
    await expect(endMembershipNow(owner, id, gateway)).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED', status: 409 })
    expect(gateway.cancel).not.toHaveBeenCalled()
  })

  it('confirms immediate provider cancellation, updates access, but never changes credits', async () => {
    const gateway = provider()
    const result = await endMembershipNow(owner, id, gateway)
    expect(result).toEqual({ status: 'cancelled', alreadyEnded: false })
    expect(gateway.fetch).toHaveBeenCalledWith(subscriptionId)
    expect(gateway.cancel).toHaveBeenCalledWith(subscriptionId, { cancel_at_cycle_end: false })
    expect(db.vIPMembership.update).toHaveBeenCalledWith({
      where: { id }, data: expect.objectContaining({ status: 'cancelled', nextBillingAt: null }),
    })
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: owner }, data: { vip: false } })
    expect(db.user.update.mock.calls[0][0].data).not.toHaveProperty('freeSessionCredits')
  })

  it('recovers a cancellation the provider already completed without sending it twice', async () => {
    const gateway = provider('cancelled')
    await expect(endMembershipNow(owner, id, gateway)).resolves.toEqual({ status: 'cancelled', alreadyEnded: false })
    expect(gateway.cancel).not.toHaveBeenCalled()
  })

  it('does not revoke membership when the provider outcome is unknown', async () => {
    const gateway = provider()
    gateway.cancel.mockRejectedValueOnce(new Error('network error'))
    await expect(endMembershipNow(owner, id, gateway)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', status: 502 })
    expect(db.vIPMembership.update).not.toHaveBeenCalled()
  })

  it('refuses mismatched provider plans and ambiguous success statuses', async () => {
    const gateway = provider()
    gateway.fetch.mockResolvedValueOnce({ id: subscriptionId, plan_id: 'wrong_plan', status: 'active' })
    await expect(endMembershipNow(owner, id, gateway)).rejects.toMatchObject({ code: 'PROVIDER_MISMATCH', status: 409 })
    expect(gateway.cancel).not.toHaveBeenCalled()

    gateway.fetch.mockResolvedValueOnce({ id: subscriptionId, plan_id: planId, status: 'active' })
    gateway.cancel.mockResolvedValueOnce({ id: subscriptionId, plan_id: planId, status: 'pending' })
    await expect(endMembershipNow(owner, id, gateway)).rejects.toMatchObject({ code: 'PROVIDER_UNCONFIRMED', status: 502 })
    expect(db.vIPMembership.update).not.toHaveBeenCalled()
  })

  it('is idempotent when already cancelled locally', async () => {
    db.vIPMembership.findFirst.mockResolvedValueOnce({ ...membership, status: 'cancelled' })
    const gateway = provider()
    await expect(endMembershipNow(owner, id, gateway)).resolves.toEqual({ status: 'cancelled', alreadyEnded: true })
    expect(gateway.fetch).not.toHaveBeenCalled()
  })
})

// This flow deliberately does not issue a refund. Refunds remain a separate owned payment workflow.
void MembershipCancellationError
