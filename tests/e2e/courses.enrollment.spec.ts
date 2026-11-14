import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'
import { buildProgramSchedule } from '../../src/lib/programs/schedule'

test('a customer enrolls in a free course and reaches its gated lesson without payment checkout', async ({ page }) => {
  test.setTimeout(120000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const email = `free-course-${randomUUID()}@example.test`
  let userId = ''
  let courseId = ''
  let programId = ''
  const gatewayRequests: string[] = []
  page.on('request', request => { if (new URL(request.url()).hostname.endsWith('razorpay.com')) gatewayRequests.push(request.url()) })
  try {
    userId = (await db.user.create({ data: { email, name: 'Free Course Customer' } })).id
    const course = await db.course.create({ data: {
      slug: `free-course-${randomUUID()}`, title: 'Free Practice Course', description: 'An isolated free enrollment test.', pricePaise: 0,
      lessons: { create: { title: 'First Free Practice', order: 1, content: '<p>Practice content for the isolated browser test.</p>' } },
    }, include: { lessons: true } })
    courseId = course.id
    // This is the guarded local test helper, never a production login or real gateway purchase.
    expect((await page.request.get(`/api/test/login?${new URLSearchParams({ role: 'USER', email })}`)).status()).toBe(200)
    await page.goto(`/courses/${course.slug}`)
    const enroll = page.getByRole('button', { name: 'Enroll for free', exact: true })
    await expect(enroll).toBeEnabled({ timeout: 30000 })
    await enroll.click()
    await expect(page).toHaveURL(new RegExp(`/courses/${course.slug}/lesson/${course.lessons[0].id}$`), { timeout: 30000 })
    await expect(page.getByRole('heading', { name: 'First Free Practice', exact: true })).toBeVisible({ timeout: 30000 })
    expect(await db.courseEnrollment.count({ where: { userId, courseId, status: 'active', pricePaise: 0 } })).toBe(1)
    expect(await db.payment.count({ where: { userId } })).toBe(0)
    expect(gatewayRequests).toEqual([])
    expect((await page.request.post(`/api/courses/${course.slug}/enroll`)).status()).toBe(409)
    expect(await db.courseEnrollment.count({ where: { userId, courseId } })).toBe(1)

    await page.goto('/courses/enrolled')
    await expect(page.getByRole('heading', { name: 'My Courses' })).toBeVisible()
    await expect(page.getByText('Free Practice Course', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Continue learning' }))
      .toHaveAttribute('href', `/courses/${course.slug}/lesson/${course.lessons[0].id}`)

    // Removing a course from the public catalog must never revoke an enrolled member's lesson access.
    await db.course.update({ where: { id: courseId }, data: { isActive: false } })
    await page.reload()
    await expect(page.getByText('Archived · access retained')).toBeVisible()
    await page.getByRole('link', { name: 'Continue learning' }).click()
    await expect(page.getByRole('heading', { name: 'First Free Practice', exact: true })).toBeVisible()

    const program = await db.program.create({ data: { slug: `dashboard-program-${randomUUID()}`, title: 'Mindful Practice Journey', description: 'Isolated dashboard fixture.', pricePaise: 10000, totalSessions: 4, sessionsPerWeek: 2, durationMinutes: 45 } })
    programId = program.id
    await db.programEnrollment.create({ data: { userId, programId, status: 'active', schedule: buildProgramSchedule(4, 2, 45, new Date()).sessions } })
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Your healing space' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Your account workspaces' })).toBeVisible()
    await expect(page.getByText('Archived · access retained')).toBeVisible()
    await expect(page.getByText('0 of 4 sessions completed')).toBeVisible()
    await expect(page.getByText('Your next appointment is awaiting confirmation.')).toBeVisible()
    await test.info().attach('member-dashboard-desktop', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await test.info().attach('member-dashboard-mobile', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    await page.getByRole('link', { name: 'Continue learning: Free Practice Course' }).click()
    await expect(page.getByRole('heading', { name: 'First Free Practice', exact: true })).toBeVisible()
  } finally {
    try {
      if (userId) await db.user.delete({ where: { id: userId } })
      if (courseId) await db.course.delete({ where: { id: courseId } })
      if (programId) await db.program.delete({ where: { id: programId } })
    } finally { await db.$disconnect() }
  }
})
