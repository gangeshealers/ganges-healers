/** Present only stock claims supported by the catalog's actual quantity/status. */
export type StockPresentation = {
  label: string
  available: boolean
  tone: 'out' | 'low' | 'normal'
}

export function getStockPresentation(status: string, count: number | null | undefined): StockPresentation {
  const quantity = typeof count === 'number' && Number.isFinite(count) ? Math.trunc(count) : null
  if (status === 'OUT' || (quantity !== null && quantity <= 0)) {
    return { label: 'Out of stock', available: false, tone: 'out' }
  }
  if (quantity !== null && quantity <= 5) {
    return { label: `${quantity} in stock`, available: true, tone: 'low' }
  }
  if (status === 'LOW') {
    return { label: 'Low stock', available: true, tone: 'low' }
  }
  return { label: 'In stock', available: true, tone: 'normal' }
}
