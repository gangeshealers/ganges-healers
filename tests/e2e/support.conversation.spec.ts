import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'

test('a member and staff follow up on the same private support request', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const staff = await browser.newContext({ baseURL })
  const staffPage = await staff.newPage()
  const tag = randomUUID()
  const subject = 'Question about a booking ' + tag
  const emails = [tag + '-member@example.test', tag + '-admin@example.test']
  try {
    expect((await page.request.get('/api/test/login?role=USER&email=' + emails[0])).ok()).toBe(true)
    expect((await staffPage.request.get('/api/test/login?role=ADMIN&email=' + emails[1])).ok()).toBe(true)
    await page.goto('/dashboard/support')
    await page.getByLabel('Subject', { exact: true }).fill(subject)
    await page.getByLabel('Message', { exact: true }).fill('I would like help with my scheduled appointment.')
    await page.getByRole('button', { name: 'Send support request' }).click()
    await expect(page).toHaveURL(/\/dashboard\/support\/[^/?]+$/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: subject })).toBeVisible({ timeout: 30_000 })
    await staffPage.goto('/admin/support')
    await staffPage
      .getByRole('article', { name: 'Support request ' + subject })
      .getByRole('link', { name: 'Open conversation' })
      .click()
    await staffPage.getByLabel('Your reply').fill('The appointment details are ready to review.')
    await staffPage.getByLabel('Request status').selectOption('RESOLVED')
    await staffPage.getByRole('button', { name: 'Send reply' }).click()
    await expect(
      staffPage
        .getByRole('region', { name: 'Conversation' })
        .getByText('The appointment details are ready to review.', { exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page
        .getByRole('region', { name: 'Conversation' })
        .getByText('The appointment details are ready to review.', { exact: true }),
    ).toBeVisible()
    await page.getByLabel('Your reply').fill('I have one more question about the time.')
    await page.getByRole('button', { name: 'Send reply' }).click()
    await expect(
      page
        .getByRole('region', { name: 'Conversation' })
        .getByText('I have one more question about the time.', { exact: true }),
    ).toBeVisible()
    await staffPage.reload()
    await expect(
      staffPage
        .getByRole('region', { name: 'Conversation' })
        .getByText('I have one more question about the time.', { exact: true }),
    ).toBeVisible()
    await expect(staffPage.getByLabel('Request status')).toHaveValue('OPEN')
  } finally {
    await staff.close()
    const ids = (await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } })).map(
      (u) => u.id,
    )
    await db.activityLog.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
    await db.$disconnect()
  }
})
