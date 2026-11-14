export type IntegrationCheck = {
  label: string
  configured: boolean
  essential: boolean
  guidance: string
}

/**
 * Configuration hints for an authenticated admin.
 * Never return values, masked credentials, DB URLs, or claim provider delivery.
 */
export function inspectLaunchIntegrations(env: Record<string, string | undefined>): IntegrationCheck[] {
  const present = (key: string) => Boolean(env[key]?.trim())
  const all = (...keys: string[]) => keys.every(present)
  const paymentKeysPresent = all('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'NEXT_PUBLIC_RAZORPAY_KEY_ID')
  const paymentEventsEnabled = env.PAYMENT_EVENTS_ENABLED === 'true'

  return [
    {
      label: 'Authentication and database',
      configured: present('DATABASE_URL') && (present('AUTH_SECRET') || present('NEXTAUTH_SECRET')),
      essential: true,
      guidance: 'Verify the production database branch, migrations and sign-in separately.',
    },
    {
      label: 'Razorpay checkout and webhook',
      configured: paymentKeysPresent && paymentEventsEnabled,
      essential: true,
      guidance: !paymentKeysPresent
        ? 'Configure the checkout keys and webhook secret for the intended Razorpay environment.'
        : !paymentEventsEnabled
          ? 'Signed callbacks are acknowledged only. After verifying callback delivery, set PAYMENT_EVENTS_ENABLED=true in this environment and redeploy to apply captures and refunds.'
          : 'Verify a test-mode capture, a duplicate callback and a refund against the booking and the Razorpay dashboard.',
    },
    {
      label: 'Transactional email',
      configured: present('RESEND_API_KEY'),
      essential: true,
      guidance: 'Confirm real delivery, bounces, sender domain and booking-email outbox reconciliation. Presence does not prove delivery.',
    },
    {
      label: 'Google sign-in',
      configured: all('AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET') || all('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
      essential: false,
      guidance: 'If offered, verify the OAuth callback domain and account-linking flow with real credentials.',
    },
    {
      label: 'Blob uploads and invoices',
      configured: present('BLOB_READ_WRITE_TOKEN'),
      essential: false,
      guidance: 'Vercel OIDC storage is an alternate path; verify actual uploads and invoice access regardless of token status.',
    },
    {
      label: 'Redis queue transport',
      configured: present('REDIS_URL'),
      essential: false,
      guidance: 'A Redis URL does not prove a persistent worker is running. Verify job processing and recovery after an outage.',
    },
    {
      label: 'Protected booking-email scheduler',
      configured: present('CRON_SECRET'),
      essential: false,
      guidance: 'A secret alone does not schedule recovery; verify an actual worker or authenticated recurring trigger.',
    },
    {
      label: 'Error monitoring',
      configured: present('NEXT_PUBLIC_SENTRY_DSN') || present('SENTRY_DSN'),
      essential: false,
      guidance: 'Verify that a test error reaches the correct monitoring project without revealing customer details.',
    },
  ]
}
