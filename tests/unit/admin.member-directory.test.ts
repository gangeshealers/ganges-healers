import {
  ADMIN_MEMBERS_MAX_PAGE, adminMembersWhere, adminMembersHref, parseAdminMembersQuery,
} from '@/lib/admin/member-directory'

describe('admin member directory filters', () => {
  test('searches by exact ID or literal partial account name/email', () => {
    expect(adminMembersWhere('alice@example.test', 'all')).toEqual({
      OR: [
        { id: 'alice@example.test' },
        { email: { contains: 'alice@example.test', mode: 'insensitive' } },
        { name: { contains: 'alice@example.test', mode: 'insensitive' } },
      ],
    })
    expect(adminMembersWhere('betty', 'healer')).toEqual({
      role: 'HEALER',
      OR: [
        { id: 'betty' },
        { email: { contains: 'betty', mode: 'insensitive' } },
        { name: { contains: 'betty', mode: 'insensitive' } },
      ],
    })
    expect(adminMembersWhere('', 'admin')).toEqual({ role: 'ADMIN' })
  })
  test('escapes wildcard characters that would otherwise broaden database LIKE matches', () => {
    expect(adminMembersWhere('staff_%\\', 'user')).toEqual({
      role: 'USER',
      OR: [
        { id: 'staff_%\\' },
        { email: { contains: 'staff\\_\\%\\\\', mode: 'insensitive' } },
        { name: { contains: 'staff\\_\\%\\\\', mode: 'insensitive' } },
      ],
    })
  })
  test('drops invalid or repeated fields and bounds page numbers and query text', () => {
    expect(parseAdminMembersQuery({ q: '  test email  ', role: 'user', page: '5' }))
      .toEqual({ query: 'test email', role: 'user', page: 5 })
    expect(parseAdminMembersQuery({ q: ['account', 'other'], role: ['user', 'admin'], page: ['2', '3'] }))
      .toEqual({ query: '', role: 'all', page: 1 })
    expect(parseAdminMembersQuery({ q: 'a'.repeat(200), role: 'superuser', page: '9999' }))
      .toEqual({ query: 'a'.repeat(100), role: 'all', page: ADMIN_MEMBERS_MAX_PAGE })
    expect(parseAdminMembersQuery({ page: '0' }).page).toBe(1)
    expect(parseAdminMembersQuery({ page: '-2' }).page).toBe(1)
    expect(parseAdminMembersQuery({ page: '1e5' }).page).toBe(1)
  })
  test('role and pagination links preserve only validated filters', () => {
    expect(adminMembersHref('all', '')).toBe('/admin')
    expect(adminMembersHref('healer', 'Alice & Bob', 2))
      .toBe('/admin?role=healer&q=Alice+%26+Bob&page=2')
  })
})
