import {
  ADMIN_SUPPORT_MAX_PAGE,
  ADMIN_SUPPORT_MAX_QUERY,
  adminSupportHref,
  adminSupportWhere,
  parseAdminSupportFilters,
} from '@/lib/support/admin-filters'

describe('private staff support queue filters', () => {
  it('preserves the received-requests default and bounds untrusted inputs', () => {
    expect(parseAdminSupportFilters({})).toEqual({ status: 'OPEN', q: '', page: 1 })
    expect(parseAdminSupportFilters({ status: 'ALL', q: '  bowl return  ', page: '2' }))
      .toEqual({ status: 'ALL', q: 'bowl return', page: 2 })
    expect(parseAdminSupportFilters({ status: 'RESOLVED', page: String(ADMIN_SUPPORT_MAX_PAGE + 1) }).page).toBe(1)
    expect(parseAdminSupportFilters({ page: '1e3' }).page).toBe(1)
    expect(parseAdminSupportFilters({ q: 'x'.repeat(400) }).q).toHaveLength(ADMIN_SUPPORT_MAX_QUERY)
    expect(parseAdminSupportFilters({ status: ['ALL', 'OPEN'], q: ['a', 'b'], page: ['2', '3'] }))
      .toEqual({ status: 'OPEN', q: '', page: 1 })
  })

  it('searches request subject and account identity without reading ticket bodies', () => {
    expect(adminSupportWhere('IN_PROGRESS', 'yoga')).toEqual({
      status: 'IN_PROGRESS',
      OR: [
        { subject: { contains: 'yoga', mode: 'insensitive' } },
        { user: { email: { contains: 'yoga', mode: 'insensitive' } } },
        { user: { name: { contains: 'yoga', mode: 'insensitive' } } },
      ],
    })
    expect(adminSupportWhere('ALL', '')).toEqual({})
  })

  it('treats LIKE tokens as literal text in every searched field', () => {
    const q = '10%_\\'
    const where = adminSupportWhere('OPEN', q)
    expect(where.OR).toEqual([
      { subject: { contains: '10\\%\\_\\\\', mode: 'insensitive' } },
      { user: { email: { contains: '10\\%\\_\\\\', mode: 'insensitive' } } },
      { user: { name: { contains: '10\\%\\_\\\\', mode: 'insensitive' } } },
    ])
  })

  it('preserves the queue view across search, pagination, success and stale replies', () => {
    const href = adminSupportHref('ALL', 'singing bowl', 3, { updated: true })
    expect(href).toBe('/admin/support?status=ALL&q=singing+bowl&page=3&updated=1')
    expect(parseAdminSupportFilters(Object.fromEntries(new URL('https://test.local' + href).searchParams)))
      .toEqual({ status: 'ALL', q: 'singing bowl', page: 3 })
    expect(adminSupportHref('RESOLVED', 'yoga', 1, { error: 'stale' }))
      .toBe('/admin/support?status=RESOLVED&q=yoga&error=stale')
    expect(adminSupportHref('OPEN', '', 1, { error: 'unrecognized' }))
      .toBe('/admin/support?status=OPEN')
  })
})
