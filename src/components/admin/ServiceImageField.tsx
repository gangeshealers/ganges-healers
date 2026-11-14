'use client'

import { useState, type ChangeEvent } from 'react'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isAllowedArticleImage, productImageError } from '@/config/images'

/** Shared create/edit control. The parent CatalogEditor owns the final database save. */
export default function ServiceImageField({ id, initialUrl }: { id: string; initialUrl?: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    event.currentTarget.value = ''
    const invalid = productImageError(file)
    if (invalid) { setError(invalid); return }
    setUploading(true); setError(''); setMessage('')
    try {
      const form = new FormData()
      form.append('image', file)
      const response = await fetch('/api/admin/services/image', { method: 'POST', body: form })
      const result: unknown = await response.json().catch(() => null)
      const data = result && typeof result === 'object' ? result as Record<string, unknown> : null
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Image upload failed')
      if (typeof data?.url !== 'string' || !data.url || !isAllowedArticleImage(data.url)) {
        throw new Error('The upload URL could not be verified. Please retry.')
      }
      setUrl(data.url)
      setMessage('Image uploaded. Save the service to publish this image.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Image upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Service image URL (optional)</Label>
      <Input
        id={id}
        name="image"
        type="url"
        value={url}
        onChange={event => { setUrl(event.target.value); setMessage(''); setError('') }}
        maxLength={2000}
        placeholder="https://…public.blob.vercel-storage.com/…"
        aria-describedby={`${id}-guidance`}
      />
      <p id={`${id}-guidance`} className="text-xs text-muted-foreground">
        Use a licensed JPEG, PNG or WebP photo. Paste its approved HTTPS URL, or upload one below.
        Leave blank to show the branded fallback.
      </p>
      <label htmlFor={`${id}-upload`} className="text-sm font-medium">Upload service photo (maximum 4 MB)</label>
      <input
        id={`${id}-upload`}
        aria-label="Upload service photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={uploading}
        onChange={event => { void upload(event) }}
        className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      {uploading && <p role="status" className="text-sm text-muted-foreground">Uploading image…</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {url && isAllowedArticleImage(url) && (
        <Image src={url} alt="Current service image preview" width={240} height={120} className="max-h-36 rounded-md border object-cover" />
      )}
    </div>
  )
}
