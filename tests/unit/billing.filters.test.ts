import { BILLING_MAX_PAGE, BILLING_PAGE_SIZE, billingPageHref, billingExportHref, parseBillingFilters } from '@/lib/invoices/billing-filters'

describe('owner billing history filters', () => {
  test('uses safe defaults for invalid, repeated or extreme page values', () => {
    expect(BILLING_PAGE_SIZE).toBe(25)
    expect(parseBillingFilters()).toEqual({ page: 1, type: 'ALL', query: '' })
    expect(parseBillingFilters({ page: ['2', '999'], type: ['SESSION', 'STORE'], q: ['x'] })).toEqual({ page: 1, type: 'ALL', query: '' })
    for (const page of ['0', '-1', '1.5', 'Infinity', '1e5', ' 2 ', '999999999999999999999']) {
      expect(parseBillingFilters({ page }).page).toBe(1)
    }
    expect(parseBillingFilters({ page: '9999' }).page).toBe(BILLING_MAX_PAGE)
  })

  test('keeps known payment types and bounds search text', () => {
    expect(parseBillingFilters({ type: 'SESSION', q: ' INV-2026-1 ' })).toEqual({ page: 1, type: 'SESSION', query: 'INV-2026-1' })
    expect(parseBillingFilters({ type: 'store', q: 'x'.repeat(300) })).toEqual({ page: 1, type: 'STORE', query: 'x'.repeat(80) })
    expect(parseBillingFilters({ type: 'UNRECOGNIZED' }).type).toBe('ALL')
  })

  test('exports all matching invoices without inheriting the visible page number', () => {
    const filters = parseBillingFilters({ page: '5', type: 'COURSE', q: ' INV/7 ' })
    expect(billingExportHref(filters)).toBe('/api/invoices/me/export?type=COURSE&q=INV%2F7')
    expect(billingExportHref(parseBillingFilters())).toBe('/api/invoices/me/export')
  })

  test('preserves filters in safe, URL-encoded previous and next page links', () => {
    const filters = parseBillingFilters({ page: '12', type: 'MEMBERSHIP', q: ' INV/27? ' })
    expect(billingPageHref(filters, 13)).toBe('/dashboard/billing?type=MEMBERSHIP&q=INV%2F27%3F&page=13')
    expect(billingPageHref(filters, 1)).toBe('/dashboard/billing?type=MEMBERSHIP&q=INV%2F27%3F')
    expect(billingPageHref(parseBillingFilters(), 1)).toBe('/dashboard/billing')
    expect(billingPageHref(filters, 1000000)).toContain('page=1000')
  })
})
