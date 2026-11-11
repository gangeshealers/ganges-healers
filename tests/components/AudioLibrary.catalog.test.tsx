import { render, screen } from '@testing-library/react'
import AudioLibraryPage from '@/app/audio/page'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    audioTrack: { count: jest.fn(), findMany: jest.fn() },
  },
}))

beforeEach(() => jest.clearAllMocks())

test('published audio is paged and keeps search/category/sort on continuation links', async () => {
  jest.mocked(prisma.audioTrack.count).mockResolvedValueOnce(25)
  jest.mocked(prisma.audioTrack.findMany).mockImplementation(async args => {
    if ('distinct' in args) return [{ category: 'Meditation' }] as never
    return [{
      id: 'track-13', slug: 'meditation-track-13', title: 'Meditation Track 13',
      description: 'Mindfulness', duration: 240, category: 'Meditation', isPremium: false,
    }] as never
  })
  const page = await AudioLibraryPage({
    searchParams: Promise.resolve({ q: 'Meditation', category: 'Meditation', sort: 'shortest', page: '2' }),
  })
  render(page)
  expect(screen.getByRole('heading', { name: 'Guided Healing Audio Library' })).toBeVisible()
  expect(screen.getByRole('link', { name: /Meditation Track 13/ })).toHaveAttribute('href', '/audio/meditation-track-13')
  expect(screen.getByRole('link', { name: 'Previous tracks' })).toHaveAttribute('href', '/audio?category=Meditation&q=Meditation&sort=shortest')
  expect(screen.getByRole('link', { name: 'Next tracks' })).toHaveAttribute('href', '/audio?category=Meditation&q=Meditation&sort=shortest&page=3')
  expect(prisma.audioTrack.count).toHaveBeenCalledWith({
    where: expect.objectContaining({ isPublished: true, category: 'Meditation' }),
  })
  expect(prisma.audioTrack.findMany).toHaveBeenCalledWith(expect.objectContaining({
    skip: 12, take: 12,
    orderBy: [{ duration: 'asc' }, { id: 'asc' }],
  }))
})

test('an empty filtered result can be reset without losing access to the library', async () => {
  jest.mocked(prisma.audioTrack.count).mockResolvedValueOnce(0)
  jest.mocked(prisma.audioTrack.findMany).mockResolvedValueOnce([{ category: 'Meditation' }] as never)
  render(await AudioLibraryPage({ searchParams: Promise.resolve({ q: 'missing' }) }))
  expect(screen.getByText('No audio tracks found')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/audio')
  expect(screen.getByRole('searchbox', { name: 'Search audio tracks' })).toHaveValue('missing')
})
