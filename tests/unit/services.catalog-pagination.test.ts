import { parseCatalogPage, parseServiceCatalogSort, parseServiceFormat } from '@/lib/services/catalog-filters'

describe('public services catalog page parser', () => {
  test('defaults safely for missing, repeated and malformed values', () => {
    for (const value of [undefined, null, '', '0', '-1', '1.1', '1e2', 'NaN', '1001', '001', ['1', '2']]) {
      expect(parseCatalogPage(value)).toBe(1)
    }
  })
  test('accepts only bounded positive integer pages', () => {
    expect(parseCatalogPage('1')).toBe(1)
    expect(parseCatalogPage('12')).toBe(12)
    expect(parseCatalogPage('1000')).toBe(1000)
    expect(parseCatalogPage(' 20 ')).toBe(20)
  })
})

describe('public service catalog sort parser', () => {
  test.each(['newest', 'popular', 'price_asc', 'price_desc'])('accepts an explicit supported sort (%s)', value => {
    expect(parseServiceCatalogSort(value)).toBe(value)
  })

  test.each([undefined, null, '', 'rating', 'POPULAR', 'price_ascending', ['popular', 'price_asc']])(
    'defaults to newest for malformed, unknown and repeated sorts (%j)',
    value => expect(parseServiceCatalogSort(value)).toBe('newest'),
  )
})

describe('public service format filter parser', () => {
  test.each(['online', 'in_person'])('accepts supported session format (%s)', value => {
    expect(parseServiceFormat(value)).toBe(value)
  })
  test.each([undefined, null, '', 'all', 'ONLINE', 'offline', ['online', 'in_person']])(
    'defaults to all formats for invalid or repeated values (%j)',
    value => expect(parseServiceFormat(value)).toBe('all'),
  )
})
