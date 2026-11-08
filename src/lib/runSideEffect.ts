import { after } from 'next/server'

/** Keep optional work alive for this request; await it in tests or outside Next. */
export async function runSideEffect<T>(promise: Promise<T>): Promise<T | void> {
  const sync = process.env.NODE_ENV === 'test' || process.env.RUN_SYNC_SIDE_EFFECTS === '1'
  if (sync) {
    return await promise
  }
  const handled = promise.catch(err => {
    try {
      console.error('[side-effect][unhandled]', { errorType: err instanceof Error ? 'Error' : typeof err })
    } catch {}
  })
  try {
    // Register the already-started promise, preserving request context and running it once.
    after(handled)
  } catch {
    // Scripts/workers have no request scope. Await the same work, never restart it.
    await handled
  }
}
