import { filterHelpQuestions, helpCategories, helpQuestions } from '@/lib/help/faq'

describe('public help content and search', () => {
  test('all published help topics have distinct IDs and working local destinations', () => {
    expect(helpQuestions.length).toBeGreaterThanOrEqual(10)
    expect(new Set(helpQuestions.map(item => item.id)).size).toBe(helpQuestions.length)
    for (const item of helpQuestions) {
      expect(item.question.length).toBeGreaterThan(10)
      expect(item.answer.length).toBeGreaterThan(20)
      expect(item.link.href).toMatch(/^\/[a-z][a-z0-9/\-]*$/)
      expect(helpCategories).toContain(item.category)
    }
  })

  test('category selection and answer search work together', () => {
    const results = filterHelpQuestions('refund', 'Sessions')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every(item => item.category === 'Sessions')).toBe(true)
    expect(results.some(item => item.id === 'cancel-refund')).toBe(true)
    expect(filterHelpQuestions('unfindable-string-zz', 'All topics')).toEqual([])
  })

  test('search is trimmed, case-insensitive and does not depend on a network request', () => {
    expect(filterHelpQuestions('  PAYMENT  ', 'All topics').length).toBeGreaterThan(0)
    expect(filterHelpQuestions('', 'All topics')).toHaveLength(helpQuestions.length)
    expect(filterHelpQuestions('x'.repeat(200), 'All topics')).toHaveLength(0)
  })

  test('cancellation guidance reflects the coded 24-hour and 48-hour refund policy', () => {
    const text = helpQuestions.find(x => x.id === 'cancel-refund')?.answer
    expect(text).toMatch(/48 hours/)
    expect(text).toMatch(/24 to under 48/)
    expect(text).toMatch(/no refund within 24 hours/)
    expect(text).toMatch(/provider confirmation/)
  })
})
