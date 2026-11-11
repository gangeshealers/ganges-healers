import { parseCatalogPage } from '@/lib/services/catalog-filters'

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
