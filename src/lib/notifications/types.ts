export interface NotificationItem {
  id: string
  userId: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
}

export interface NotificationList {
  ownerId: string
  notifications: NotificationItem[]
  unreadCount: number
  nextCursor: string | null
}


/** Explicit booking notice scopes link to an owned workspace, never a URL parsed from message text. */
const bookingNoticeScopes = {
  booking_requested_customer: 'customer', booking_requested_practitioner: 'practitioner',
  booking_confirmed_customer: 'customer', booking_confirmed_practitioner: 'practitioner',
  booking_rescheduled_customer: 'customer', booking_rescheduled_practitioner: 'practitioner',
  booking_cancelled_customer: 'customer', booking_cancelled_practitioner: 'practitioner',
} as const
export const bookingNotificationTypes = Object.keys(bookingNoticeScopes)
/** Return only the declared booking workspace for a recognized audience type. */
export function bookingNotificationDestination(type: string) {
  if (!Object.prototype.hasOwnProperty.call(bookingNoticeScopes, type)) return null
  return bookingNoticeScopes[type as keyof typeof bookingNoticeScopes] === 'customer'
    ? { href: '/dashboard/bookings', label: 'View my bookings' }
    : { href: '/healer/bookings', label: 'View practitioner bookings' }
}

/** Static routes for other account events; never trust a URL embedded in a message. */
export function notificationDestination(type: string) {
  if (type === 'support_reply') return { href: '/dashboard/support', label: 'Read support reply' }
  return bookingNotificationDestination(type)
}
