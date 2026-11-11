/** Pure public routes: usable in both the browser editor and server-side publishing. */
export const POLICY_PAGES = {
  privacy: { slug: 'privacy-policy', title: 'Privacy Policy', description: 'Published Ganges Healers privacy information.' },
  terms: { slug: 'terms-of-service', title: 'Terms of Service', description: 'Published Ganges Healers service terms.' },
} as const

export type PolicyPageKind = keyof typeof POLICY_PAGES
export const LEGAL_DOCUMENT_SLUGS = Object.values(POLICY_PAGES).map(page => page.slug)

export function isLegalDocumentSlug(slug: string): boolean {
  return LEGAL_DOCUMENT_SLUGS.some(item => item === slug)
}

export function publicArticleHref(slug: string): string {
  for (const [route, page] of Object.entries(POLICY_PAGES)) {
    if (page.slug === slug) return `/${route}`
  }
  return `/blog/${encodeURIComponent(slug)}`
}
