import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../../scripts/test-database'
import { test, expect } from '@playwright/test';

test.describe('Admin Payments Dashboard', () => {
  test('shows KPIs, charts and filters react', async ({ page }) => {
    // Allow extra time – underlying analytics queries intentionally slow-ish in test env
    test.setTimeout(120000);
    await page.goto('/admin/payments')
    await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fadmin%2Fpayments/i)
    expect((await page.request.get('/api/test/login?role=ADMIN&email=analytics-staff@example.test')).ok()).toBe(true)
    await page.goto('/admin/payments');

    // The dashboard is a lazy client chunk; cold dev compilation can take time.
    const root = page.locator('[data-test="payments-analytics-root"]');
    await expect(root).toBeVisible({ timeout: 30000 });

    const kpiRow = page.locator('[data-test="kpi-row"]');
    await expect(kpiRow).toBeVisible();

    // Wait for final KPI cards (7) – polling until loading completes
    await expect(page.locator('[data-test="kpi-row"] > [data-test^="kpi-"]')).toHaveCount(7, { timeout: 60000 });

    // Charts
    await expect(page.locator('[data-test="chart-net"]')).toBeVisible();
    await expect(page.locator('[data-test="chart-by-type"]')).toBeVisible();

    // Filter interaction (SESSION -> ensure KPIs still present)
    const typeSelect = page.locator('[data-test="filter-type"]');
    await expect(typeSelect).toBeVisible();
    const filteredResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/payments/metrics' && url.searchParams.get('type') === 'SESSION';
    });
    await typeSelect.selectOption('SESSION');
    const response = await filteredResponse;
    expect(response.ok()).toBeTruthy();
    const filtered = await response.json();
    await expect(page.locator('[data-test="kpi-paymentsCount-value"]')).toHaveText(String(filtered.kpi.paymentsCount));

    // One of the tables (payments or refunds)
    const anyTable = page.locator('[data-test="table-payments"], [data-test="table-refunds"]');
    await expect(anyTable.first()).toBeVisible({ timeout: 30000 });
  });
});


test('exports the current payment and refund date filters as downloadable CSV', async ({ page }) => {
  test.setTimeout(120000)
  expect((await page.request.get('/api/test/login?role=ADMIN&email=analytics-staff@example.test')).ok()).toBe(true)
  await page.goto('/admin/payments')
  await expect(page.locator('[data-test="payments-analytics-root"]')).toBeVisible({ timeout: 30000 })
  await page.locator('[data-test="filter-type"]').selectOption('STORE')

  const paymentResponse = page.waitForResponse((res) => {
    const url = new URL(res.url())
    return url.pathname === '/api/admin/payments/export' &&
      url.searchParams.get('kind') === 'payments' && url.searchParams.get('type') === 'STORE'
  })
  const paymentDownload = page.waitForEvent('download')
  await page.locator('[data-test="export-payments-csv"]').click()
  expect((await paymentResponse).ok()).toBe(true)
  expect((await paymentDownload).suggestedFilename()).toMatch(/^ganges-healers-payments-.*\.csv$/)

  const refundResponse = page.waitForResponse((res) => {
    const url = new URL(res.url())
    return url.pathname === '/api/admin/payments/export' && url.searchParams.get('kind') === 'refunds'
  })
  const refundDownload = page.waitForEvent('download')
  await page.locator('[data-test="export-refunds-csv"]').click()
  expect((await refundResponse).ok()).toBe(true)
  expect((await refundDownload).suggestedFilename()).toMatch(/^ganges-healers-refunds-.*\.csv$/)
})

test('staff can follow an unresolved refund to its booking and issued invoice', async ({ page }) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const tag = randomUUID()
  const emails = [tag + '-member@example.test', tag + '-staff@example.test']
  try {
    const member = await db.user.create({ data: { email: emails[0] } })
    const service = await db.service.findUniqueOrThrow({ where: { slug: 'yoga-therapy' } })
    const healer = await db.healer.findFirstOrThrow({ where: { isActive: true, isVerified: true } })
    const booking = await db.booking.create({ data: {
      userId: member.id, serviceId: service.id, healerId: healer.id, scheduledAt: new Date(),
      durationMin: 60, pricePaise: 10000, status: 'CANCELLED',
    } })
    const payment = await db.payment.create({ data: {
      userId: member.id, bookingId: booking.id, gateway: 'razorpay', amountPaise: 10000,
      type: 'SESSION', statusEnum: 'SUCCESS', status: 'success',
    } })
    await db.refund.createMany({ data: [
      { paymentId: payment.id, amountPaise: 2500, status: 'processed', gatewayRefundId: 'rf-' + tag },
      { paymentId: payment.id, amountPaise: 7500, status: 'success' },
    ] })
    const invoice = await db.invoice.create({ data: {
      paymentId: payment.id, invoiceNumber: 'test-' + tag, billTo: {}, lineItems: [], subtotalPaise: 10000, totalPaise: 10000, pdfUrl: '',
    } })
    expect((await page.request.get('/api/test/login?role=ADMIN&email=' + emails[1])).ok()).toBe(true)
    await page.goto('/admin/payments')
    const row = page.getByRole('row').filter({ hasText: payment.id }).filter({ hasText: 'Needs review' })
    await row.getByRole('link', { name: 'Review booking' }).click()
    await expect(page).toHaveURL(new RegExp('/admin/bookings/' + booking.id + '$'))
    await expect(page.getByText(invoice.invoiceNumber, { exact: true })).toBeVisible()
    await expect(page.getByText('Confirmed refund total').locator('..')).toContainText('₹25.00')
    await expect(page.getByText(/₹75.00 · Needs review/)).toBeVisible()
  } finally {
    await db.user.deleteMany({ where: { email: { in: emails } } })
    await db.$disconnect()
  }
})
