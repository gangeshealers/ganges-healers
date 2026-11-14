import { NextRequest } from 'next/server'
import { GET } from '@/app/api/community/posts/route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/requireVIP', () => ({ requireVIP: jest.fn() }))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { communityPost: { findMany: jest.fn() }, $queryRaw: jest.fn() } }))

const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const db = jest.requireMock<{ prisma: { communityPost: { findMany: jest.Mock }; $queryRaw: jest.Mock } }>('@/lib/prisma').prisma
const request = (query = '') => new NextRequest(`http://localhost/api/community/posts?${query}`)
beforeEach(() => {
  jest.resetAllMocks()
  auth.mockResolvedValue({ user: { id: 'owner' } })
  db.communityPost.findMany.mockResolvedValue([])
  db.$queryRaw.mockResolvedValue([])
})

test('mine is always scoped to the session owner and excludes deleted posts', async () => {
  expect((await GET(request('mine=1&userId=someone-else'))).status).toBe(200)
  for (const [query] of db.communityPost.findMany.mock.calls) expect(query.where).toMatchObject({ userId: 'owner', deletedAt: null })
})

test('anonymous readers cannot list owned or public discussions', async () => {
  auth.mockResolvedValue(null)
  expect((await GET(request('mine=1'))).status).toBe(401)
  expect(db.communityPost.findMany).not.toHaveBeenCalled()
})

test('full-text search binds its input and scopes hits before limiting', async () => {
  db.$queryRaw.mockResolvedValue([{ id: 'matching-post' }])
  const search = `calm'; DROP TABLE users; --`
  await GET(request(new URLSearchParams({ mine: '1', topicId: 'topic', tagId: 'tag', search }).toString()))
  const sql = db.$queryRaw.mock.calls[0][0]
  expect(sql.values).toEqual([search, 'owner', 'topic', 'tag'])
  expect(sql.text).not.toContain(search)
  expect(db.communityPost.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
    deletedAt: null, userId: 'owner', topicId: 'topic', tags: { some: { tagId: 'tag' } }, id: { in: ['matching-post'] },
  } }))
})

test('pinned discussions occupy bounded page slots, with cursor continuation to regular posts', async () => {
  db.communityPost.findMany
    .mockResolvedValueOnce([{ id: 'pinned' }, { id: 'first' }])
    .mockResolvedValueOnce([{ id: 'first' }, { id: 'second' }])
  expect(await (await GET(request('take=1'))).json()).toEqual({
    success: true, data: [{ id: 'pinned' }], nextCursor: 'pinned',
  })
  expect(await (await GET(request('take=1&cursor=pinned'))).json()).toEqual({
    success: true, data: [{ id: 'first' }], nextCursor: 'first',
  })
  expect(db.communityPost.findMany).toHaveBeenCalledTimes(2)
  expect(db.communityPost.findMany.mock.calls[0][0]).toMatchObject({
    where: { deletedAt: null }, take: 2,
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  })
  expect(db.communityPost.findMany.mock.calls[1][0]).toMatchObject({
    where: { deletedAt: null }, cursor: { id: 'pinned' }, skip: 1, take: 2,
  })
})

test('engagement sorting has a deterministic final tie breaker', async () => {
  await GET(request('sort=most_liked'))
  expect(db.communityPost.findMany).toHaveBeenCalledTimes(1)
  expect(db.communityPost.findMany.mock.calls[0][0].orderBy).toEqual([{ likes: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }])
})

test('invalid page sizes cannot produce a negative Prisma take', async () => {
  await GET(request('take=-5&cursor=existing'))
  expect(db.communityPost.findMany.mock.calls[0][0].take).toBe(21)
})
