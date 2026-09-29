import { test, expect } from '@playwright/test';

/**
 * What a writer deciding whether to quote a figure actually touches: the date,
 * the citation, and the CSV. None of it is worth anything if the page renders
 * it and the file 404s, which is exactly the kind of gap a unit test cannot see.
 */
const PAGE = '/reference/mortgage-payment-table';

test('states when the figures were verified', async ({ page }) => {
  await page.goto(PAGE);
  const when = page.locator('time[datetime]').first();
  await expect(when).toBeVisible();
  await expect(when).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
});

test('offers the citation already written, and copying it does not throw', async ({ page }) => {
  await page.goto(PAGE);
  const citation = page.locator('[data-citation]');
  await expect(citation).toContainText('BestCalculate');
  await expect(citation).toContainText(`https://bestcalculate.com${PAGE}`);

  const button = page.getByRole('button', { name: 'Copy citation' });
  await expect(button).toBeVisible();
  await button.click();
  // Headless Chromium may refuse clipboard access; either outcome is fine, a
  // thrown error is not — the fallback selects the text instead.
  await expect(button).toBeEnabled();
});

test('names the licence, and links it so the terms are one click away', async ({ page }) => {
  await page.goto(PAGE);
  const licence = page.getByRole('link', { name: 'CC BY 4.0' });
  await expect(licence).toBeVisible();
  await expect(licence).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  await expect(page.locator('section', { has: licence })).toContainText('say where they came from');
});

test('the CSV link resolves to a real file, not a 404 or the HTML page', async ({ page, request }) => {
  await page.goto(PAGE);
  const link = page.getByRole('link', { name: /download csv/i });
  await expect(link).toBeVisible();

  const href = await link.getAttribute('href');
  expect(href).toBe(`${PAGE}.csv`);

  const res = await request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/csv');

  const body = await res.text();
  const lines = body.trim().split(/\r\n/);
  expect(lines.length).toBeGreaterThan(2);
  expect(lines[0]).toContain('Interest rate');
  expect(body).not.toContain('<html');
});

test('the CSV matches the table the page shows', async ({ page, request }) => {
  await page.goto(PAGE);
  const firstCell = (await page.locator('table tbody tr').first().locator('td, th').first().innerText()).trim();
  const csv = await (await request.get(`${PAGE}.csv`)).text();
  expect(csv.split(/\r\n/)[1]).toContain(firstCell);
});

test('every reference table ships its CSV', async ({ request }) => {
  const slugs = [
    'mortgage-payment-table', 'loan-payment-table', 'savings-growth-table', 'bmi-chart',
    'monthly-investment-table', 'salary-conversion-table', 'inflation-purchasing-power-table',
    'ideal-weight-table', 'target-heart-rate-table', 'tip-table',
  ];
  for (const slug of slugs) {
    const res = await request.get(`/reference/${slug}.csv`);
    expect(res.status(), slug).toBe(200);
  }
});
