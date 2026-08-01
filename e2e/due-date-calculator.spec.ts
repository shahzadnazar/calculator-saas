import { test, expect, type Page } from '@playwright/test';

/**
 * Due Date — R14B1 Gestational pilot (1 of 2), the fleet's first date-input
 * migration. Task-first: the LMP starts empty, the visitor presses "Calculate
 * Due Date" for the first result (live-after-first after). The dominant result is
 * the estimated due date (LMP+280, clock-free); "how far along" + trimester are
 * secondary and render only while ongoing. A future LMP is invalid; a past-due
 * date keeps the due date with a neutral note and no unbounded progress. The
 * medical disclaimer is island-owned (present on page AND embed). The
 * complete-result guard lives in resultValue (no isUsableResult).
 *
 * LMP dates are computed RELATIVE to the machine's local today so the suite is
 * date-agnostic: ongoing = today−100d, past-due = today−300d, future = today+5d.
 */

const DEBOUNCE = 300;
const ROUTE = '/health/due-date-calculator';
const EMBED = '/embed/health/due-date-calculator';

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const ONGOING = isoOffset(-100); // ~14w2d, ongoing
const ANOTHER = isoOffset(-120); // ~17w1d, ongoing (for live update)
const PAST_DUE = isoOffset(-300); // due date ~20 days ago
const FUTURE = isoOffset(5);
const TODAY = isoOffset(0);

const shell = (page: Page) => page.locator('#dd-result');
const submit = (page: Page) => page.locator('[data-dd-submit]');
const lmp = (page: Page) => page.locator('[name="lmp"]');
const live = (page: Page) => page.locator('#dd-live');
const fieldError = (page: Page) => page.locator('[data-error-for="lmp"]');
const dominant = (page: Page) => page.locator('#dd-result [data-result-value]');
const along = (page: Page) => page.locator('#dd-result [data-dd-along]');
const trimester = (page: Page) => page.locator('#dd-result [data-dd-trimester]');
const interp = (page: Page) => page.locator('[data-dd-interpretation]');
const region = (page: Page, when: string) => page.locator(`#dd-result [data-result-when~="${when}"]`);

async function setDate(page: Page, sel: string, value: string) {
  await page.locator(sel).fill(value);
}

test.describe('due date: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads task-first: empty LMP, empty result, Calculate Due Date, no auto-calc', async ({ page }) => {
    await expect(lmp(page)).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(submit(page)).toHaveText('Calculate Due Date');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('the LMP picker max is capped at the local today', async ({ page }) => {
    await expect(lmp(page)).toHaveAttribute('max', TODAY);
  });

  test('an ordinary LMP produces a due date + how-far-along + trimester', async ({ page }) => {
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).not.toHaveText('—');
    await expect(dominant(page)).toContainText(/\d{4}/); // a year
    await expect(along(page)).toHaveText(/^\d+w \d+d$/);
    await expect(trimester(page)).toHaveText(/^(1st|2nd|3rd)$/);
    await expect(interp(page)).toContainText('estimated due date is');
    await expect(live(page)).toContainText('Estimated due date:');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('a same-day LMP is 0w 0d, trimester 1st', async ({ page }) => {
    await setDate(page, '[name="lmp"]', TODAY);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(along(page)).toHaveText('0w 0d');
    await expect(trimester(page)).toHaveText('1st');
  });

  test('a future LMP is rejected with the future message and focuses the field', async ({ page }) => {
    await setDate(page, '[name="lmp"]', FUTURE);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(fieldError(page)).toContainText('not in the future');
    await expect(lmp(page)).toBeFocused();
    await expect(region(page, 'valid')).toBeHidden();
  });

  test('an empty submission asks for the LMP and focuses the field', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(fieldError(page)).toContainText('Enter the first day of your last menstrual period');
    await expect(lmp(page)).toBeFocused();
    await expect(lmp(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(lmp(page)).toHaveAttribute('aria-describedby', /dd-lmp-error/);
  });

  test('a historical LMP whose due date has passed keeps the date, drops progress, and notes it passed', async ({ page }) => {
    await setDate(page, '[name="lmp"]', PAST_DUE);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toContainText(/\d{4}/); // due date still shown
    await expect(along(page)).toHaveText('—'); // no unbounded current progress
    await expect(trimester(page)).toHaveText('—');
    await expect(interp(page)).toHaveText('The estimated due date has passed. Check the entered date if this is unexpected.');
    await expect(live(page)).toContainText('This estimated date has passed');
    expect(await region(page, 'valid').innerText()).not.toMatch(/\d+w \d+d/); // no gestational weeks
  });

  test('live-after-first: a valid date change recalculates, keeps focus, no scroll', async ({ page }) => {
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    const first = await dominant(page).innerText();
    const before = await page.evaluate(() => window.scrollY);
    await lmp(page).focus();
    await setDate(page, '[name="lmp"]', ANOTHER);
    await page.waitForTimeout(DEBOUNCE);
    await expect(dominant(page)).not.toHaveText(first); // due date shifted
    await expect(lmp(page)).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test('an invalid live edit clears the stale result', async ({ page }) => {
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    await expect(dominant(page)).not.toHaveText('—');
    await setDate(page, '[name="lmp"]', FUTURE);
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(dominant(page)).toHaveText('—');
  });

  test('reset clears the field, result and announcement, and does not calculate', async ({ page }) => {
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await page.locator('[data-reset]').click();
    await expect(lmp(page)).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  test('keyboard submission (Enter on the Calculate button) computes', async ({ page }) => {
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).focus();
    await submit(page).press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('exactly one medical disclaimer on the public page, outside the live region', async ({ page }) => {
    await expect(page.locator('[data-dd-disclaimer]')).toHaveCount(1);
    await expect(page.locator('[data-dd-disclaimer]')).toBeVisible();
    await expect(page.getByText(/not medical advice/)).toHaveCount(1);
    await expect(page.locator('#dd-live [data-dd-disclaimer]')).toHaveCount(0);
  });

  test('desktop: the due date is within the first viewport at 1366×768; no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    await expect(dominant(page)).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    await expect(dominant(page)).toBeVisible();
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});

test.describe('due date: generated embed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
  });

  test('mounts the task-first island and carries exactly one disclaimer', async ({ page }) => {
    await expect(page.locator('#dd-result')).toHaveAttribute('data-result-state', 'empty');
    await expect(page.locator('[data-dd-submit]')).toHaveText('Calculate Due Date');
    await expect(page.locator('[data-dd-disclaimer]')).toHaveCount(1);
    await expect(page.locator('[data-dd-disclaimer]')).toBeVisible();
  });

  test('calculates a due date on explicit submit', async ({ page }) => {
    await page.locator('[name="lmp"]').fill(ONGOING);
    await page.locator('[data-dd-submit]').click();
    await expect(page.locator('#dd-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#dd-result [data-result-value]')).toContainText(/\d{4}/);
  });
});
