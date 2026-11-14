import { signOut } from 'next-auth/react'

// Allow for delayed cookie propagation or a stale concurrent Auth.js refresh.
// Nine checks over at most ~5.2 seconds of scheduled backoff; never assume
// the sign-out POST alone invalidates an authenticated session.
const SESSION_RECHECK_DELAYS_MS = [150, 300, 450, 600, 750, 900, 1000, 1000] as const

/** Confirm cookie-backed sign-out; callers navigate using their own validated local route. */
export async function signOutCurrentSession(redirectTo: string) {
  const result = await signOut({ redirect: false, redirectTo })
  if (!result || typeof result.url !== 'string' || !result.url) throw new Error('Sign-out was not confirmed')
  // Auth.js v5's client does not inspect HTTP status. Never use its configured-host redirect here.
  // Only close account navigation after an actual empty session response. A stale
  // session can outlive the old <1s recheck window under browser-test/CI load.
  for (let attempt = 0; attempt <= SESSION_RECHECK_DELAYS_MS.length; attempt++) {
    const response = await fetch('/api/auth/session', { cache: 'no-store' })
    if (!response.ok) throw new Error('Session could not be checked')
    const remaining: unknown = await response.json()
    if (remaining === null || (typeof remaining === 'object' && !Array.isArray(remaining) && Object.keys(remaining).length === 0)) return
    const delay = SESSION_RECHECK_DELAYS_MS[attempt]
    if (delay !== undefined) await new Promise<void>(resolve => setTimeout(resolve, delay))
  }
  throw new Error('A session is still active')
}
