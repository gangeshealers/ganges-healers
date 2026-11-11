import { isLegalDocumentSlug, publicArticleHref, LEGAL_DOCUMENT_SLUGS } from '@/lib/legal/routes'

test('published legal documents use the actual policy routes in admin previews and public links', () => {
  expect(LEGAL_DOCUMENT_SLUGS).toEqual(['privacy-policy', 'terms-of-service'])
  expect(publicArticleHref('privacy-policy')).toBe('/privacy')
  expect(publicArticleHref('terms-of-service')).toBe('/terms')
  expect(isLegalDocumentSlug('privacy-policy')).toBe(true)
  expect(isLegalDocumentSlug('terms-of-service')).toBe(true)
})

test('ordinary wellness articles retain their existing URL contract', () => {
  expect(isLegalDocumentSlug('breathing-practices')).toBe(false)
  expect(publicArticleHref('breathing-practices')).toBe('/blog/breathing-practices')
})
