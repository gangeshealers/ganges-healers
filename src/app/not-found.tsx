import Link from 'next/link'
import { ArrowLeft, Compass } from 'lucide-react'

/** Friendly recovery screen for missing public pages and expired catalog links. */
export default function NotFound() {
  return (
    <section className="flex min-h-[65vh] items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4 py-16">
      <div className="mx-auto max-w-xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-2 text-sm font-semibold text-violet-800">
          <Compass aria-hidden="true" className="size-4" />
          Page not found
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
          This page isn’t available
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-slate-600">
          The link may have changed, or the content may no longer be published. You can return home or explore the services and programs currently available.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 sm:w-auto"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Return to homepage
          </Link>
          <Link
            href="/services"
            className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 sm:w-auto"
          >
            Explore healing services
          </Link>
        </div>
        <Link href="/programs" className="mt-6 inline-flex rounded-sm text-sm font-medium text-violet-700 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">
          Or browse guided programs
        </Link>
      </div>
    </section>
  )
}
