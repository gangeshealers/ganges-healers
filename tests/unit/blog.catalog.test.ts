import { blogCatalogHref, parseBlogCatalogParams } from '@/lib/blog/catalog'

test('article listing defaults safely and preserves URL search terms', () => {
  expect(parseBlogCatalogParams({})).toEqual({ q: '', page: 1 })
  expect(parseBlogCatalogParams({ q: ' Reiki & Sound ', page: '2' })).toEqual({ q: 'Reiki & Sound', page: 2 })
  expect(blogCatalogHref('Reiki & Sound', 2)).toBe('/blog?q=Reiki+%26+Sound&page=2')
  expect(blogCatalogHref('', 1)).toBe('/blog')
  expect(blogCatalogHref('Meditation', 1)).toBe('/blog?q=Meditation')
})

test('repeated, malformed and huge page values are rejected', () => {
  for (const page of [undefined, ['1', '2'], '0', '01', '1.2', '-1', '1e4', '1001', '999999', 'Infinity']) {
    expect(parseBlogCatalogParams({ page }).page).toBe(1)
  }
  expect(parseBlogCatalogParams({ page: '1000' }).page).toBe(1000)
  expect(parseBlogCatalogParams({ q: ['one', 'two'] }).q).toBe('')
  expect(parseBlogCatalogParams({ q: 'x'.repeat(300) }).q).toHaveLength(120)
})
