import {
  ORDER_HISTORY_MAX_PAGE,
  ORDER_HISTORY_MAX_QUERY_LENGTH,
  orderHistoryHref,
  orderHistoryWhere,
  parseOrderHistoryParams,
} from '@/lib/store/order-history'

describe('customer order history search', () => {
  it('normalizes filters and bounds excessive or invalid page numbers', () => {
    expect(parseOrderHistoryParams({ status: 'paid', q: '  singing bowl  ', page: '3' }))
      .toEqual({ status: 'paid', q: 'singing bowl', page: 3 })
    expect(parseOrderHistoryParams({ status: 'unknown', page: '-2' }))
      .toEqual({ status: 'all', q: '', page: 1 })
    expect(parseOrderHistoryParams({ page: '99999999999999999999999999999' }).page).toBe(1)
    expect(parseOrderHistoryParams({ page: String(ORDER_HISTORY_MAX_PAGE + 1) }).page)
      .toBe(ORDER_HISTORY_MAX_PAGE)
    expect(parseOrderHistoryParams({ q: 'a'.repeat(200) }).q).toHaveLength(ORDER_HISTORY_MAX_QUERY_LENGTH)
    expect(parseOrderHistoryParams({ q: ['valid', 'unexpected'], status: ['paid', 'all'], page: ['2', '3'] }))
      .toEqual({ status: 'all', q: '', page: 1 })
  })

  it('always enforces account ownership and exact ID matching', () => {
    expect(orderHistoryWhere('owner-123', 'paid', 'order-99')).toEqual({
      userId: 'owner-123',
      status: 'paid',
      OR: [
        { id: 'order-99' },
        { items: { some: { product: { title: { contains: 'order-99', mode: 'insensitive' } } } } },
      ],
    })
    expect(orderHistoryWhere('owner-123', 'all', '')).toEqual({ userId: 'owner-123' })
  })

  it('escapes SQL LIKE wildcard characters in the product-name filter', () => {
    const where = orderHistoryWhere('owner-123', 'all', '100%_\\')
    expect(where).toEqual({
      userId: 'owner-123',
      OR: [
        { id: '100%_\\' },
        { items: { some: { product: { title: { contains: '100\\%\\_\\\\', mode: 'insensitive' } } } } },
      ],
    })
  })

  it('keeps search and status in pagination/filter URLs, and resets the page', () => {
    expect(orderHistoryHref('all', '')).toBe('/dashboard/orders')
    expect(orderHistoryHref('paid', '')).toBe('/dashboard/orders?status=paid')
    expect(orderHistoryHref('paid', 'singing bowl', 2))
      .toBe('/dashboard/orders?status=paid&q=singing+bowl&page=2')
    expect(orderHistoryHref('shipped', 'singing bowl'))
      .toBe('/dashboard/orders?status=shipped&q=singing+bowl')
  })
})
