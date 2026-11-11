import {
  ADMIN_STORE_ORDER_MAX_PAGE, adminStoreOrdersWhere,
  adminStoreOrdersHref, parseAdminStoreOrders,
} from '@/lib/admin/order-lookup'

describe('admin store order operational lookup', () => {
  test('only known queues have server-defined order states, exact IDs never become broad search', () => {
    expect(adminStoreOrdersWhere('paid', '')).toEqual({ status: 'paid' })
    expect(adminStoreOrdersWhere('shipped', '')).toEqual({ status: 'shipped' })
    expect(adminStoreOrdersWhere('delivered', '')).toEqual({ status: { in: ['delivered', 'fulfilled'] } })
    expect(adminStoreOrdersWhere('all', 'order-exact')).toEqual({ id: 'order-exact' })
    expect(adminStoreOrdersWhere('paid', 'order-exact')).toEqual({ status: 'paid', id: 'order-exact' })
  })
  test('unknown, duplicated and oversized parameter values cannot create unsafe offsets or wildcard lookup', () => {
    expect(parseAdminStoreOrders({ status: 'all', q: '  order-abc  ', page: '2' }))
      .toEqual({ queue: 'all', query: 'order-abc', page: 2 })
    expect(parseAdminStoreOrders({ status: ['all', 'paid'], q: ['abc'], page: ['2', '3'] }))
      .toEqual({ queue: 'paid', query: '', page: 1 })
    expect(parseAdminStoreOrders({ status: 'unknown', q: 'x'.repeat(240), page: '9999' }))
      .toEqual({ queue: 'paid', query: 'x'.repeat(200), page: ADMIN_STORE_ORDER_MAX_PAGE })
    for (const value of ['0', '-3', 'Infinity', '1e4']) expect(parseAdminStoreOrders({ page: value }).page).toBe(1)
  })
  test('links retain filters, encode exact references and strip default values', () => {
    expect(adminStoreOrdersHref('paid')).toBe('/admin/orders')
    expect(adminStoreOrdersHref('all', 'Order A/B?', 3))
      .toBe('/admin/orders?status=all&q=Order+A%2FB%3F&page=3')
  })
})
