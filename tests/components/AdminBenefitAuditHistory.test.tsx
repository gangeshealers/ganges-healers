import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import AdminBenefitAuditPage from '@/app/admin/members/[id]/benefits/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    activityLog: { count: jest.fn(), findMany: jest.fn() },
  },
}))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((href: string) => { throw new Error('redirect:' + href) }),
  notFound: jest.fn(() => { throw new Error('not-found') }),
}))

const mockAuth = auth as jest.Mock
const authorized = requireCurrentAdmin as jest.Mock
const findUser = prisma.user.findUnique as jest.Mock
const count = prisma.activityLog.count as jest.Mock
const findMany = prisma.activityLog.findMany as jest.Mock
const params = { params: Promise.resolve({ id: 'member-abc' }) }
const member = {
  id: 'member-abc', name: 'Historical Member', email: 'historical@example.test',
  role: 'USER', vip: true, freeSessionCredits: 4, closedAt: null,
}
const audit = {
  id: 'audit-1', createdAt: new Date('2026-11-11T04:30:00Z'),
  user: { name: 'Administrator A', email: 'admin@example.test' },
  metadata: {
    before: { vip: false, freeSessionCredits: 2 },
    after: { vip: true, freeSessionCredits: 4 },
    reason: 'Reviewed recovery adjustment',
    token: 'must-never-render',
  },
}
beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } })
  authorized.mockResolvedValue({ id: 'admin' })
  findUser.mockResolvedValue(member)
  count.mockResolvedValue(1)
  findMany.mockResolvedValue([audit])
})

test('requires current administrator authorization before looking up a member or audit log', async () => {
  mockAuth.mockResolvedValueOnce(null)
  await expect(AdminBenefitAuditPage(params)).rejects.toThrow('redirect:/auth/signin')
  mockAuth.mockResolvedValueOnce({ user: { id: 'ordinary', role: 'USER' } })
  await expect(AdminBenefitAuditPage(params)).rejects.toThrow('redirect:/')
  authorized.mockRejectedValueOnce(new Error('Admin role revoked'))
  await expect(AdminBenefitAuditPage(params)).rejects.toThrow('Admin role revoked')
  expect(findUser).not.toHaveBeenCalled()
  expect(count).not.toHaveBeenCalled()
})

test('missing or oversized account references cannot enumerate history', async () => {
  await expect(AdminBenefitAuditPage({ params: Promise.resolve({ id: 'x'.repeat(201) }) }))
    .rejects.toThrow('not-found')
  expect(findUser).not.toHaveBeenCalled()
  findUser.mockResolvedValueOnce(null)
  await expect(AdminBenefitAuditPage(params)).rejects.toThrow('not-found')
  expect(count).not.toHaveBeenCalled()
})

test('member detail shows before/after audited edits, reason, staff and IST without raw metadata', async () => {
  render(await AdminBenefitAuditPage(params))
  expect(findUser).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'member-abc' },
    select: expect.not.objectContaining({ password: true }),
  }))
  expect(count).toHaveBeenCalledWith({
    where: { entityType: 'user', entityId: 'member-abc', action: 'user_benefits_updated' },
  })
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { entityType: 'user', entityId: 'member-abc', action: 'user_benefits_updated' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 0, take: 20,
  }))
  expect(screen.getByRole('heading', { name: 'Manual benefit change history' })).toBeInTheDocument()
  expect(screen.getByText('Historical Member')).toBeInTheDocument()
  expect(screen.getByText('No → Yes')).toBeInTheDocument()
  expect(screen.getByText('2 → 4')).toBeInTheDocument()
  expect(screen.getByText(/Reviewed recovery adjustment/)).toBeInTheDocument()
  expect(screen.getByText(/Changed by Administrator A/)).toBeInTheDocument()
  expect(screen.getByText(/11 Nov 2026/)).toHaveTextContent('IST')
  expect(screen.queryByText(/must-never-render/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to member directory' })).toHaveAttribute('href', '/admin')
})

test('member audit page uses bounded pagination and avoids ghost pages', async () => {
  count.mockResolvedValueOnce(42)
  findMany.mockResolvedValueOnce([audit])
  render(await AdminBenefitAuditPage({ ...params, searchParams: Promise.resolve({ page: '2' }) }))
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }))
  expect(screen.getByRole('link', { name: 'Previous changes' }))
    .toHaveAttribute('href', '/admin/members/member-abc/benefits')
  expect(screen.getByRole('link', { name: 'Next changes' }))
    .toHaveAttribute('href', '/admin/members/member-abc/benefits?page=3')
})

test('empty and legacy audit rows do not fabricate changed balances or reasons', async () => {
  count.mockResolvedValueOnce(0)
  render(await AdminBenefitAuditPage(params))
  expect(findMany).not.toHaveBeenCalled()
  expect(screen.getByText('No manual benefit edits are recorded for this account.')).toBeInTheDocument()
})
