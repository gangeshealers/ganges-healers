import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { isSupportDeskEnabled } from '@/lib/support/availability'
import AdminSupportPage from '@/app/admin/support/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { supportTicket: { count: jest.fn(), findMany: jest.fn() } } }))
jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
jest.mock('@/lib/support/availability', () => ({ isSupportDeskEnabled: jest.fn() }))
jest.mock('@/lib/support/tickets', () => ({
  SupportTicketError: class SupportTicketError extends Error {},
  updateAdminSupportTicket: jest.fn(),
}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((href: string) => { throw new Error('redirect:' + href) }),
}))

const mockAuth = auth as jest.Mock
const mockAdmin = requireCurrentAdmin as jest.Mock
const available = isSupportDeskEnabled as jest.Mock
const count = prisma.supportTicket.count as jest.Mock
const findMany = prisma.supportTicket.findMany as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } })
  mockAdmin.mockResolvedValue({ id: 'admin-1' })
  available.mockReturnValue(true)
  count.mockResolvedValue(0)
  findMany.mockResolvedValue([])
})

test('anonymous visitors and users without current admin rights never query private tickets', async () => {
  mockAuth.mockResolvedValueOnce(null)
  await expect(AdminSupportPage({ searchParams: Promise.resolve({ q: 'private' }) }))
    .rejects.toThrow('redirect:/auth/signin')
  expect(count).not.toHaveBeenCalled()
  mockAuth.mockResolvedValueOnce({ user: { id: 'old-admin', role: 'ADMIN' } })
  mockAdmin.mockRejectedValueOnce(new Error('Forbidden'))
  await expect(AdminSupportPage({ searchParams: Promise.resolve({ q: 'private' }) }))
    .rejects.toThrow('Forbidden')
  expect(count).not.toHaveBeenCalled()
  expect(findMany).not.toHaveBeenCalled()
})

test('searches and pages staff-owned queue, retaining the filters on replies', async () => {
  count.mockResolvedValueOnce(45)
  findMany.mockResolvedValueOnce([{
    id: 'ticket-12345678', subject: 'Yoga class question', message: 'Private membership concern.',
    status: 'IN_PROGRESS', response: 'We are checking.', createdAt: new Date('2026-11-01T10:00:00Z'),
    updatedAt: new Date('2026-11-10T10:00:00Z'),
    user: { id: 'user-1', name: 'Account holder', email: 'account@example.com' },
  }])
  render(await AdminSupportPage({ searchParams: Promise.resolve({ status: 'IN_PROGRESS', q: 'yoga', page: '2' }) }))
  expect(count).toHaveBeenCalledWith({ where: expect.objectContaining({ status: 'IN_PROGRESS', OR: expect.any(Array) }) })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 30, take: 30 }))
  expect(screen.getByRole('searchbox', { name: 'Find a request' })).toHaveValue('yoga')
  expect(screen.getByRole('link', { name: 'All requests' })).toHaveAttribute('href', '/admin/support?status=ALL&q=yoga')
  expect(screen.getByRole('link', { name: 'Previous requests' })).toHaveAttribute('href', '/admin/support?status=IN_PROGRESS&q=yoga')
  const form = within(screen.getByRole('article', { name: 'Support request Yoga class question' })).getByRole('button', { name: 'Save support response' }).closest('form')!
  expect(new FormData(form).get('returnStatus')).toBe('IN_PROGRESS')
  expect(new FormData(form).get('returnQuery')).toBe('yoga')
  expect(new FormData(form).get('returnPage')).toBe('2')
})

test('support feature flag blocks all queries when the migration is not ready', async () => {
  available.mockReturnValueOnce(false)
  render(await AdminSupportPage({ searchParams: Promise.resolve({ q: 'abc' }) }))
  expect(count).not.toHaveBeenCalled()
  expect(findMany).not.toHaveBeenCalled()
  expect(screen.getByText(/disabled until the SupportTicket migration/i)).toBeInTheDocument()
})
