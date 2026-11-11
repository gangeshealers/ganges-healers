import { publicArticleCountWhere, isPolicyReadable } from '@/lib/admin/publication-readiness'

test('admin public article count excludes the two reserved legal documents', () => {
  expect(publicArticleCountWhere).toEqual({
    published: true,
    slug: { notIn: ['privacy-policy', 'terms-of-service'] },
  })
})

test('legal publication status requires actual nonblank published text', () => {
  expect(isPolicyReadable([], 'privacy')).toBe(false)
  expect(isPolicyReadable([{ slug: 'privacy-policy', content: '  \n  ' }], 'privacy')).toBe(false)
  expect(isPolicyReadable([{ slug: 'privacy-policy', content: 'Approved policy text' }], 'privacy')).toBe(true)
  expect(isPolicyReadable([{ slug: 'privacy-policy', content: 'Approved policy text' }], 'terms')).toBe(false)
  expect(isPolicyReadable([{ slug: 'terms-of-service', content: 'Approved terms' }], 'terms')).toBe(true)
})

test('unrelated blog articles never satisfy a policy launch check', () => {
  const rows = [
    { slug: 'meditation', content: 'An article about meditation' },
    { slug: 'privacy-policy-draft', content: 'Not the reserved policy slug' },
  ]
  expect(isPolicyReadable(rows, 'privacy')).toBe(false)
  expect(isPolicyReadable(rows, 'terms')).toBe(false)
})
