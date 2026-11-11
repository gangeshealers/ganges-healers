/** Choose a deployable origin without publishing an unexpanded domain placeholder. */
export function siteOrigin(configuredUrl?: string, deploymentHost?: string): string {
  const configured = configuredUrl?.trim()
  if (configured) {
    try {
      const url = new URL(configured)
      // Production canonicals need HTTPS. Local HTTP development remains supported.
      if (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
        return url.origin
      }
    } catch {
      // A placeholder or malformed URL is not suitable for public SEO metadata.
    }
  }

  const host = deploymentHost?.trim()
  if (host && /^(?=.{1,253}$)[a-z0-9.-]+$/i.test(host) &&
    !host.startsWith('.') && !host.endsWith('.') && !host.includes('..')) {
    return `https://${host}`
  }

  // Local dev/tests only. Production must set NEXT_PUBLIC_SITE_URL or provide
  // a Vercel deployment host; the release checklist requires an approved domain.
  return 'http://localhost:3000'
}

export const SITE_URL = siteOrigin(process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_URL)

export function canonicalOf(path: string, stripParams: string[] = []): string {
  const url = new URL(path, SITE_URL)
  for (const key of stripParams) url.searchParams.delete(key)
  return url.toString().replace(/\/$/, '')
}
