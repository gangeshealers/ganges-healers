import type { Metadata } from 'next'
import Link from 'next/link'
import { canonicalOf } from '@/config/site'

export const metadata: Metadata = {
  title: 'About Ganges Healers',
  description: 'Learn how to explore practitioners, wellness sessions, guided programs, learning and community on Ganges Healers.',
  alternates: { canonical: canonicalOf('/about') },
}

const journeys = [
  { title: 'Find a practitioner', detail: 'Browse published services and active, verified healer profiles, then review the available session options.', href: '/healers', link: 'Meet the healers' },
  { title: 'Explore your practice', detail: 'Explore programs, courses and guided audio when they are published and available to you.', href: '/programs', link: 'Discover programs' },
  { title: 'Stay connected', detail: 'Read wellness articles, participate in the community where your account permits, and manage your bookings from your account.', href: '/community', link: 'Explore the community' },
] as const

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-emerald-800 to-teal-700 text-white">
        <div className="container mx-auto max-w-5xl px-4 py-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-100">About Ganges Healers</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">A place to explore your wellness journey</h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-emerald-100">
            Ganges Healers brings together wellness services, practitioner profiles, guided learning, and a supportive community.
            Explore what is available, choose at your own pace, and keep track of your experiences in one account.
          </p>
        </div>
      </header>
      <div className="container mx-auto max-w-5xl space-y-12 px-4 py-12">
        <section aria-labelledby="how-it-works" className="space-y-6">
          <h2 id="how-it-works" className="text-2xl font-bold text-slate-950">What you can do here</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {journeys.map(item => (
              <article key={item.href} className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-7 text-slate-700">{item.detail}</p>
                <Link href={item.href} className="mt-5 inline-flex font-semibold text-emerald-800 underline-offset-4 hover:underline">{item.link}</Link>
              </article>
            ))}
          </div>
        </section>
        <section aria-labelledby="informed-choice" className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
          <h2 id="informed-choice" className="text-xl font-semibold text-emerald-950">Informed choices matter</h2>
          <p className="text-sm leading-7 text-emerald-950">
            Availability, content, prices and practitioner offerings depend on what has been published in the catalog.
            Read the details of a service or program before booking or purchasing.
          </p>
          <p className="text-sm leading-7 text-emerald-950">
            Wellness services and educational content are complementary experiences. They are not a diagnosis, medical treatment,
            emergency service, or substitute for advice from a qualified healthcare professional.
          </p>
        </section>
        <section aria-labelledby="ask-question" className="flex flex-wrap items-center justify-between gap-5 rounded-xl border bg-white p-6 sm:p-8">
          <div>
            <h2 id="ask-question" className="text-xl font-semibold text-slate-950">Questions about the platform?</h2>
            <p className="mt-2 text-sm leading-7 text-slate-700">Find help with your account, bookings, courses, memberships and orders.</p>
          </div>
          <Link href="/contact" className="rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
            Contact and support
          </Link>
        </section>
      </div>
    </div>
  )
}
