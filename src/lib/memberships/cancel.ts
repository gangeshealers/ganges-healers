import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import { membershipQuoteId } from './checkout'

export class MembershipCancellationError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message)
  }
}

type ProviderSubscription = { id: string; plan_id?: string; status: string }
type SubscriptionProvider = {
  fetch(id: string): Promise<ProviderSubscription>
  cancel(id: string, options: { cancel_at_cycle_end: boolean }): Promise<ProviderSubscription>
}

function validQuote(
  metadata: unknown,
  quoteUserId: string | null,
  userId: string,
  membershipId: string,
  subscriptionId: string
): metadata is { kind: 'membership'; membershipId: string; subscriptionId: string; razorpayPlanId: string } {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  const quote = metadata as Record<string, unknown>
  return quoteUserId === userId && quote.kind === 'membership'
    && quote.membershipId === membershipId && quote.subscriptionId === subscriptionId
    && typeof quote.razorpayPlanId === 'string' && quote.razorpayPlanId.length > 0
}

/**
 * End an authenticated owner's single-cycle VIP agreement immediately.
 * Only a confirmed provider cancellation/completion can revoke local access.
 * This does not refund charges and never removes previously granted credits.
 */
export async function endMembershipNow(userId: string, membershipId: string, provider: SubscriptionProvider) {
  const membership = await prisma.vIPMembership.findFirst({
    where: { id: membershipId, userId },
    select: { id: true, userId: true, subscriptionId: true, status: true },
  })
  if (!membership) throw new MembershipCancellationError('NOT_FOUND', 404, 'Membership not found.')
  if (membership.status === 'cancelled') return { status: 'cancelled' as const, alreadyEnded: true }

  const quote = await prisma.payment.findUnique({ where: { id: membershipQuoteId(membership.id) } })
  if (!validQuote(quote?.metadata, quote?.userId ?? null, userId, membership.id, membership.subscriptionId)) {
    throw new MembershipCancellationError('RECONCILIATION_REQUIRED', 409, 'Please contact support to end this membership safely.')
  }

  // Remote calls must happen outside transactions. A failed/uncertain response
  // leaves the local membership unchanged and permits a safe status retry.
  let remote: ProviderSubscription
  try {
    remote = await provider.fetch(membership.subscriptionId)
    if (remote.id !== membership.subscriptionId || remote.plan_id !== quote.metadata.razorpayPlanId) {
      throw new MembershipCancellationError('PROVIDER_MISMATCH', 409, 'Please contact support to verify this subscription.')
    }
    if (remote.status !== 'cancelled' && remote.status !== 'completed') {
      remote = await provider.cancel(membership.subscriptionId, { cancel_at_cycle_end: false })
    }
  } catch (error) {
    if (error instanceof MembershipCancellationError) throw error
    throw new MembershipCancellationError('PROVIDER_UNAVAILABLE', 502, 'Cancellation could not be confirmed. Please retry or contact support.')
  }

  if (remote.id !== membership.subscriptionId || remote.plan_id !== quote.metadata.razorpayPlanId || !['cancelled', 'completed'].includes(remote.status)) {
    throw new MembershipCancellationError('PROVIDER_UNCONFIRMED', 502, 'Cancellation is awaiting provider confirmation. Please refresh your membership before retrying.')
  }

  return prisma.$transaction(async tx => {
    await lockTransaction(tx, 'membership', userId)
    const current = await tx.vIPMembership.findFirst({ where: { id: membershipId, userId } })
    const currentQuote = await tx.payment.findUnique({ where: { id: membershipQuoteId(membershipId) } })
    if (!current || current.subscriptionId !== membership.subscriptionId
      || !validQuote(currentQuote?.metadata, currentQuote?.userId ?? null, userId, membershipId, membership.subscriptionId)) {
      throw new MembershipCancellationError('MEMBERSHIP_CHANGED', 409, 'Membership details changed. Please reload and contact support.')
    }

    if (current.status !== 'cancelled') {
      await tx.vIPMembership.update({
        where: { id: membershipId },
        data: { status: 'cancelled', cancelledAt: new Date(), nextBillingAt: null },
      })
    }
    const remainingActive = await tx.vIPMembership.count({
      where: { userId, status: 'active', OR: [{ endDate: null }, { endDate: { gt: new Date() } }] },
    })
    await tx.user.update({ where: { id: userId }, data: { vip: remainingActive > 0 } })
    return { status: 'cancelled' as const, alreadyEnded: current.status === 'cancelled' }
  })
}
