'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import {
  MARKETING_CONSENT_KEY,
  MARKETING_PREFERENCES_EVENT,
  readMarketingConsent,
  writeMarketingConsent,
  type MarketingConsent,
} from '@/lib/analytics/consent'

/** Marketing analytics is optional and never loads before explicit permission. */
export default function MetaPixelScript({ pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID }: { pixelId?: string }) {
  const pathname = usePathname()
  const [choice, setChoice] = useState<MarketingConsent>(null)
  const [showPreferences, setShowPreferences] = useState(false)
  const configured = typeof pixelId === 'string' && /^\d{5,30}$/.test(pixelId)

  useEffect(() => {
    if (!configured) return
    const stored = readMarketingConsent()
    setChoice(stored)
    setShowPreferences(stored === null)

    function openPreferences() { setShowPreferences(true) }
    function syncFromOtherTab(event: StorageEvent) {
      if (event.key !== MARKETING_CONSENT_KEY) return
      const saved = readMarketingConsent()
      if (saved !== 'allowed') {
        // Revoking consent must stop subsequent events even if a pixel was loaded.
        window.fbq?.('consent', 'revoke')
      }
      setChoice(saved)
      setShowPreferences(saved === null)
    }
    window.addEventListener(MARKETING_PREFERENCES_EVENT, openPreferences)
    window.addEventListener('storage', syncFromOtherTab)
    return () => {
      window.removeEventListener(MARKETING_PREFERENCES_EVENT, openPreferences)
      window.removeEventListener('storage', syncFromOtherTab)
    }
  }, [configured])

  function decide(next: Exclude<MarketingConsent, null>) {
    if (next === 'denied') window.fbq?.('consent', 'revoke')
    if (next === 'allowed' && choice === 'denied') window.fbq?.('consent', 'grant')
    writeMarketingConsent(next)
    setChoice(next)
    setShowPreferences(false)
  }

  if (!configured) return null
  // Account credentials and recovery pages are never sent to marketing analytics.
  const publicPage = !pathname?.startsWith('/auth/') && pathname !== '/register'
  return (
    <>
      {choice === 'allowed' && publicPage && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('consent', 'grant');
            fbq('init', '${pixelId}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}
      {showPreferences && (
        <aside
          role="region"
          aria-label="Optional analytics preferences"
          className="fixed inset-x-4 bottom-4 z-[90] mx-auto max-w-xl space-y-3 rounded-xl border border-slate-300 bg-white p-5 text-slate-950 shadow-xl sm:inset-x-auto sm:right-6"
        >
          <h2 className="text-base font-semibold">Optional marketing analytics</h2>
          <p className="text-sm leading-6">
            With your permission, we can use a marketing pixel to measure visits and advertising.
            This is optional. No marketing pixel loads before you allow it. You can change your choice
            using Privacy preferences in the footer.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => decide('denied')} className="rounded-md border border-slate-400 px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600">
              Reject optional analytics
            </button>
            <button type="button" onClick={() => decide('allowed')} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
              Allow optional analytics
            </button>
          </div>
        </aside>
      )}
    </>
  )
}
