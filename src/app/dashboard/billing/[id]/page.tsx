import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import PrintButton from '@/components/invoices/PrintButton'
import { auth } from '@/lib/auth'
import { authPathWithCallback } from '@/lib/auth/callback-url'
import { invoiceViewerHref, memberReceiptHref } from '@/lib/invoices/viewer-link'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Billing receipt | Ganges Healers', robots: { index: false, follow: false } }

const recipient = z.object({ name: z.string().nullish(), email: z.string().nullish() })
const lineItem = z.object({ description: z.string().trim().min(1), amountPaise: z.number().int() })
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const issueDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long' })

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect(authPathWithCallback('/auth/signin', memberReceiptHref(id)))

  const invoice = await prisma.invoice.findFirst({
    where: { id, payment: { userId: session.user.id } },
    select: {
      id: true, invoiceNumber: true, issuedAt: true, billTo: true, lineItems: true,
      subtotalPaise: true, taxPaise: true, totalPaise: true, pdfUrl: true,
    },
  })
  if (!invoice) notFound()

  const billTo = recipient.safeParse(invoice.billTo).data
  const items = Array.isArray(invoice.lineItems) ? invoice.lineItems.flatMap(value => {
    const parsed = lineItem.safeParse(value)
    return parsed.success ? [parsed.data] : []
  }) : []

  return (
    <article aria-labelledby="receipt-number" data-member-receipt="" className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center gap-4 text-sm print:hidden">
        <Link href="/dashboard/billing" className="mr-auto text-primary underline">Back to billing</Link>
        {invoice.pdfUrl.trim() && <Link href={invoiceViewerHref({ id: invoice.id })} className="text-primary underline">View PDF</Link>}
        <PrintButton />
      </div>
      <div className="space-y-6 rounded-xl border bg-card p-5 sm:p-8 print:border-0 print:p-0">
        <div className="space-y-1">
          <p className="font-medium">Ganges Healers</p>
          <h1 id="receipt-number" className="break-words text-2xl font-semibold">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground">Issued <time dateTime={invoice.issuedAt.toISOString()}>{issueDate.format(invoice.issuedAt)}</time></p>
        </div>
        {(billTo?.name || billTo?.email) && <section aria-label="Billed to" className="break-words text-sm">
          <h2 className="font-semibold">Billed to</h2>
          {billTo.name && <p>{billTo.name}</p>}
          {billTo.email && <p>{billTo.email}</p>}
        </section>}
        {items.length > 0 && <table aria-label="Invoice items" className="w-full text-left text-sm">
          <thead><tr className="border-b"><th scope="col" className="py-2">Description</th><th scope="col" className="text-right">Amount</th></tr></thead>
          <tbody>{items.map((item, index) => <tr key={index} className="border-b">
            <td className="break-words py-2 pr-3">{item.description}</td>
            <td className="text-right tabular-nums">{currency.format(item.amountPaise / 100)}</td>
          </tr>)}</tbody>
        </table>}
        <dl className="ml-auto max-w-xs space-y-2 text-sm tabular-nums">
          <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{currency.format(invoice.subtotalPaise / 100)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Tax</dt><dd>{currency.format(invoice.taxPaise / 100)}</dd></div>
          <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold"><dt>Invoice total</dt><dd>{currency.format(invoice.totalPaise / 100)}</dd></div>
        </dl>
      </div>
    </article>
  )
}
