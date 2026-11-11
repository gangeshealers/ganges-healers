import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import AdminPage from '@/app/admin/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { count: jest.fn(), findMany: jest.fn() },
    service: { count: jest.fn() },
    healer: { count: jest.fn() },
    program: { count: jest.fn() },
    course: { count: jest.fn() },
    audioTrack: { count: jest.fn() },
    product: { count: jest.fn() },
    blogPost: { count: jest.fn() },
  },
}))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => { throw new Error('redirect:' + url) }),
}))
jest.mock('@/components/admin/user-benefits-form', () => ({
  UserBenefitsForm: ({ label, reloadHref }: { label: string; reloadHref: string }) =>
    <div data-testid="benefits-editor">{label} | {reloadHref}</div>,
}))
jest.mock('@/components/admin/catalog-overview', () => ({ AdminCatalogOverview: () => <div>Catalog overview</div> }))

const actor = auth as jest.Mock
const authorized = requireCurrentAdmin as jest.Mock
const count = prisma.user.count as jest.Mock
const findMany = prisma.user.findMany as jest.Mock
const user = {
  id: 'old-member', email: 'old-member@example.test', name: 'Older Member',
  role: 'USER', vip: false, freeSessionCredits: 1,
  updatedAt: new Date('2026-06-11T00:00:00Z'),
  createdAt: new Date('2026-04-11T00:00:00Z'),
}
beforeEach(() => {
  jest.clearAllMocks()
  actor.mockResolvedValue({ user: { id: 'current-admin', role: 'ADMIN' } })
  authorized.mockResolvedValue({ id: 'current-admin', role: 'ADMIN' })
  count.mockResolvedValue(1)
  findMany.mockResolvedValue([user])
  for (const model of ['service', 'healer', 'program', 'course', 'audioTrack', 'product', 'blogPost'] as const) {
    (prisma[model].count as jest.Mock).mockResolvedValue(1)
  }
})

test('requires a signed-in admin and checks the live admin role before any account query', async () => {
  actor.mockResolvedValueOnce(null)
  await expect(AdminPage()).rejects.toThrow('redirect:/auth/signin')
  actor.mockResolvedValueOnce({ user: { id: 'member', role: 'USER' } })
  await expect(AdminPage()).rejects.toThrow('redirect:/')
  expect(count).not.toHaveBeenCalled()
  expect(findMany).not.toHaveBeenCalled()
  expect(authorized).not.toHaveBeenCalled()

  authorized.mockRejectedValueOnce(new Error('Administrator authorization revoked'))
  await expect(AdminPage()).rejects.toThrow('Administrator authorization revoked')
  expect(count).not.toHaveBeenCalled()
})

test('the directory filters across all users and preserves search on benefit reload', async () => {
  count.mockResolvedValueOnce(112)
  render(await AdminPage({
    searchParams: Promise.resolve({ q: '  older member  ', role: 'user', page: '2' }),
  }))
  expect(authorized).toHaveBeenCalledTimes(1)
  expect(count).toHaveBeenCalledWith({
    where: { role: 'USER', OR: [
      { id: 'older member' },
      { email: { contains: 'older member', mode: 'insensitive' } },
      { name: { contains: 'older member', mode: 'insensitive' } },
    ] },
  })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    skip: 50, take: 50,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    where: expect.objectContaining({ role: 'USER' }),
    select: expect.objectContaining({ id: true, updatedAt: true, freeSessionCredits: true }),
  }))
  expect(screen.getByRole('heading', { name: 'Find and manage member benefits' })).toBeInTheDocument()
  expect(screen.getByText(/Older Member.*old-member@example\.test/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Previous accounts' })).toHaveAttribute('href', '/admin?role=user&q=older+member')
  expect(screen.getByRole('link', { name: 'Next accounts' })).toHaveAttribute('href', '/admin?role=user&q=older+member&page=3')
  expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByTestId('benefits-editor')).toHaveTextContent('/admin?role=user&q=older+member&page=2')
})

test('requests beyond the last page clamp to a real account page', async () => {
  count.mockResolvedValueOnce(2)
  render(await AdminPage({ searchParams: Promise.resolve({ page: '9999', role: ['USER'], q: ['untrusted'] }) }))
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 50, where: {} }))
  expect(screen.getByRole('link', { name: 'All accounts' })).toHaveAttribute('aria-current', 'page')
  expect(screen.queryByRole('link', { name: 'Next accounts' })).not.toBeInTheDocument()
})

test('empty searches have a recovery route without querying unrelated benefits', async () => {
  count.mockResolvedValueOnce(0)
  findMany.mockResolvedValueOnce([])
  render(await AdminPage({ searchParams: Promise.resolve({ q: 'nobody@example.test' }) }))
  expect(screen.getByText('No accounts match the selected search or role.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Show all accounts' })).toHaveAttribute('href', '/admin')
  expect(screen.queryByTestId('benefits-editor')).not.toBeInTheDocument()
})
