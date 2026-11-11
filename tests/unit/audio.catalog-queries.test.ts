import { audioCatalogHref, parseAudioCatalogParams } from '@/lib/audio/catalog-queries'

describe('audio library search and navigation', () => {
  test('default state is newest, first page and no filters', () => {
    expect(parseAudioCatalogParams({})).toEqual({ q: '', category: '', sort: 'newest', page: 1 })
    expect(audioCatalogHref(parseAudioCatalogParams({}))).toBe('/audio')
  })

  test('search is bounded and sorted links keep only supported filters', () => {
    const parsed = parseAudioCatalogParams({ category: '  Meditation ', q: '  reiki & calm  ', sort: 'shortest', page: '3' })
    expect(parsed).toEqual({ category: 'Meditation', q: 'reiki & calm', sort: 'shortest', page: 3 })
    expect(audioCatalogHref(parsed)).toBe('/audio?category=Meditation&q=reiki+%26+calm&sort=shortest&page=3')
    expect(parseAudioCatalogParams({ q: 'x'.repeat(180), category: 'y'.repeat(100) })).toMatchObject({
      q: 'x'.repeat(120), category: 'y'.repeat(80),
    })
  })

  test('rejects repeated or unsafe page values and unsupported sort controls', () => {
    for (const page of ['0', '01', '-1', '1.5', '1001', '999999999', 'NaN', '1e2', ['1', '2']]) {
      expect(parseAudioCatalogParams({ page }).page).toBe(1)
    }
    expect(parseAudioCatalogParams({ q: ['first', 'second'], category: ['one', 'two'], sort: 'invalid', page: '2' }))
      .toEqual({ q: '', category: '', sort: 'newest', page: 2 })
    expect(parseAudioCatalogParams({ page: '1000', sort: 'longest' })).toMatchObject({ page: 1000, sort: 'longest' })
  })
})
