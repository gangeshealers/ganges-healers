import {
  ADMIN_BOOKING_MAX_PAGE, adminBookingWhere, adminBookingHref, parseAdminBookingFilters,
} from '@/lib/admin/booking-explorer'

describe('admin booking operations filters', () => {
  test('date/status filters are independent and exact reference search does not widen results', () => {
    const now = new Date('2026-11-11T12:00:00Z')
    expect(adminBookingWhere('upcoming', 'all', '', now)).toEqual({ scheduledAt: { gte: now } })
    expect(adminBookingWhere('past', 'cancelled', 'booking-exact', now)).toEqual({
      scheduledAt: { lt: now }, status: 'CANCELLED', id: 'booking-exact',
    })
    expect(adminBookingWhere('all', 'rescheduled', '', now)).toEqual({ status: 'RESCHEDULED' })
  })

  test('unknown, repeated and very large filter values return bounded defaults', () => {
    expect(parseAdminBookingFilters({ scope: 'all', status: 'confirmed', q: '  booking-ref  ', page: '9' }))
      .toEqual({ scope: 'all', status: 'confirmed', query: 'booking-ref', page: 9 })
    expect(parseAdminBookingFilters({
      scope: ['past', 'all'], status: ['cancelled'], page: ['2'], q: ['person@example.test'],
    })).toEqual({ scope: 'upcoming', status: 'all', page: 1, query: '' })
    expect(parseAdminBookingFilters({ scope: 'wrong', status: 'unknown', page: '9999', q: 'x'.repeat(150) }))
      .toEqual({ scope: 'upcoming', status: 'all', page: ADMIN_BOOKING_MAX_PAGE, query: 'x'.repeat(100) })
  })

  test('admin links preserve validated dimensions when changing tabs and pages', () => {
    expect(adminBookingHref('upcoming', 'all', '')).toBe('/admin/bookings')
    expect(adminBookingHref('past', 'cancelled', 'booking/ABC', 2))
      .toBe('/admin/bookings?scope=past&status=cancelled&q=booking%2FABC&page=2')
  })
})
