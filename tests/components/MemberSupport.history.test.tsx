import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isSupportDeskEnabled } from '@/lib/support/availability'
import MemberSupportPage from '@/app/dashboard/support/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { supportTicket: { findMany: jest.fn() } } }))
jest.mock('@/lib/support/availability', () => ({ isSupportConversationEnabled: jest.fn(() => false), isSupportDeskEnabled: jest.fn(() => true) }))
jest.mock('@/components/support/SupportTicketForm', () => ({ __esModule: true, default: () => <div>Support request form</div> }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => { throw new Error('redirect:' + url) }),
}))

const mockAuth = auth as jest.Mock
const findMany = prisma.supportTicket.findMany as jest.Mock
const available = isSupportDeskEnabled as jest.Mock
const row = (i: number, status = 'OPEN') => ({
  id: 'ticket-' + i,
  subject: 'Support request ' + i,
  message: 'Private account question',
  status,
  response: i === 0 ? 'Reply saved privately.' : null,
  respondedAt: i === 0 ? new Date('2026-11-10T12:00:00.000Z') : null,
  createdAt: new Date('2026-11-09T08:00:00.000Z'),
})

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'owner-123' } })
  available.mockReturnValue(true)
  findMany.mockResolvedValue([])
})

test('anonymous users cannot query private requests', async () => {
  mockAuth.mockResolvedValueOnce(null)
  await expect(MemberSupportPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/auth/signin')
  expect(findMany).not.toHaveBeenCalled()
})

test('a disabled support desk never queries unmigrated support tables', async () => {
  available.mockReturnValueOnce(false)
  render(await MemberSupportPage({ searchParams: Promise.resolve({}) }))
  expect(screen.getByText(/Support requests are not available on this deployment yet/)).toBeInTheDocument()
  expect(findMany).not.toHaveBeenCalled()
})

test('the owner can page beyond the previous 50-request cap without leaking other accounts', async () => {
  findMany.mockResolvedValueOnce(Array.from({ length: 21 }, (_, i) => row(i)))
  render(await MemberSupportPage({ searchParams: Promise.resolve({ page: '3', status: 'RESOLVED' }) }))
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: 'owner-123', status: 'RESOLVED' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: 40,
    take: 21,
  }))
  expect(screen.getByText('Support request 0')).toBeInTheDocument()
  expect(screen.getByText('Reply saved privately.')).toBeInTheDocument()
  expect(screen.queryByText('Support request 20')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Previous requests' })).toHaveAttribute('href', '/dashboard/support?status=RESOLVED&page=2')
  expect(screen.getByRole('link', { name: 'Next requests' })).toHaveAttribute('href', '/dashboard/support?status=RESOLVED&page=4')
  expect(screen.getByText('Page 3')).toBeInTheDocument()
})

test('repeated and invalid filters default to an owned, unfiltered first page', async () => {
  render(await MemberSupportPage({ searchParams: Promise.resolve({ status: ['OPEN', 'RESOLVED'], page: ['2', '3'] }) }))
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner-123' }, skip: 0 }))
  expect(screen.getByRole('link', { name: 'All requests' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByText('You haven’t sent any support requests yet.')).toBeInTheDocument()
})

test('last page hides further navigation and preserves a recovery link for out-of-range empty pages', async () => {
  render(await MemberSupportPage({ searchParams: Promise.resolve({ page: '1000', status: 'OPEN' }) }))
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 19980 }))
  expect(screen.getByRole('link', { name: 'Previous requests' })).toHaveAttribute('href', '/dashboard/support?status=OPEN&page=999')
  expect(screen.queryByRole('link', { name: 'Next requests' })).not.toBeInTheDocument()
  expect(screen.getByText(/No requests on this page/)).toBeInTheDocument()
})

test('members search only their own subject and message, retaining search and status on pages', async () => {
  findMany.mockResolvedValueOnce(Array.from({ length: 21 }, (_, i) => row(i)))
  render(await MemberSupportPage({ searchParams: Promise.resolve({ q: '  yoga_%  ', status: 'IN_PROGRESS', page: '2' }) }))
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      userId: 'owner-123',
      status: 'IN_PROGRESS',
      OR: [
        { subject: { contains: 'yoga\\_\\%', mode: 'insensitive' } },
        { message: { contains: 'yoga\\_\\%', mode: 'insensitive' } },
      ],
    },
    skip: 20,
    take: 21,
  }))
  expect(screen.getByRole('searchbox', { name: 'Find one of your requests' })).toHaveValue('yoga_%')
  const next = new URL(screen.getByRole('link', { name: 'Next requests' }).getAttribute('href')!, 'https://example.test')
  expect(Object.fromEntries(next.searchParams)).toEqual({ status: 'IN_PROGRESS', q: 'yoga_%', page: '3' })
  const statusHref = new URL(screen.getByRole('link', { name: 'Resolved' }).getAttribute('href')!, 'https://example.test')
  expect(Object.fromEntries(statusHref.searchParams)).toEqual({ status: 'RESOLVED', q: 'yoga_%' })
  expect(screen.getByRole('link', { name: 'Clear search' })).toHaveAttribute('href', '/dashboard/support?status=IN_PROGRESS')
})

test('repeated search values never produce an owner query and a bounded literal search remains private', async () => {
  render(await MemberSupportPage({ searchParams: Promise.resolve({ q: ['other-person', 'private'], page: '2' }) }))
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner-123' }, skip: 20 }))
  expect(screen.queryByRole('link', { name: 'Clear search' })).not.toBeInTheDocument()

  cleanup()
  findMany.mockClear()
  const tooLong = 'a'.repeat(100)
  render(await MemberSupportPage({ searchParams: Promise.resolve({ q: tooLong }) }))
  expect(screen.getByRole('searchbox', { name: 'Find one of your requests' })).toHaveValue('a'.repeat(80))
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      userId: 'owner-123',
      OR: [
        { subject: { contains: 'a'.repeat(80), mode: 'insensitive' } },
        { message: { contains: 'a'.repeat(80), mode: 'insensitive' } },
      ],
    }),
  }))
})

test('search with no matching requests gives a clear recovery path and keeps support requests private', async () => {
  render(await MemberSupportPage({ searchParams: Promise.resolve({ q: 'not found' }) }))
  expect(screen.getByText('No requests match this search.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Clear search' })).toHaveAttribute('href', '/dashboard/support')
})
