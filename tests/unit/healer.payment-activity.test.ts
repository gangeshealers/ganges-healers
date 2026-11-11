import {
  healerActivityFilters, healerActivityHref, healerActivityStart,
  healerActivityWhere, healerActivityCsv,
} from '@/lib/healer/payment-activity'

describe('practitioner session payment activity', () => {
  test('filters only confirmed INR payments attached to the requesting healer', () => {
    const now = new Date('2026-11-11T18:29:00.000Z') // already Nov 12 in IST
    expect(healerActivityStart('month', now)?.toISOString()).toBe('2026-10-31T18:30:00.000Z')
    expect(healerActivityWhere('healer-1', 'month', now)).toEqual({
      booking: { healerId: 'healer-1' },
      statusEnum: 'SUCCESS',
      currency: 'INR',
      createdAt: { gte: new Date('2026-10-31T18:30:00.000Z') },
    })
    expect(healerActivityWhere('healer-2', 'all', now)).toEqual({
      booking: { healerId: 'healer-2' },
      statusEnum: 'SUCCESS',
      currency: 'INR',
    })
    expect(healerActivityStart('90days', now)?.getTime()).toBe(now.getTime() - 90 * 86400000)
  })

  test('rejects repeated/invalid filters and bounds pages', () => {
    expect(healerActivityFilters({ period: ['all', 'month'], page: ['2', '3'] })).toEqual({ period: 'month', page: 1 })
    expect(healerActivityFilters({ period: 'all', page: '9999' })).toEqual({ period: 'all', page: 1000 })
    expect(healerActivityFilters({ period: '90days', page: '0' })).toEqual({ period: '90days', page: 1 })
    expect(healerActivityHref('90days', 2)).toBe('/healer/payments?period=90days&page=2')
  })

  test('CSV safely escapes service names including formula injection and multiline strings', () => {
    const csv = healerActivityCsv([{
      id: 'internal-payment-id',
      createdAt: new Date('2026-11-11T08:00:00Z'),
      amountPaise: 25000,
      booking: {
        id: 'booking-1', scheduledAt: new Date('2026-11-12T04:30:00Z'),
        service: { name: '=1+1,"meditation"\r\nSHEET:other' },
      },
    }])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"Payment Record Created (UTC)"')
    expect(csv).toContain('"2026-11-11T08:00:00.000Z"')
    expect(csv).toContain('"250.00"')
    expect(csv).toContain('"\u0027=1+1,""meditation""\r\nSHEET:other"')
    expect(csv).toContain('"booking-1"')
    expect(csv).not.toContain('internal-payment-id')
    expect(csv).not.toContain('user@example.test')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  test('valid empty exports are still spreadsheets with no fabricated payments', () => {
    expect(healerActivityCsv([])).toContain('"Gross Amount (INR)"')
    expect(healerActivityCsv([]).split('\r\n')).toHaveLength(2)
  })
})
