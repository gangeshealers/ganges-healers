import { NextRequest, NextResponse } from 'next/server'
import { listHealers, parseHealerDirectorySort } from '@/lib/healers/queries'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || undefined
  const serviceSlug = searchParams.get('serviceSlug') || undefined
  const rawLimit = searchParams.get('limit')
  const limit = rawLimit?.trim() ? Number(rawLimit) : undefined
  const cursor = searchParams.get('cursor') || undefined
  const sort = parseHealerDirectorySort(searchParams.get('sort'))
  try {
    const data = await listHealers({ q, serviceSlug, sort, limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined, cursor })
    return NextResponse.json(data)
  } catch (e) {
    console.error('[healers][list][error]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
