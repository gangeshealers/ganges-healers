'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
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
    <html lang="en">
      <body>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong!</h2>
          <p style={{ color: '#666', marginTop: '0.5rem' }}>
            An unexpected error occurred. Please try again or return to the homepage.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              display: 'inline-block',
              marginLeft: '1rem',
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              border: '1px solid #333',
              borderRadius: '0.25rem',
            }}
          >
            Return home
          </a>
        </div>
      </body>
    </html>
  )
}
