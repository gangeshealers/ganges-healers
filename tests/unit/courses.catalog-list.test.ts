import { courseCatalogHref, parseCourseCatalogParams } from '@/lib/courses/catalog-list'

describe('public course catalog search and pagination', () => {
  test('first page and empty search are defaults', () => {
    expect(parseCourseCatalogParams({})).toEqual({ query: '', page: 1 })
    expect(parseCourseCatalogParams({ q: '', page: '1' })).toEqual({ query: '', page: 1 })
    expect(courseCatalogHref('', 1)).toBe('/courses')
  })

  test('valid term trims input and safe page is honored', () => {
    expect(parseCourseCatalogParams({ q: '  Reiki Basics  ', page: '12' })).toEqual({ query: 'Reiki Basics', page: 12 })
    expect(courseCatalogHref('Reiki Basics', 2)).toBe('/courses?q=Reiki+Basics&page=2')
    expect(courseCatalogHref('Reiki Basics', 1)).toBe('/courses?q=Reiki+Basics')
  })

  test('repeated, malformed and excessive pagination is handled safely', () => {
    for (const raw of ['0', '-1', '1.5', '01', '1001', '10000', 'Infinity', '1e2', 'not-a-number']) {
      expect(parseCourseCatalogParams({ page: raw }).page).toBe(1)
    }
    expect(parseCourseCatalogParams({ page: ['1', '999'], q: ['test', 'other'] })).toEqual({ query: '', page: 1 })
    expect(parseCourseCatalogParams({ page: '1000' }).page).toBe(1000)
  })

  test('long terms are bounded and links escape special characters', () => {
    const query = 'x'.repeat(200)
    expect(parseCourseCatalogParams({ q: query }).query).toHaveLength(120)
    const link = courseCatalogHref('reiki & yoga', 3)
    expect(link).toBe('/courses?q=reiki+%26+yoga&page=3')
    expect(link).not.toContain(' ')
  })
})
