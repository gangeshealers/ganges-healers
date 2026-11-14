'use client'

import { createContext, useContext, useEffect, useRef, useState, useTransition, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type SaveResult = { error?: string; reloadRequired?: boolean; savedVersion?: string }

const EditorGroup = createContext<{ begin: () => boolean; finish: (savedVersion?: string) => void } | null>(null)

/** Keep sibling forms on one reviewed record in sync with its server-rendered version. */
export function CatalogEditorGroup({ version, children, className }: { version: string; children: ReactNode; className?: string }) {
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [replacedVersion, setReplacedVersion] = useState<string | null>(null)
  const refreshing = replacedVersion === version

  function begin() {
    if (submitting.current || refreshing) return false
    submitting.current = true
    setPending(true)
    return true
  }

  function finish(savedVersion?: string) {
    // A server action can resolve before its revalidated page is committed.
    setReplacedVersion(savedVersion && savedVersion !== version ? version : null)
    submitting.current = false
    setPending(false)
  }

  return (
    <EditorGroup.Provider value={{ begin, finish }}>
      <fieldset disabled={pending || refreshing} aria-busy={pending || refreshing} className={className}>
        {children}
      </fieldset>
      {refreshing && <button type="button" className="text-sm underline" onClick={() => window.location.reload()}>Reload updated profile</button>}
    </EditorGroup.Provider>
  )
}

export function CatalogEditor({ action, children, item, create = false, submitLabel, compact = false, submitVariant = 'default' }: {
  action: (data: FormData) => Promise<SaveResult>
  children: ReactNode
  item: string
  create?: boolean
  submitLabel?: string
  compact?: boolean
  submitVariant?: ComponentProps<typeof Button>['variant']
}) {
  const [result, setResult] = useState<SaveResult | null>(null)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const [pending, startTransition] = useTransition()
  const saving = useRef(false)
  const group = useContext(EditorGroup)
  // Preserve native server-action submission before the editor hydrates.
  const formAction: (data: FormData) => void = action

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current || (group && !group.begin())) return

    const form = event.currentTarget
    const data = new FormData(form)
    saving.current = true
    setResult(null)
    startTransition(async () => {
      let savedVersion: string | undefined
      try {
        const response = await action(data)
        savedVersion = response.savedVersion
        if (!response.error && create) form.reset()
        setResult(response)
      } catch {
        setResult({ error: `The ${item.toLowerCase()} could not be saved. Try again.` })
      } finally {
        saving.current = false
        group?.finish(savedVersion)
      }
    })
  }

  return (
    <form action={formAction} onSubmit={submit} data-hydrated={hydrated ? 'true' : 'false'}>
      <fieldset disabled={pending} className={compact ? 'flex flex-wrap items-center gap-2' : 'mt-2 grid grid-cols-1 gap-3 md:grid-cols-3'}>
        {children}
        {result?.error && <p role="alert" className="text-sm text-destructive md:col-span-3">{result.error}</p>}
        {result?.reloadRequired && <div className="md:col-span-3"><Button type="button" variant="outline" onClick={() => window.location.reload()}>Discard drafts and reload</Button></div>}
        {result && !result.error && <p role="status" className="text-sm md:col-span-3">{item} {create ? 'created.' : 'saved.'}</p>}
        <div>
          <Button type="submit" size="sm" variant={submitVariant}>{pending ? 'Saving…' : submitLabel ?? (create ? 'Create' : 'Save')}</Button>
        </div>
      </fieldset>
    </form>
  )
}
