import { catalogSearchDestination, searchableCatalogs, searchHubDestination } from '@/lib/search/catalog-destinations'

test('global search previews link to the corresponding full catalog with an encoded query', () => {
  expect(catalogSearchDestination('services', '  Reiki & healing ')).toBe('/services?q=Reiki+%26+healing')
  expect(catalogSearchDestination('healers', 'yoga')).toBe('/healers?q=yoga')
  expect(catalogSearchDestination('programs', 'stress')).toBe('/programs?q=stress')
  expect(catalogSearchDestination('courses', 'reiki')).toBe('/courses?q=reiki')
  expect(catalogSearchDestination('products', 'crystals')).toBe('/store?q=crystals')
  expect(catalogSearchDestination('audio', 'meditation')).toBe('/audio?q=meditation')
  expect(catalogSearchDestination('blog', 'Reiki')).toBe('/blog')
})

test('blank and excessive searches cannot produce huge or unsafe catalog query strings', () => {
  expect(catalogSearchDestination('services', '')).toBe('/services')
  expect(catalogSearchDestination('services', '    ')).toBe('/services')
  const long = catalogSearchDestination('courses', 'x'.repeat(300))
  expect(new URL(long, 'https://local.test').searchParams.get('q')).toHaveLength(120)
  expect(searchHubDestination(' a ')).toBe('/search')
  expect(searchHubDestination('  reiki / calm  ')).toBe('/search?q=reiki+%2F+calm')
  expect(new URL(searchHubDestination('x'.repeat(300)), 'https://local.test').searchParams.get('q')).toHaveLength(200)
})

test('all seven browse destinations are declared without constructing remote URLs', () => {
  expect(Object.keys(searchableCatalogs)).toEqual(['services', 'healers', 'programs', 'courses', 'products', 'audio', 'blog'])
  expect(Object.values(searchableCatalogs).every(catalog => catalog.path.startsWith('/'))).toBe(true)
})
