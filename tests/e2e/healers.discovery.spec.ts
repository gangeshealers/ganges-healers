import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'

test('healer directory pages preserve filters, finish on the last result and reject unavailable service filters', async ({ page }, testInfo) => {
  test.setTimeout(120000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = randomUUID(), users: string[] = [], services: string[] = []
  const activeName = `Directory service ${token}`
  try {
    const active = await db.service.create({ data: { slug: `directory-${token}`, name: activeName, description: 'Isolated directory browser fixture', category: 'Fixture', price: 100, duration: 60 } }); services.push(active.id)
    const inactive = await db.service.create({ data: { slug: `inactive-directory-${token}`, name: `Inactive ${token}`, description: 'Unpublished fixture', category: 'Fixture', price: 100, duration: 60, isActive: false } }); services.push(inactive.id)
    for (let index = 0; index < 22; index++) {
      const healer = await db.healer.create({ data: { isVerified: true, specializations: [index === 21 ? inactive.name : activeName], user: { create: { name: `Directory Fixture ${index} ${token}`, email: `directory-browser-${index}-${token}@example.test`, role: 'HEALER' } } } }); users.push(healer.userId)
    }
    const unverified = await db.healer.create({ data: { isVerified: false, specializations: [activeName], user: { create: { name: `Unverified Fixture ${token}`, email: `unverified-directory-${token}@example.test`, role: 'HEALER' } } } }); users.push(unverified.userId)
    const query = new URLSearchParams({ q: token, serviceSlug: active.slug })
    await page.goto(`/healers?${new URLSearchParams({ q: token })}`)
    const form = page.getByRole('form', { name: 'Find healers', exact: true })
    await expect(form.getByRole('option', { name: inactive.name, exact: true })).toHaveCount(0)
    await form.getByLabel('Service', { exact: true }).selectOption(active.slug)
    await form.getByRole('button', { name: 'Search', exact: true }).click()
    expect(new URL(page.url()).searchParams.get('serviceSlug')).toBe(active.slug)
    await expect(page.getByRole('link', { name: /^Directory Fixture/ })).toHaveCount(20)
    const api = await page.request.get(`/api/healers?${query}`)
    expect(api.status()).toBe(200)
    const first = await api.json()
    expect(first.items).toHaveLength(20)
    expect(first.items.some((healer: { id: string }) => healer.id === unverified.id)).toBe(false)
    await page.getByRole('link', { name: 'Load more', exact: true }).click()
    expect(new URL(page.url()).searchParams.get('q')).toBe(token)
    expect(new URL(page.url()).searchParams.get('serviceSlug')).toBe(active.slug)
    await expect(page.getByRole('link', { name: /^Directory Fixture/ })).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Load more', exact: true })).toHaveCount(0)
    const last = await (await page.request.get(`/api/healers?${query}&cursor=${first.nextCursor}`)).json()
    expect(last.items).toHaveLength(1); expect(last.nextCursor).toBeNull()
    expect(new Set([...first.items, ...last.items].map((row: { id: string }) => row.id)).size).toBe(21)
    const exact = await (await page.request.get(`/api/healers?${query}&limit=21`)).json()
    expect(exact.items).toHaveLength(21); expect(exact.nextCursor).toBeNull()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: testInfo.outputPath('healer-directory-mobile.png'), fullPage: true })
    for (const serviceSlug of [`missing-${token}`, inactive.slug]) {
      await page.goto(`/healers?${new URLSearchParams({ q: token, serviceSlug })}`)
      await expect(page.getByRole('heading', { name: 'No healers found', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: /^Directory Fixture/ })).toHaveCount(0)
      await expect(page.getByRole('combobox', { name: 'Service', exact: true })).toHaveValue(serviceSlug)
      const cleared = page.getByRole('link', { name: 'Clear filters', exact: true })
      await expect(cleared).toHaveAttribute('href', '/healers')
      await page.getByRole('form', { name: 'Find healers', exact: true }).getByRole('button', { name: 'Search', exact: true }).click()
      expect(new URL(page.url()).searchParams.get('serviceSlug')).toBe(serviceSlug)
      await expect(page.getByRole('heading', { name: 'No healers found', exact: true })).toBeVisible()
      const filtered = await (await page.request.get(`/api/healers?${new URLSearchParams({ q: token, serviceSlug })}`)).json()
      expect(filtered).toEqual({ items: [], nextCursor: null })
    }
    await db.service.update({ where: { id: active.id }, data: { isActive: false } })
    await page.goto(`/healers?${query}`)
    await expect(page.getByRole('heading', { name: 'No healers found', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: active.name, exact: true })).toHaveCount(0)
  } finally {
    try {
      await db.user.deleteMany({ where: { id: { in: users } } })
      await db.service.deleteMany({ where: { id: { in: services } } })
    } finally { await db.$disconnect() }
  }
})
