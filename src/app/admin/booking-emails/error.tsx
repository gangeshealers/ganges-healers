'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function BookingEmailsError({ reset }: { reset: () => void }) {
  return <div role="alert" className="container mx-auto max-w-3xl space-y-4 px-4 py-12"><h1 className="text-2xl font-semibold">Booking emails are temporarily unavailable</h1><p>Try again to load the latest delivery records.</p><Button onClick={reset}>Try again</Button><p><Link href="/admin" className="underline">Back to Admin</Link></p></div>
}
