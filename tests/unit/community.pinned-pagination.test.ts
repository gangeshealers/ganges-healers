import { NextRequest } from 'next/server'
import { GET } from '@/app/api/community/posts/route'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { communityPost: { findMany: jest.fn() } } }))

const mockAuth = auth as jest.Mock
const findMany = prisma.communityPost.findMany as jest.Mock
const req = (query = '') => new NextRequest('http://localhost/api/community/posts' + (query ? '?' + query : ''))
const post = (id: string, isPinned: boolean) => ({ id, isPinned, createdAt: new Date('2026-11-01T00:00:00.000Z') })

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'member-1' } })
  findMany.mockResolvedValue([])
})

describe('community pinned discussion pagination', () => {
  test('does not query any discussion until the user signs in', async () => {
    mockAuth.mockResolvedValueOnce(null)
    expect((await GET(req())).status).toBe(401)
    expect(findMany).not.toHaveBeenCalled()
  })

  test('bounds pinned posts to the requested page and continues through the pinned/nonpinned boundary', async () => {
    findMany.mockResolvedValueOnce([post('pin-1', true), post('pin-2', true), post('pin-3', true)])
    const first = await GET(req('take=2'))
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({
      success: true, data: [{ id: 'pin-1' }, { id: 'pin-2' }], nextCursor: 'pin-2',
    })
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 3,
      where: { deletedAt: null },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    }))
    findMany.mockResolvedValueOnce([post('pin-3', true), post('ordinary-1', false), post('ordinary-2', false)])
    const second = await GET(req('take=2&cursor=pin-2'))
    expect(await second.json()).toMatchObject({
      success: true, data: [{ id: 'pin-3' }, { id: 'ordinary-1' }], nextCursor: 'ordinary-1',
    })
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: { id: 'pin-2' }, skip: 1, take: 3,
      where: { deletedAt: null },
    }))
    findMany.mockResolvedValueOnce([post('ordinary-2', false)])
    const third = await GET(req('take=2&cursor=ordinary-1'))
    expect(await third.json()).toMatchObject({
      success: true, data: [{ id: 'ordinary-2' }], nextCursor: null,
    })
  })

  test('older ranking and search modes keep their original chronological/engagement order', async () => {
    await GET(req('sort=most_liked'))
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      orderBy: [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }],
    }))
    await GET(req('sort=most_commented'))
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      orderBy: [{ comments: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }],
    }))
  })
})
