'use client'

import { MARKETING_PREFERENCES_EVENT } from '@/lib/analytics/consent'

/** The visitor can revisit and revoke their optional tracking preference. */
export default function PrivacyChoicesButton({ pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID }: { pixelId?: string }) {
  if (!pixelId || !/^\d{5,30}$/.test(pixelId)) return null
  return (
    <button
      type="button"
      className="text-left text-sm leading-6 text-neutral-300 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      onClick={() => window.dispatchEvent(new Event(MARKETING_PREFERENCES_EVENT))}
    >
      Privacy preferences
    </button>
  )
}
