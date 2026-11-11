'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { RefreshCw, Home } from 'lucide-react'

/**
 * Route-level recovery: avoid displaying internal exception messages, queries,
 * credentials, stack traces or other information from failed server renders.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <section role="alert" aria-labelledby="page-error-title" className="flex min-h-[65vh] items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <RefreshCw aria-hidden="true" className="size-7" />
        </div>
        <h1 id="page-error-title" className="mt-6 text-3xl font-bold text-slate-950">This page couldn’t load</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          We couldn’t load this part of Ganges Healers. It may be a temporary issue. Please try again or return to the homepage.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violet-700 px-5 py-3 font-semibold text-white hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <RefreshCw aria-hidden="true" className="size-4" /> Try loading again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <Home aria-hidden="true" className="size-4" /> Return to homepage
          </Link>
        </div>
      </div>
    </section>
  )
}
