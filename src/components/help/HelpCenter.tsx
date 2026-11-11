'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CircleHelp, Search, X } from 'lucide-react'
import { filterHelpQuestions, helpCategories, type HelpFilter } from '@/lib/help/faq'

/** Public help content is local: no personal data or search query leaves the browser. */
export default function HelpCenter() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<HelpFilter>('All topics')
  const matching = useMemo(() => filterHelpQuestions(query, category), [query, category])

  function reset() {
    setQuery('')
    setCategory('All topics')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="bg-gradient-to-r from-violet-800 to-indigo-700 px-4 py-16 text-white">
        <div className="container mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-violet-100">
            <CircleHelp aria-hidden="true" className="size-5" /> Help Center
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">How can we help?</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-violet-100">
            Find answers about healing sessions, payments, courses, memberships, and your account.
          </p>
        </div>
      </section>

      <div className="container mx-auto max-w-5xl space-y-8 px-4 py-10">
        <div className="space-y-4">
          <label htmlFor="help-search" className="block text-sm font-semibold text-slate-800">Search help topics</label>
          <div className="relative max-w-2xl">
            <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              id="help-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value.slice(0, 120))}
              maxLength={120}
              placeholder="e.g. cancel, payment, enrolled courses"
              className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
            />
          </div>
          <div aria-label="Help topic filters" role="group" className="flex flex-wrap gap-2">
            {helpCategories.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 ${category === item ? 'border-violet-700 bg-violet-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-violet-500'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <section aria-labelledby="help-results-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="help-results-heading" className="text-2xl font-bold text-slate-950">Frequently asked questions</h2>
            <p role="status" className="text-sm text-slate-600">
              {matching.length} {matching.length === 1 ? 'answer' : 'answers'} available
            </p>
          </div>

          {matching.length ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {matching.map(item => (
                <details key={item.id} className="group border-b border-slate-200 px-5 py-5 last:border-b-0 sm:px-7">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-left text-base font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xl text-violet-800 group-open:rotate-45">+</span>
                  </summary>
                  <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
                    <p>{item.answer}</p>
                    <Link
                      href={item.link.href}
                      className="inline-flex items-center gap-1 rounded-sm font-semibold text-violet-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
                    >
                      {item.link.label} <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <h3 className="font-semibold text-slate-900">No matching answers</h3>
              <p className="mt-2 text-sm text-slate-600">Try another search or explore all help topics.</p>
              <button
                type="button"
                onClick={reset}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
              >
                <X aria-hidden="true" className="size-4" /> Clear help filters
              </button>
            </div>
          )}
        </section>

        <section aria-labelledby="further-help-heading" className="rounded-xl border border-violet-200 bg-violet-50 p-6 sm:p-8">
          <h2 id="further-help-heading" className="text-xl font-semibold text-violet-950">Need help with your own account?</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-violet-900">
            Sign in to send a private support request and review replies in your account. For a payment whose status is unclear, check your saved booking or order before trying another payment.
          </p>
          <Link
            href="/dashboard/support"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            Open support center <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </section>
      </div>
    </div>
  )
}
