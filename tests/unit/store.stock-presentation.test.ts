import { getStockPresentation } from '@/lib/store/stock-presentation'

describe('store availability and stock wording', () => {
  test.each([
    ['OUT', null, 'Out of stock', false],
    ['IN_STOCK', 0, 'Out of stock', false],
    ['LOW', 0, 'Out of stock', false],
    ['IN_STOCK', -2, 'Out of stock', false],
    ['IN_STOCK', 1, '1 in stock', true],
    ['IN_STOCK', 5, '5 in stock', true],
    ['LOW', null, 'Low stock', true],
    ['LOW', 100, 'In stock', true],
    ['IN_STOCK', 6, 'In stock', true],
    ['IN_STOCK', null, 'In stock', true],
  ] as const)('%s with count %s → %s', (status, quantity, label, available) => {
    const result = getStockPresentation(status, quantity)
    expect(result.label).toBe(label)
    expect(result.available).toBe(available)
  })

  test('no unsupported urgency claim when quantity is unknown', () => {
    const display = getStockPresentation('IN_STOCK', null)
    expect(display.label).toBe('In stock')
    expect(display.label).not.toMatch(/few|hurry|selling fast|only/i)
  })
})
