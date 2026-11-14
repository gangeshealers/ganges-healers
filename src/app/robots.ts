import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/config/site'

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL.replace(/\/$/, '')
  // Even without an explicit override, Vercel Preview deployments must not be indexed.
  if (process.env.VERCEL_ENV === 'preview' || process.env.NEXT_PUBLIC_ROBOTS === 'disallow_all') {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      sitemap: `${base}/sitemap.xml`,
    }
  }
  // Default production policy: disallow private surfaces; allow others by omission
  return {
    rules: {
      userAgent: '*',
      disallow: [
        '/api/',
        '/admin/',
        '/dashboard/',
        '/auth/',
        '/invoices/*/view',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
