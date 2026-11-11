import {
  ADMIN_BENEFIT_AUDIT_MAX_PAGE, parseBenefitAuditPage,
  parseBenefitAudit, benefitAuditHref,
} from '@/lib/admin/benefit-audit'

describe('private manual VIP benefit audit decoding', () => {
  const recorded = { before: { vip: false, freeSessionCredits: 2 }, after: { vip: true, freeSessionCredits: 4 }, reason: '  Service recovery  ' }

  test('only known audited fields are extracted; extra metadata is never rendered', () => {
    expect(parseBenefitAudit({ ...recorded, email: 'private@example.test', gatewayKey: 'secret' })).toEqual({
      before: { vip: false, freeSessionCredits: 2 },
      after: { vip: true, freeSessionCredits: 4 },
      reason: 'Service recovery',
    })
  })
  test.each([
    null,
    [],
    { reason: 'legacy' },
    { ...recorded, before: { vip: 'false', freeSessionCredits: 2 } },
    { ...recorded, after: { vip: true, freeSessionCredits: -1 } },
    { ...recorded, after: { vip: true, freeSessionCredits: 0.5 } },
    { ...recorded, after: { vip: true, freeSessionCredits: 2147483648 } },
    { ...recorded, reason: '' },
    { ...recorded, reason: 'a'.repeat(301) },
  ])('invalid/legacy audit entry hides raw metadata rather than inferring state: %p', value => {
    expect(parseBenefitAudit(value)).toBeNull()
  })
  test('page and account link inputs remain bounded and encoded', () => {
    expect(parseBenefitAuditPage('9999')).toBe(ADMIN_BENEFIT_AUDIT_MAX_PAGE)
    for (const value of ['0', '-1', '1e5', ['2', '3'], null]) expect(parseBenefitAuditPage(value)).toBe(1)
    expect(benefitAuditHref('member/id?')).toBe('/admin/members/member%2Fid%3F/benefits')
    expect(benefitAuditHref('account', 3)).toBe('/admin/members/account/benefits?page=3')
  })
})
