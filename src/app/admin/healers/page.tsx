import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CatalogEditor } from '@/components/admin/catalog-editor'
import { healerProfileLimits } from '@/lib/healers/profile-schema'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { HealerAdminError, healerCatalogVersion, writeHealerCatalog } from '@/lib/healers/admin'

async function guardAdmin() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  const actor = await prisma.user.findUnique({ where: { id: session.user.id, closedAt: null }, select: { role: true } })
  if (actor?.role !== 'ADMIN') redirect('/')
  return session
}

async function saveHealer(formData: FormData, operation: 'profile' | 'active' | 'verified') {
  try {
    const actor = await requireCurrentAdmin()
    const saved = await writeHealerCatalog(actor.id, formData, operation)
    revalidatePath('/admin/healers'); revalidatePath('/healers'); revalidatePath(`/healers/${saved.id}`)
    revalidatePath('/services'); revalidatePath('/programs')
    return {}
  } catch (error) {
    if (error instanceof HealerAdminError) return { error: error.message, reloadRequired: ['HEALER_CHANGED', 'HEALER_ACCOUNT_CHANGED', 'HEALER_NOT_FOUND', 'SESSION_CHANGED'].includes(error.code) }
    if ((error as { status?: number })?.status === 403) return { error: 'Administrator access is required.' }
    console.error('[admin][healers][save_error]', { type: error instanceof Error ? error.name : 'unknown' })
    return { error: 'The healer profile could not be saved. Please try again.' }
  }
}

async function updateHealer(formData: FormData) { 'use server'; return saveHealer(formData, 'profile') }
async function toggleHealer(formData: FormData) { 'use server'; return saveHealer(formData, 'active') }
async function toggleVerified(formData: FormData) { 'use server'; return saveHealer(formData, 'verified') }

export default async function AdminHealersPage() {
  const session = await guardAdmin()

  const healers = await prisma.healer.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true, email: true, role: true, closedAt: true } },
      _count: { select: { bookings: true } },
    },
  })

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Admin · Healers</h1>
      <p className="text-sm text-muted-foreground">Deactivate a healer to stop new bookings. Existing appointments, program assignments and the user account are kept. Saves apply only to the profile you reviewed; reload after another change.</p>

      <Card>
        <CardContent className="p-0 divide-y">
          {healers.map((h) => {
            const version = healerCatalogVersion(h)
            const editable = h.user.role === 'HEALER' && !h.user.closedAt
            return (
              <article key={h.id} aria-label={`Healer ${h.user.name || h.user.email}`} className="p-4 space-y-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-medium">
                      {h.user.name || h.user.email}
                      {!h.isActive && <span className="ml-2 text-xs text-muted-foreground">(Inactive)</span>}
                      {h.isVerified && <span className="ml-2 text-xs text-green-600">✓ Verified</span>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {h.user.email} · {h.experienceYears}yr exp · Rating: {h.rating.toFixed(1)} · {h._count.bookings} bookings
                    </div>
                    {h.specializations.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Specializations: {h.specializations.join(', ')}
                      </div>
                    )}
                  </div>
                  {editable && <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                    <CatalogEditor action={toggleHealer} item="Healer availability" compact submitLabel={h.isActive ? 'Deactivate' : 'Activate'}>
                      <input type="hidden" name="id" value={h.id} />
                      <input type="hidden" name="version" value={version} />
                      <input type="hidden" name="ownerId" value={session.user.id} />
                    </CatalogEditor>
                    <CatalogEditor action={toggleVerified} item="Healer verification" compact submitLabel={h.isVerified ? 'Unverify' : 'Verify'}>
                      <input type="hidden" name="id" value={h.id} />
                      <input type="hidden" name="version" value={version} />
                      <input type="hidden" name="ownerId" value={session.user.id} />
                    </CatalogEditor>
                  </div>}
                </div>
                {!editable && <p className="text-sm text-muted-foreground">{h.user.closedAt ? 'Account closed.' : 'Healer role removed.'} Catalog changes are unavailable; existing records are kept.</p>}
                {editable && <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-primary">Edit</summary>
                  <CatalogEditor action={updateHealer} item="Healer profile">
                    <div key={version} className="contents">
                      <input type="hidden" name="id" value={h.id} />
                      <input type="hidden" name="version" value={version} />
                      <input type="hidden" name="ownerId" value={session.user.id} />
                      <div className="grid gap-1">
                        <Label htmlFor={`${h.id}-experience`}>Experience (years)</Label>
                        <Input id={`${h.id}-experience`} name="experienceYears" type="number" min="0" max={healerProfileLimits.experienceYears} step="1" required defaultValue={h.experienceYears} />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`${h.id}-specializations`}>Specializations (comma-separated)</Label>
                        <Input id={`${h.id}-specializations`} name="specializations" defaultValue={h.specializations.join(', ')} />
                      </div>
                      <div className="md:col-span-3 grid gap-1">
                        <Label htmlFor={`${h.id}-bio`}>Bio</Label>
                        <textarea id={`${h.id}-bio`} name="bio" maxLength={healerProfileLimits.bio} defaultValue={h.bio ?? ''} className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm" />
                      </div>
                    </div>
                  </CatalogEditor>
                </details>}
              </article>
          )})}
          {healers.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">No healers registered yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
