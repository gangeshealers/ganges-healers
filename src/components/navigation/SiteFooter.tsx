import Link from 'next/link'
import PrivacyChoicesButton from '@/components/analytics/PrivacyChoicesButton'

const footerGroups = [
  {
    title: 'Explore',
    links: [
      { label: 'Browse healing services', href: '/services' },
      { label: 'Discover healing programs', href: '/programs' },
      { label: 'Explore courses', href: '/courses' },
      { label: 'Listen to guided audio', href: '/audio' },
    ],
  },
  {
    title: 'Discover',
    links: [
      { label: 'Meet our healers', href: '/healers' },
      { label: 'Visit the healing store', href: '/store' },
      { label: 'Read wellness articles', href: '/blog' },
      { label: 'Explore community discussions', href: '/community' },
      { label: 'Find help and answers', href: '/help' },
    ],
  },
  {
    title: 'Information',
    links: [
      { label: 'About Ganges Healers', href: '/about' },
      { label: 'Contact and support', href: '/contact' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
  {
    title: 'Your journey',
    links: [
      { label: 'View your bookings', href: '/dashboard/bookings' },
      { label: 'Explore membership', href: '/dashboard/membership' },
      { label: 'Your learning dashboard', href: '/courses/enrolled' },
      { label: 'Manage account settings', href: '/dashboard/settings' },
    ],
  },
] as const

/** Site-wide navigation for existing public and authenticated experiences. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-neutral-800 bg-neutral-950 text-neutral-200">
      <div className="container mx-auto px-4 py-12 md:py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_3fr]">
          <div className="max-w-sm space-y-4">
            <Link
              href="/"
              className="inline-flex rounded-sm text-xl font-semibold tracking-tight text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Ganges Healers home"
            >
              Ganges Healers
            </Link>
            <p className="text-sm leading-7 text-neutral-300">
              Explore healing services, guided learning, wellness audio, and a community focused on conscious living.
            </p>
            <p className="text-xs leading-5 text-neutral-400">
              Wellness experiences complement, but do not replace, professional medical care.
            </p>
          </div>

          <nav aria-label="Footer navigation" className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {footerGroups.map(group => (
              <div key={group.title}>
                <h2 className="mb-4 text-sm font-semibold tracking-wide text-white">{group.title}</h2>
                <ul className="space-y-3">
                  {group.links.map(link => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="inline-flex rounded-sm text-sm leading-6 text-neutral-300 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  {group.title === 'Information' && <li><PrivacyChoicesButton /></li>}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-neutral-800 pt-6 text-xs text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Ganges Healers. All rights reserved.</p>
          <p>Care, learning, and community — in one place.</p>
        </div>
      </div>
    </footer>
  )
}
