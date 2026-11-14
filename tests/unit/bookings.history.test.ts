import {
  BOOKING_HISTORY_MAX_PAGE,
  bookingHistoryWhere, bookingHistoryHref, bookingHistoryExportHref,
  bookingHistoryCsv, parseBookingHistoryFilters,
} from '@/lib/bookings/history'

describe('private booking history filters and CSV', () => {
  test('always scopes historical bookings to the owner and excludes live future appointments', () => {
    const now = new Date('2026-11-11T12:00:00.000Z')
    expect(bookingHistoryWhere('owner', 'all', '', now)).toEqual({
      userId: 'owner',
      OR: [{ scheduledAt: { lt: now } }, { status: { in: ['COMPLETED', 'CANCELLED'] } }],
    })
    expect(bookingHistoryWhere('different-owner', 'cancelled', 'reiki', now)).toEqual({
      userId: 'different-owner',
      OR: [{ scheduledAt: { lt: now } }, { status: { in: ['COMPLETED', 'CANCELLED'] } }],
      status: 'CANCELLED',
      service: { name: { contains: 'reiki', mode: 'insensitive' } },
    })
  })

  test('bounds page offsets, search and duplicate/invalid URL filters', () => {
    expect(parseBookingHistoryFilters({ status: 'cancelled', q: '  calming breath  ', page: '4' }))
      .toEqual({ status: 'cancelled', query: 'calming breath', page: 4 })
    expect(parseBookingHistoryFilters({ status: ['completed', 'cancelled'], page: ['2', '3'], q: ['test'] }))
      .toEqual({ status: 'all', query: '', page: 1 })
    expect(parseBookingHistoryFilters({ status: 'other', page: '9999', q: 'X'.repeat(200) }))
      .toEqual({ status: 'all', page: BOOKING_HISTORY_MAX_PAGE, query: 'X'.repeat(80) })
    expect(parseBookingHistoryFilters({ page: '0' }).page).toBe(1)
    expect(parseBookingHistoryFilters({ page: '-1' }).page).toBe(1)
  })

  test('history links and export links preserve only the selected filters', () => {
    expect(bookingHistoryHref('all', '')).toBe('/dashboard/bookings/history')
    expect(bookingHistoryHref('completed', 'Reiki & Yoga', 2))
      .toBe('/dashboard/bookings/history?status=completed&q=Reiki+%26+Yoga&page=2')
    expect(bookingHistoryExportHref('completed', 'Reiki & Yoga'))
      .toBe('/api/bookings/history/export?status=completed&q=Reiki+%26+Yoga')
  })

  test('CSV contains only appointment metadata, escapes formulas and leaves no customer identity', () => {
    const output = bookingHistoryCsv([{
      id: 'booking-xyz',
      scheduledAt: new Date('2026-07-01T04:30:00.000Z'),
      status: 'COMPLETED',
      durationMin: 60,
      service: { name: '=SUM(A1:A5), "breathwork"' },
      healer: { user: { name: '+Bob\r\nB' } },
    }])
    expect(output.startsWith('\uFEFF')).toBe(true)
    expect(output).toContain('"2026-07-01T04:30:00.000Z"')
    expect(output).toContain('"\u0027=SUM(A1:A5), ""breathwork"""')
    expect(output).toContain('"\u0027+Bob\r\nB"')
    expect(output).toContain('"booking-xyz"')
    expect(output).not.toMatch(/email|password|meeting url|customer name/i)
    expect(output.endsWith('\r\n')).toBe(true)
  })

  test('empty history still creates a valid importable CSV header', () => {
    const output = bookingHistoryCsv([])
    expect(output).toContain('"Appointment At (UTC)"')
    expect(output.split('\r\n')).toHaveLength(2)
  })
})
