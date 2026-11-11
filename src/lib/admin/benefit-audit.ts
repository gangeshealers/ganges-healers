export const ADMIN_BENEFIT_AUDIT_PAGE_SIZE = 20
export const ADMIN_BENEFIT_AUDIT_MAX_PAGE = 1000

export function parseBenefitAuditPage(raw: unknown): number {
  if (typeof raw !== 'string' || !/^[1-9]\d{0,3}$/.test(raw)) return 1
  return Math.min(Number(raw), ADMIN_BENEFIT_AUDIT_MAX_PAGE)
}

export function benefitAuditHref(userId: string, page = 1) {
  const path = '/admin/members/' + encodeURIComponent(userId) + '/benefits'
  return page > 1 ? path + '?page=' + String(page) : path
}

type BenefitsSnapshot = { vip: boolean; freeSessionCredits: number }
export type BenefitAuditChange = { before: BenefitsSnapshot; after: BenefitsSnapshot; reason: string }

function snapshot(value: unknown): BenefitsSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (typeof input.vip !== 'boolean' ||
      typeof input.freeSessionCredits !== 'number' ||
      !Number.isSafeInteger(input.freeSessionCredits) ||
      input.freeSessionCredits < 0 || input.freeSessionCredits > 2147483647) return null
  return { vip: input.vip, freeSessionCredits: input.freeSessionCredits }
}

/** Only render known audit fields. Never render a raw, untrusted metadata blob. */
export function parseBenefitAudit(metadata: unknown): BenefitAuditChange | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const fields = metadata as Record<string, unknown>
  const before = snapshot(fields.before), after = snapshot(fields.after)
  const reason = fields.reason
  if (!before || !after || typeof reason !== 'string' || !reason.trim() || reason.length > 300) return null
  return { before, after, reason: reason.trim() }
}
