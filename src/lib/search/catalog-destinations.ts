/**
 * Global search displays up to 10 matches per category. These links let
 * visitors continue in each complete catalog without changing the search API.
 */
export const searchableCatalogs = {
  services: { title: 'Services', path: '/services' },
  healers: { title: 'Healers', path: '/healers' },
  programs: { title: 'Programs', path: '/programs' },
  courses: { title: 'Courses', path: '/courses' },
  products: { title: 'Store products', path: '/store' },
  audio: { title: 'Audio', path: '/audio' },
  blog: { title: 'Articles', path: '/blog' },
} as const

export type SearchCatalogKind = keyof typeof searchableCatalogs

export function catalogSearchDestination(kind: SearchCatalogKind, query: string) {
  const path = searchableCatalogs[kind].path
  // Blog browsing does not support a q filter yet. Do not falsely imply that it does.
  if (kind === 'blog') return path
  const q = query.trim().slice(0, 120)
  if (!q) return path
  const params = new URLSearchParams({ q })
  return `${path}?${params.toString()}`
}

export function searchHubDestination(query: string) {
  const q = query.trim().slice(0, 200)
  return q.length >= 2 ? `/search?${new URLSearchParams({ q })}` : '/search'
}
