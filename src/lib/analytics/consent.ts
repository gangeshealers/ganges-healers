/** Optional marketing tracking is off until the visitor explicitly opts in. */
export const MARKETING_CONSENT_KEY = 'ganges-healers:marketing-consent:v1'
export const MARKETING_PREFERENCES_EVENT = 'ganges-healers:open-marketing-preferences'

export type MarketingConsent = 'allowed' | 'denied' | null

export function readMarketingConsent(): MarketingConsent {
  if (typeof window === 'undefined') return null
  try {
    const saved = window.localStorage.getItem(MARKETING_CONSENT_KEY)
    return saved === 'allowed' || saved === 'denied' ? saved : null
  } catch {
    // Storage-disabled browsers must not silently opt in.
    return null
  }
}

export function writeMarketingConsent(value: Exclude<MarketingConsent, null>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MARKETING_CONSENT_KEY, value)
  } catch {
    // The in-memory choice applies to this page even when persistence is blocked.
  }
}

export function hasMarketingConsent() {
  return readMarketingConsent() === 'allowed'
}
