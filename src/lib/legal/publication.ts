import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { POLICY_PAGES, type PolicyPageKind } from '@/lib/legal/routes'
export { POLICY_PAGES, LEGAL_DOCUMENT_SLUGS, type PolicyPageKind } from '@/lib/legal/routes'

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
