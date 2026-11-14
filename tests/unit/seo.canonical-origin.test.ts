import { SITE_URL, canonicalOf, siteOrigin } from '@/config/site'
import robots from '@/app/robots'

describe('public canonical origin', () => {
  test('prefers the approved HTTPS site origin over a deployment hostname', () => {
    expect(siteOrigin('https://gangeshealers.com/', 'preview-123.vercel.app')).toBe('https://gangeshealers.com')
    expect(siteOrigin('http://localhost:3010', 'preview-123.vercel.app')).toBe('http://localhost:3010')
  })

  test('uses the actual Vercel deployment hostname when site domain is not configured', () => {
    expect(siteOrigin(undefined, 'ganges-healers-preview.vercel.app')).toBe('https://ganges-healers-preview.vercel.app')
    expect(siteOrigin('https://<your-prod-domain>', 'ganges-healers-preview.vercel.app')).toBe('https://ganges-healers-preview.vercel.app')
    expect(siteOrigin('http://untrusted.example', 'ganges-healers-preview.vercel.app')).toBe('https://ganges-healers-preview.vercel.app')
  })

  test('does not treat an invalid deployment host as a canonical origin', () => {
    expect(siteOrigin(undefined, 'https://bad.example/evil')).toBe('http://localhost:3000')
    expect(siteOrigin(undefined, 'bad..example')).toBe('http://localhost:3000')
  })

  test('keeps canonical paths absolute and strips only requested query fields', () => {
    const value = canonicalOf('/services/reiki?openBooking=1&ref=profile', ['openBooking'])
    const url = new URL(value)
    expect(url.origin).toBe(new URL(SITE_URL).origin)
    expect(url.pathname).toBe('/services/reiki')
    expect(url.searchParams.has('openBooking')).toBe(false)
    expect(url.searchParams.get('ref')).toBe('profile')
    expect(value).not.toContain('<your-prod-domain>')
  })
})


test('Vercel Preview blocks crawlers even without an explicit robots override', () => {
  const previous = process.env.VERCEL_ENV
  try {
    process.env.VERCEL_ENV = 'preview'
    expect(robots().rules).toEqual([{ userAgent: '*', disallow: '/' }])
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = previous
  }
})
