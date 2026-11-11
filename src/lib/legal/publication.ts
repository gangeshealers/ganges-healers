import { cache } from 'react'
import { prisma } from '@/lib/prisma'

export const POLICY_PAGES = {
  privacy: { slug: 'privacy-policy', title: 'Privacy Policy', description: 'Published Ganges Healers privacy information.' },
  terms: { slug: 'terms-of-service', title: 'Terms of Service', description: 'Published Ganges Healers service terms.' },
} as const

export type PolicyPageKind = keyof typeof POLICY_PAGES

/** Reserved legal article slugs must not leak into the ordinary wellness blog. */
export const LEGAL_DOCUMENT_SLUGS = Object.values(POLICY_PAGES).map(page => page.slug)

/**
 * Only an admin-published exact reserved slug can appear as a legal document.
 * Existing versioned article publishing and audit logs remain the approval control.
 * cache() deduplicates the metadata/render lookup within one server request.
 */
export const getPublishedPolicy = cache(async (kind: PolicyPageKind) => {
  const slug = POLICY_PAGES[kind].slug
  const row = await prisma.blogPost.findUnique({
    where: { slug, published: true },
    select: { slug: true, title: true, content: true, updatedAt: true },
  })
  return row && row.content.trim().length > 0 ? row : null
})
