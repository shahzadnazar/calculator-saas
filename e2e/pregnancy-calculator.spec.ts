import { test, expect, type Page } from '@playwright/test';

/**
 * Pregnancy — R14B2 Gestational follow-on (2 of 2), the fleet's second date-input
 * migration. Task-first: the LMP starts empty, the visitor presses "Calculate
 * Pregnancy Progress" for the first result (live-after-first after). The DOMINANT
 * result is the CURRENT gestational age while ongoing (how far along); once the
 * estimated due date has passed the dominant figure becomes the due date with a
 * neutral note and no unbounded progress. A future LMP is invalid. Two
 * calculator-owned milestones (LMP+91 / LMP+189) are labelled by the trimester
 * they BEGIN, beside a calculator-owned progress bar. The medical disclaimer is
 * island-owned (present on page AND embed). The complete-result guard lives in
 * resultValue (no isUsableResult).
 *
 * LMP dates are computed RELATIVE to the machine's local today so the suite is
 * date-agnostic: ongoing = today−100d (~14w2d), past-due = today−300d (due ~20
 * days ago), future = today+5d.
 */

const DEBOUNCE = 300;
const ROUTE = '/health/pregnancy-calculator';
const EMBED = '/embed/health/pregnancy-calculator';

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

const shell = (page: Page) => page.locator('#pg-result');
const submit = (page: Page) => page.locator('[data-pg-submit]');
const lmp = (page: Page) => page.locator('[name="lmp"]');
const live = (page: Page) => page.locator('#pg-live');
const fieldError = (page: Page) => page.locator('[data-error-for="lmp"]');
const dominant = (page: Page) => page.locator('#pg-result [data-result-value]');
const label = (page: Page) => page.locator('#pg-result [data-pg-headline-label]');
const secondary = (page: Page) => page.locator('#pg-result [data-pg-secondary]');
const trimester = (page: Page) => page.locator('#pg-result [data-pg-trimester]');
const dueSecondary = (page: Page) => page.locator('#pg-result [data-pg-due-secondary]');
const interp = (page: Page) => page.locator('[data-pg-interpretation]');
const progress = (page: Page) => page.locator('[data-pg-progress]');
const bar = (page: Page) => page.locator('[data-pg-bar]');
const region = (page: Page, when: string) => page.locator(`#pg-result [data-result-when~="${when}"]`);

async function setDate(page: Page, sel: string, value: string) {
  await page.locator(sel).fill(value);
}

test.describe('pregnancy: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads task-first: empty LMP, empty result, Calculate Pregnancy Progress, no auto-calc', async ({ page }) => {
    await expect(lmp(page)).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(submit(page)).toHaveText('Calculate Pregnancy Progress');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('the LMP picker max is capped at the local today', async ({ page }) => {
    await expect(lmp(page)).toHaveAttribute('max', TODAY);
  });

  test('an ongoing LMP makes the gestational age the dominant result, with trimester + due date + progress + timeline', async ({ page }) => {
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    // Dominant = the current gestational age ("N weeks, N days"), labelled "Pregnancy progress".
    await expect(label(page)).toHaveText('Pregnancy progress');
    await expect(dominant(page)).toHaveText(/^\d+ weeks, \d+ days$/);
    // Prominent secondary: current trimester + the estimated due date (elevated, not only in the timeline).
    await expect(secondary(page)).toBeVisible();
    await expect(trimester(page)).toHaveText(/^(1st|2nd|3rd)$/);
    await expect(dueSecondary(page)).toContainText(/\d{4}/);
    await expect(progress(page)).toBeVisible();
    await expect(interp(page)).toContainText('estimated due date of');
    // Milestone timeline present and populated with real dates.
    await expect(page.locator('[data-pg-conception]')).toContainText(/\d{4}/);
    await expect(page.locator('[data-pg-second]')).toContainText(/\d{4}/);
    await expect(page.locator('[data-pg-third]')).toContainText(/\d{4}/);
    await expect(page.locator('[data-pg-due]')).toContainText(/\d{4}/);
    // Progress bar advanced past zero.
    const width = await bar(page).evaluate((el) => (el as HTMLElement).style.width);
    expect(parseFloat(width)).toBeGreaterThan(0);
    await expect(live(page)).toContainText('Pregnancy progress:');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('a same-day LMP is 0 weeks, 0 days, 1st trimester', async ({ page }) => {
    await setDate(page, '[name="lmp"]', TODAY);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('0 weeks, 0 days');
    await expect(trimester(page)).toHaveText('1st');
  });

  test('the trimester milestones are labelled by the trimester they BEGIN (never "end of trimester")', async ({ page }) => {
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    const validText = await region(page, 'valid').innerText();
    expect(validText).toContain('Second trimester begins');
    expect(validText).toContain('Third trimester begins');
    expect(validText).not.toMatch(/End of (1st|2nd|first|second) trimester/i);
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
    await expect(fieldError(page)).toContainText('Enter your last menstrual period date');
    await expect(lmp(page)).toBeFocused();
    await expect(lmp(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(lmp(page)).toHaveAttribute('aria-describedby', /pg-lmp-error/);
  });

  test('an impossible calendar date (scripted injection) is rejected, never rolled over', async ({ page }) => {
    // A native <input type="date"> may coerce an impossible value to '' before the
    // page sees it; either way the binding must NOT compute a rolled-over result.
    // The authoritative proof for the invalid-calendar path is the binding unit test.
    await page.evaluate(() => {
      const el = document.querySelector('[name="lmp"]') as HTMLInputElement;
      el.value = '2023-02-30';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(fieldError(page)).toContainText(/valid last menstrual period date|Enter your last menstrual period date/);
  });

  test('exact trimester boundaries: today−91d is 13w0d (2nd), today−189d is 27w0d (3rd)', async ({ page }) => {
    await setDate(page, '[name="lmp"]', isoOffset(-91));
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('13 weeks, 0 days');
    await expect(trimester(page)).toHaveText('2nd');
    // live-after-first: switch to the 27w0d boundary
    await setDate(page, '[name="lmp"]', isoOffset(-189));
    await page.waitForTimeout(DEBOUNCE);
    await expect(dominant(page)).toHaveText('27 weeks, 0 days');
    await expect(trimester(page)).toHaveText('3rd');
  });

  test('a historical LMP whose due date has passed makes the due date dominant, suppresses progress + secondary, notes it passed', async ({ page }) => {
    await setDate(page, '[name="lmp"]', PAST_DUE);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(label(page)).toHaveText('Estimated due date');
    await expect(dominant(page)).toContainText(/\d{4}/); // the estimated due date (a year)
    await expect(secondary(page)).toBeHidden(); // ongoing-state trimester + due secondary suppressed
    await expect(progress(page)).toBeHidden(); // no unbounded current progress
    await expect(interp(page)).toHaveText('The estimated due date has passed. Check the entered date if this is unexpected.');
    await expect(live(page)).toContainText('This estimated date has passed');
    expect(await region(page, 'valid').innerText()).not.toMatch(/\d+ weeks, \d+ days/); // no current gestational age
  });

  test('live-after-first: a valid date change recalculates, keeps focus, no scroll', async ({ page }) => {
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    const first = await dominant(page).innerText();
    const before = await page.evaluate(() => window.scrollY);
    await lmp(page).focus();
    await setDate(page, '[name="lmp"]', ANOTHER);
    await page.waitForTimeout(DEBOUNCE);
    await expect(dominant(page)).not.toHaveText(first); // gestational age shifted
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
    await expect(page.locator('[data-pg-disclaimer]')).toHaveCount(1);
    await expect(page.locator('[data-pg-disclaimer]')).toBeVisible();
    await expect(page.getByText(/not medical advice/)).toHaveCount(1);
    await expect(page.locator('#pg-live [data-pg-disclaimer]')).toHaveCount(0);
  });

  test('desktop: the dominant result is within the first viewport at 1366×768; no overflow', async ({ page }) => {
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

test.describe('pregnancy: generated embed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
  });

  test('mounts the task-first island and carries exactly one disclaimer', async ({ page }) => {
    await expect(page.locator('#pg-result')).toHaveAttribute('data-result-state', 'empty');
    await expect(page.locator('[data-pg-submit]')).toHaveText('Calculate Pregnancy Progress');
    await expect(page.locator('[data-pg-disclaimer]')).toHaveCount(1);
    await expect(page.locator('[data-pg-disclaimer]')).toBeVisible();
  });

  test('calculates pregnancy progress on explicit submit', async ({ page }) => {
    await page.locator('[name="lmp"]').fill(ONGOING);
    await page.locator('[data-pg-submit]').click();
    await expect(page.locator('#pg-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#pg-result [data-result-value]')).toHaveText(/^\d+ weeks, \d+ days$/);
  });
});
