import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { hasProductImageSignature, isAllowedArticleImage, productImageError } from '@/config/images'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Upload only approved/licensed service imagery using an active administrator. */
export async function POST(request: Request) {
  try {
    await requireCurrentAdmin()
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error && error.status === 401 ? 401 : 403
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status, headers })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return NextResponse.json({ error: 'Image storage is not configured' }, { status: 503, headers })

  let file: File
  try {
    const form = await request.formData()
    const candidate = form.get('image')
    if (!(candidate instanceof File)) return NextResponse.json({ error: 'Choose an image file' }, { status: 400, headers })
    file = candidate
  } catch {
    return NextResponse.json({ error: 'Invalid image upload' }, { status: 400, headers })
  }

  const invalid = productImageError(file)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400, headers })
  const type = file.type
  if (!extensions[type]) return NextResponse.json({ error: 'Unsupported image format' }, { status: 400, headers })

  try {
    const buffer = new Uint8Array(await file.arrayBuffer())
    if (!hasProductImageSignature(buffer, type)) {
      return NextResponse.json({ error: 'The file contents do not match its image type' }, { status: 400, headers })
    }
    const blob = await put(`service-images/${randomUUID()}.${extensions[type]}`, buffer, {
      access: 'public',
      contentType: type,
      token,
    })
    if (!isAllowedArticleImage(blob.url)) throw new Error('Unexpected storage image URL')
    return NextResponse.json({ url: blob.url }, { status: 201, headers })
  } catch (error) {
    console.error('[admin][services][image_upload_failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Image upload is temporarily unavailable' }, { status: 503, headers })
  }
}
