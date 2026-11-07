import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { writeProgramCatalog, archiveProgramCatalog, programCatalogVersion, ProgramAdminError } from '@/lib/programs/queries'
import { CatalogEditor } from '@/components/admin/catalog-editor'
import { requireCurrentAdmin } from '@/lib/admin/auth'

const invalidProgram = 'Check the title, description and numbers. Use a positive program price, 1–366 sessions, 1–7 sessions per week and 1–1440 minutes per session.'
const duplicateSlug = 'That program slug is already in use.'

async function guardAdmin() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  const actor = await prisma.user.findUnique({ where: { id: session.user.id, closedAt: null }, select: { role: true } })
  if (actor?.role !== 'ADMIN') redirect('/')
  return session
}

function programForm(formData: FormData) {
  return Object.fromEntries(['title', 'slug', 'description', 'pricePaise', 'totalSessions', 'sessionsPerWeek', 'durationMinutes'].map(key => [key, formData.get(key)]))
}
async function saveCatalog(formData: FormData, update: boolean) {
  try {
    const actor = await programActor(formData)
    const id = formData.get('id'), version = formData.get('version')
    if (update && (typeof id !== 'string' || !id)) return { error: 'Select a program to edit.' }
    const saved = await writeProgramCatalog(actor.id, programForm(formData), update && typeof id === 'string' ? id : undefined, typeof version === 'string' ? version : undefined)
    refreshProgram(saved.slug)
    return {}
  } catch (error) { return programWriteError(error) }
}

async function programActor(form: FormData) {
  const actor = await requireCurrentAdmin()
  if (form.get('ownerId') !== actor.id) throw new ProgramAdminError('Your account changed. Reload this page before saving.', 409, 'SESSION_CHANGED')
  return actor
}

function programWriteError(error: unknown) {
  if (error instanceof ProgramAdminError) return { error: error.message, reloadRequired: ['PROGRAM_CHANGED', 'PROGRAM_NOT_FOUND', 'INVALID_PROGRAM_VERSION', 'SESSION_CHANGED'].includes(error.code) }
  if ((error as { status?: number })?.status === 403) return { error: 'Administrator access is required.' }
  if ((error as { code?: string })?.code === 'P2002') return { error: duplicateSlug }
  console.error('[admin][programs][save_error]', { type: error instanceof Error ? error.name : 'unknown' })
  return { error: 'The program could not be saved. Please try again.' }
}

function refreshProgram(slug: string) {
  revalidatePath('/admin/programs'); revalidatePath('/programs'); revalidatePath(`/programs/${slug}`); revalidatePath('/'); revalidatePath('/sitemap.xml')
}
async function createProgram(formData: FormData) { 'use server'; return saveCatalog(formData, false) }
async function updateProgram(formData: FormData) { 'use server'; return saveCatalog(formData, true) }
async function toggleProgram(formData: FormData) {
  'use server'
  return changeCatalog(formData, true)
}
async function deleteProgram(formData: FormData) {
  'use server'
  return changeCatalog(formData, false)
}

async function changeCatalog(formData: FormData, toggle: boolean) {
  try {
    const actor = await programActor(formData)
    const id = formData.get('id'), version = formData.get('version')
    if (typeof id !== 'string' || !id || typeof version !== 'string') return { error: 'Reload and review this program before saving.', reloadRequired: true }
    const active = formData.get('isActive')
    if (toggle && active !== 'true' && active !== 'false') return { error: 'Reload and review this program before saving.', reloadRequired: true }
    const saved = await archiveProgramCatalog(actor.id, id, toggle ? active === 'true' : undefined, version)
    refreshProgram(saved.slug)
    return {}
  } catch (error) { return programWriteError(error) }
}

export default async function AdminProgramsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const query = searchParams ? await searchParams : {}
  const session = await guardAdmin()

  const programs = await prisma.program.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { enrollments: true } } },
  })

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Admin · Programs</h1>
      <Button asChild variant="outline"><Link href="/admin/program-enrollments">Manage enrollments and sessions</Link></Button>
      {query.error && <p role="alert" className="text-destructive">{query.error === 'duplicate-slug' ? duplicateSlug : invalidProgram}</p>}
      <p className="text-sm text-muted-foreground">Delete unused programs. Programs with enrollment or payment history are archived instead, preserving customer access. Saves apply only to the catalog values you reviewed.</p>

      <Card>
        <CardContent className="p-4">
          <h2 className="font-medium mb-3">Create Program</h2>
          <CatalogEditor action={createProgram} item="Program" create>
            <input type="hidden" name="ownerId" value={session.user.id} />
            <div className="grid gap-1">
              <Label htmlFor="new-title">Title</Label>
              <Input id="new-title" name="title" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-slug">Slug</Label>
              <Input id="new-slug" name="slug" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-price">Price (paise)</Label>
              <Input id="new-price" name="pricePaise" type="number" min="1" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-total">Total Sessions</Label>
              <Input id="new-total" name="totalSessions" type="number" min="1" defaultValue="8" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-perweek">Sessions/Week</Label>
              <Input id="new-perweek" name="sessionsPerWeek" type="number" min="1" defaultValue="2" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-dur">Duration (min)</Label>
              <Input id="new-dur" name="durationMinutes" type="number" min="1" defaultValue="60" required />
            </div>
            <div className="md:col-span-3 grid gap-1">
              <Label htmlFor="new-desc">Description</Label>
              <textarea id="new-desc" name="description" required className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm" />
            </div>
          </CatalogEditor>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y">
          {programs.map((p) => {
            const version = programCatalogVersion(p)
            return (
              <article key={p.id} aria-label={`Program ${p.title}`} className="p-4 space-y-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 break-words">
                    <div className="font-medium">
                      {p.title}
                      {!p.isActive && <span className="ml-2 text-xs text-muted-foreground">(Inactive)</span>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      /{p.slug} · ₹{(p.pricePaise / 100).toFixed(2)} · {p.totalSessions} sessions ({p.sessionsPerWeek}/wk, {p.durationMinutes}min) · {p._count.enrollments} enrolled
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <CatalogEditor action={toggleProgram} item="Program availability" compact submitVariant="outline" submitLabel={p.isActive ? 'Deactivate' : 'Activate'}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="isActive" value={String(p.isActive)} />
                      <input type="hidden" name="version" value={version} />
                      <input type="hidden" name="ownerId" value={session.user.id} />
                    </CatalogEditor>
                    <CatalogEditor action={deleteProgram} item="Program" compact submitVariant="destructive" submitLabel={p._count.enrollments > 0 ? 'Archive' : 'Delete'}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="version" value={version} />
                      <input type="hidden" name="ownerId" value={session.user.id} />
                    </CatalogEditor>
                  </div>
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-primary">Edit</summary>
                  <CatalogEditor action={updateProgram} item="Program">
                    <div key={version} className="contents">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="version" value={version} />
                      <input type="hidden" name="ownerId" value={session.user.id} />
                      <div className="grid gap-1">
                        <Label htmlFor={`${p.id}-title`}>Title</Label>
                        <Input id={`${p.id}-title`} name="title" defaultValue={p.title} required />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`${p.id}-price`}>Price (paise)</Label>
                        <Input id={`${p.id}-price`} name="pricePaise" type="number" min="1" defaultValue={p.pricePaise} required />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`${p.id}-total`}>Total Sessions</Label>
                        <Input id={`${p.id}-total`} name="totalSessions" type="number" min="1" defaultValue={p.totalSessions} required />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`${p.id}-perweek`}>Sessions/Week</Label>
                        <Input id={`${p.id}-perweek`} name="sessionsPerWeek" type="number" min="1" defaultValue={p.sessionsPerWeek} required />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`${p.id}-duration`}>Duration (min)</Label>
                        <Input id={`${p.id}-duration`} name="durationMinutes" type="number" min="1" defaultValue={p.durationMinutes} required />
                      </div>
                      <div className="md:col-span-3 grid gap-1">
                        <Label htmlFor={`${p.id}-description`}>Description</Label>
                        <textarea id={`${p.id}-description`} name="description" defaultValue={p.description} required className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm" />
                      </div>
                    </div>
                  </CatalogEditor>
                </details>
              </article>
          )})}
          {programs.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">No programs yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
