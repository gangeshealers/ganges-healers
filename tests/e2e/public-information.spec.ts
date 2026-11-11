import { expect, test } from '@playwright/test'

test('public information, contact and policy routes stay navigable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/about')
  await expect(page.getByRole('heading', { level: 1, name: 'A place to explore your wellness journey' })).toBeVisible()
  await page.getByRole('link', { name: 'Contact and support', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: "We're here to help you find answers" })).toBeVisible()
  await page.getByRole('link', { name: 'Browse help topics' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How can we help?' })).toBeVisible()

  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: /Privacy Policy/ })).toBeVisible()
  await page.goto('/terms')
  await expect(page.getByRole('heading', { level: 1, name: /Terms of Service/ })).toBeVisible()
})
