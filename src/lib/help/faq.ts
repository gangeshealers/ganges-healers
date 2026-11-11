/**
 * Help content reflects actual links and business flows in this application.
 * Keep policy explanations aligned with refund-policy.ts and payments.md.
 */
export type HelpCategory = 'Sessions' | 'Payments & orders' | 'Learning & content' | 'Account'
export type HelpQuestion = {
  id: string
  category: HelpCategory
  question: string
  answer: string
  link: { label: string; href: string }
}

export const helpQuestions: HelpQuestion[] = [
  {
    id: 'book-session',
    category: 'Sessions',
    question: 'How do I book a healing session?',
    answer: 'Browse the available services, open a service to review its details, then choose a practitioner and available session time. Follow the booking flow to confirm the request and any payment.',
    link: { label: 'Browse healing services', href: '/services' },
  },
  {
    id: 'view-bookings',
    category: 'Sessions',
    question: 'Where can I find my upcoming bookings?',
    answer: 'Sign in to your account and open My Bookings. You can review upcoming and past appointments, their saved status, and any actions currently available for each booking.',
    link: { label: 'Open My Bookings', href: '/dashboard/bookings' },
  },
  {
    id: 'reschedule',
    category: 'Sessions',
    question: 'Can I reschedule an appointment?',
    answer: 'Eligible appointments can be rescheduled at least 24 hours before their start time. Open My Bookings to see whether the Reschedule action is available for your appointment.',
    link: { label: 'Review my bookings', href: '/dashboard/bookings' },
  },
  {
    id: 'cancel-refund',
    category: 'Sessions',
    question: 'What happens if I cancel a paid session?',
    answer: 'The session cancellation policy calculates a full refund at least 48 hours before the session, half the session price from 24 to under 48 hours, and no refund within 24 hours. An actual cash refund depends on the captured payment and provider confirmation; cancelled bookings display the recorded refund outcome. If a refund is unavailable, pending, or failed, request a support review rather than initiating a second refund.',
    link: { label: 'Check cancellation status', href: '/dashboard/bookings' },
  },
  {
    id: 'payment-unclear',
    category: 'Payments & orders',
    question: 'I paid but did not receive confirmation. Should I pay again?',
    answer: 'Do not start a duplicate payment simply because a screen timed out. First inspect your saved booking or store order and its recorded payment status. Pending store orders may show Continue payment. If the gateway captured money but the order remains unconfirmed, request support review.',
    link: { label: 'Inspect my orders', href: '/dashboard/orders' },
  },
  {
    id: 'order-details',
    category: 'Payments & orders',
    question: 'Where do I find store order details?',
    answer: 'Open My Orders after signing in. Each saved order has a details page, including its current status and applicable continuation options for an incomplete purchase.',
    link: { label: 'View my orders', href: '/dashboard/orders' },
  },
  {
    id: 'courses',
    category: 'Learning & content',
    question: 'Where can I access my enrolled courses?',
    answer: 'Your enrolled courses and learning progress are available in the course dashboard. Public course listings let you explore available courses, but accessing paid lessons still requires the relevant enrollment.',
    link: { label: 'Open enrolled courses', href: '/courses/enrolled' },
  },
  {
    id: 'programs',
    category: 'Learning & content',
    question: 'Where can I follow a program I joined?',
    answer: 'Your account has a dedicated My Programs area for enrollments, scheduled sessions, and saved program progress. You can also browse active programs in the public catalog.',
    link: { label: 'Open my programs', href: '/dashboard/programs' },
  },
  {
    id: 'audio',
    category: 'Learning & content',
    question: 'Are all guided audio tracks free?',
    answer: 'No. The audio library distinguishes free and premium tracks, and only published tracks appear publicly. Premium audio playback is subject to the existing account and membership access rules.',
    link: { label: 'Explore the audio library', href: '/audio' },
  },
  {
    id: 'membership',
    category: 'Account',
    question: 'Where can I see my membership?',
    answer: 'Sign in and open the Membership section of your dashboard to review the membership information saved for your account.',
    link: { label: 'View my membership', href: '/dashboard/membership' },
  },
  {
    id: 'profile',
    category: 'Account',
    question: 'How do I update my account details?',
    answer: 'Open Account Settings from your signed-in dashboard. Your account must be authenticated before changing your personal details or security settings.',
    link: { label: 'Open account settings', href: '/dashboard/settings' },
  },
]

export const helpCategories = ['All topics', 'Sessions', 'Payments & orders', 'Learning & content', 'Account'] as const
export type HelpFilter = typeof helpCategories[number]

/** Pure search helper, shared by the Help Center and its focused tests. */
export function filterHelpQuestions(query: string, category: HelpFilter) {
  const q = query.trim().toLocaleLowerCase().slice(0, 120)
  return helpQuestions.filter(item =>
    (category === 'All topics' || item.category === category)
    && (!q || [item.question, item.answer, item.category].some(value => value.toLocaleLowerCase().includes(q)))
  )
}
