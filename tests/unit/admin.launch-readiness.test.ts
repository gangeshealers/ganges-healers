import { inspectLaunchIntegrations } from '@/lib/admin/launch-readiness'

test('launch checks expose only status flags and guidance, never environment secret values', () => {
  const env = {
    DATABASE_URL: 'postgresql://private-user:password@private-host.example/neondb',
    AUTH_SECRET: 'private-auth-secret',
    RAZORPAY_KEY_ID: 'rzp_test_fake',
    RAZORPAY_KEY_SECRET: 'private-payment-secret',
    RAZORPAY_WEBHOOK_SECRET: 'private-webhook-secret',
    NEXT_PUBLIC_RAZORPAY_KEY_ID: 'rzp_test_fake',
    RESEND_API_KEY: 'private-resend-token',
    REDIS_URL: 'redis://private-user:private-pass@private-host.example',
  }
  const result = inspectLaunchIntegrations(env)
  expect(result.find(item => item.label === 'Authentication and database')?.configured).toBe(true)
  expect(result.find(item => item.label === 'Razorpay checkout and webhook')?.configured).toBe(true)
  expect(result.find(item => item.label === 'Transactional email')?.configured).toBe(true)
  expect(result.find(item => item.label === 'Redis queue transport')?.configured).toBe(true)
  expect(result.find(item => item.label === 'Protected booking-email scheduler')?.configured).toBe(false)
  const serialized = JSON.stringify(result)
  for (const secret of Object.values(env)) {
    expect(serialized).not.toContain(secret)
  }
  expect(result.every(item => typeof item.essential === 'boolean' && item.guidance.length > 20)).toBe(true)
})

test('missing or incomplete configuration cannot be reported as configured', () => {
  const result = inspectLaunchIntegrations({
    DATABASE_URL: 'postgresql://fake.example/neondb',
    RAZORPAY_KEY_ID: 'test-only',
    AUTH_GOOGLE_ID: 'incomplete-client-id',
  })
  expect(result.find(item => item.label === 'Authentication and database')?.configured).toBe(false)
  expect(result.find(item => item.label === 'Razorpay checkout and webhook')?.configured).toBe(false)
  expect(result.find(item => item.label === 'Google sign-in')?.configured).toBe(false)
  expect(result.find(item => item.label === 'Transactional email')?.configured).toBe(false)
})

test('legacy Google credentials and NEXTAUTH_SECRET remain recognized when paired', () => {
  const result = inspectLaunchIntegrations({
    DATABASE_URL: 'postgresql://localhost/neondb',
    NEXTAUTH_SECRET: 'legacy-secret',
    GOOGLE_CLIENT_ID: 'legacy-id',
    GOOGLE_CLIENT_SECRET: 'legacy-client-secret',
  })
  expect(result.find(item => item.label === 'Authentication and database')?.configured).toBe(true)
  expect(result.find(item => item.label === 'Google sign-in')?.configured).toBe(true)
})
