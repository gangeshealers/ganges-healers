import { LEGAL_DOCUMENT_SLUGS, POLICY_PAGES, type PolicyPageKind } from '@/lib/legal/routes'

/** The public wellness blog must not count approved policy documents as articles. */
export const publicArticleCountWhere = {
  published: true,
  slug: { notIn: LEGAL_DOCUMENT_SLUGS },
} as const

/**
 * The admin launch indicator mirrors the public policy page's nonempty-content
 * publication rule. Presence of a published row alone is not sufficient.
 */
export function isPolicyReadable(
  rows: ReadonlyArray<{ slug: string; content: string }>,
  kind: PolicyPageKind,
): boolean {
  const slug = POLICY_PAGES[kind].slug
  return rows.some(row => row.slug === slug && row.content.trim().length > 0)
}
