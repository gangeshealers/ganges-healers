import {
  HEALER_HISTORY_MAX_PAGE, healerHistoryWhere, healerHistoryHref, parseHealerHistory,
} from '@/lib/healer/booking-history'

describe('owner-only healer booking history', () => {
  test('past and terminal records are scoped exclusively to current database healer ID', () => {
    const now = new Date('2026-11-11T10:00:00.000Z')
    expect(healerHistoryWhere('healer-owner', 'all', '', now)).toEqual({
      healerId: 'healer-owner',
      OR: [{ scheduledAt: { lt: now } }, { status: { in: ['COMPLETED', 'CANCELLED'] } }],
    })
    expect(healerHistoryWhere('different-healer', 'cancelled', 'sound bath', now)).toEqual({
      healerId: 'different-healer',
      OR: [{ scheduledAt: { lt: now } }, { status: { in: ['COMPLETED', 'CANCELLED'] } }],
      status: 'CANCELLED',
      service: { name: { contains: 'sound bath', mode: 'insensitive' } },
    })
  })
  test('status, search and page inputs cannot change owner or create unbounded offsets', () => {
    expect(parseHealerHistory({ status: 'completed', q: '  Breath Work  ', page: '2' }))
      .toEqual({ status: 'completed', query: 'Breath Work', page: 2 })
    expect(parseHealerHistory({ status: ['completed', 'cancelled'], q: ['private'], page: ['4', '5'] }))
      .toEqual({ status: 'all', query: '', page: 1 })
    expect(parseHealerHistory({ status: 'other', q: 'a'.repeat(120), page: '9999' }))
      .toEqual({ status: 'all', query: 'a'.repeat(80), page: HEALER_HISTORY_MAX_PAGE })
    expect(parseHealerHistory({ page: '-1' }).page).toBe(1)
  })
  test('pagination retains only validated search and statuses', () => {
    expect(healerHistoryHref('all')).toBe('/healer/bookings/history')
    expect(healerHistoryHref('cancelled', 'Reiki & Yoga', 4))
      .toBe('/healer/bookings/history?status=cancelled&q=Reiki+%26+Yoga&page=4')
  })
})
