import type { Metadata } from 'next'
import Link from 'next/link'
import { canonicalOf } from '@/config/site'

export const metadata: Metadata = {
  title: 'Contact and Support | Ganges Healers',
  description: 'Get help with Ganges Healers bookings, orders, courses, account access and membership.',
  alternates: { canonical: canonicalOf('/contact') },
}

const helpTopics = [
  { label: 'Bookings and session changes', href: '/dashboard/bookings' },
  { label: 'Orders and purchases', href: '/dashboard/orders' },
  { label: 'Courses and enrollment', href: '/courses/enrolled' },
  { label: 'Account settings', href: '/dashboard/settings' },
] as const

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-violet-800 to-indigo-700 px-4 py-14 text-white">
        <div className="container mx-auto max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-100">Contact Ganges Healers</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">We're here to help you find answers</h1>
          <p className="mt-4 max-w-2xl text-lg leading-7 text-violet-100">
            Use your private support center for account-specific questions, or browse the Help Center for general guidance.
          </p>
        </div>
      </header>
      <div className="container mx-auto max-w-4xl space-y-9 px-4 py-10">
        <section aria-labelledby="get-help" className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col rounded-xl border border-violet-200 bg-white p-6 shadow-sm">
            <h2 id="get-help" className="text-xl font-semibold text-slate-950">Private account support</h2>
            <p className="mt-3 flex-1 text-sm leading-7 text-slate-700">
              Sign in to send a secure support request and track replies about your own account, bookings, orders or membership.
              Your request history stays in your support workspace.
            </p>
            <Link href="/dashboard/support" className="mt-5 inline-flex w-fit rounded-lg bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800">
              Open support center
            </Link>
          </div>
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950">General questions</h2>
            <p className="mt-3 flex-1 text-sm leading-7 text-slate-700">
              Our Help Center covers common questions about booking, cancellations, refunds, membership and learning.
              You can read answers without sharing personal details.
            </p>
            <Link href="/help" className="mt-5 inline-flex w-fit rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              Browse help topics
            </Link>
          </div>
        </section>
        <section aria-labelledby="self-service" className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 id="self-service" className="text-xl font-semibold text-slate-950">Your account workspaces</h2>
          <p className="mt-2 text-sm leading-7 text-slate-700">For a missing or uncertain payment response, review the saved booking or order before attempting another checkout.</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {helpTopics.map(item => <li key={item.href}>
              <Link href={item.href} className="inline-flex font-medium text-violet-800 underline-offset-4 hover:underline">{item.label}</Link>
            </li>)}
          </ul>
        </section>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-950">
          Support requests are not a monitored emergency channel and do not guarantee an immediate response.
          If you need urgent medical assistance, use your local emergency services or contact a qualified medical professional.
        </p>
      </div>
    </div>
  )
}
