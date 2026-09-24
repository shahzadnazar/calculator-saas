import { test, expect, type Page } from '@playwright/test';

/**
 * Pregnancy — the reference's five dating methods (Due Date, Last Period, Ultrasound,
 * Conception Date, IVF Transfer Date). Task-first: every field starts empty, the visitor
 * presses "Calculate Pregnancy Progress" for the first result (live-after-first after).
 *
 * The form opens on Due Date, so the block below — which exercises the LMP route and the
 * behaviour shared by every route — selects Last Period first. The five methods, and the
 * default state, are covered in their own block at the end. The DOMINANT
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

/** The form opens on Due Date; the LMP block below asks for Last Period first. */
async function pickMethod(page: Page, method: string) {
  await page.locator(`[name="method"][value="${method}"]`).check();
}

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

/** The compact form the schedule and the secondary due date render in. */
function shortOf(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

test.describe('pregnancy: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await pickMethod(page, 'lmp');
  });

  test('loads task-first: empty LMP, Calculate Pregnancy Progress, no auto-calc', async ({ page }) => {
    // The labelled example is on screen at load (asserted on the untouched form in the
    // five-methods block); choosing a dating method is an interaction, so by here it has
    // already stepped aside — leaving an EMPTY result, never a calculated one.
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
    // Schedule present and populated with real dates.
    for (const key of ['lmp', 'conception', 'trimester-2', 'trimester-3', 'full-term', 'due']) {
      await expect(page.locator(`#pg-result [data-pg-row="${key}"] [data-pg-row-date]`)).toContainText(/\d{4}/);
    }
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
    await expect(fieldError(page)).toContainText('Enter the first day of your last menstrual period');
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
    await expect(fieldError(page)).toContainText(/valid last menstrual period date|Enter the first day of your last menstrual period/);
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
    await pickMethod(page, 'lmp');
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
    await expect(page.locator('#pg-result')).toHaveAttribute('data-result-state', 'example');
    await expect(page.locator('[data-pg-submit]')).toHaveText('Calculate Pregnancy Progress');
    await expect(page.locator('[data-pg-disclaimer]')).toHaveCount(1);
    await expect(page.locator('[data-pg-disclaimer]')).toBeVisible();
  });

  test('calculates pregnancy progress on explicit submit', async ({ page }) => {
    await pickMethod(page, 'lmp');
    await page.locator('[name="lmp"]').fill(ONGOING);
    await page.locator('[data-pg-submit]').click();
    await expect(page.locator('#pg-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#pg-result [data-result-value]')).toHaveText(/^\d+ weeks, \d+ days$/);
  });
});

/* ---- The five dating methods --------------------------------------------- */

test.describe('the five dating methods', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  const iso = isoOffset;
  const row = (page: Page, key: string) => page.locator(`#pg-result [data-pg-row="${key}"]`);

  test('offers the reference’s five, defaulting to Due Date', async ({ page }) => {
    const labels = await page.locator('.pg-radios label').allTextContents();
    expect(labels.map((l) => l.trim())).toEqual([
      'Due Date',
      'Last Period',
      'Ultrasound',
      'Conception Date',
      'IVF Transfer Date',
    ]);
    await expect(page.locator('[name="method"][value="due"]')).toBeChecked();
    await expect(page.locator('[name="dueDate"]')).toBeVisible();
    await expect(page.locator('[name="lmp"]')).toBeHidden();
    // The untouched form carries the labelled example and calculates nothing on its own.
    await expect(page.locator('[name="dueDate"]')).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  });

  test('shows only the chosen method’s fields, and empties the ones it hides', async ({ page }) => {
    await page.locator('[name="dueDate"]').fill(iso(140));
    await pickMethod(page, 'ultrasound');
    await expect(page.locator('[name="dueDate"]')).toBeHidden();
    await expect(page.locator('[name="dueDate"]')).toHaveValue('');
    await expect(page.locator('[name="scanDate"]')).toBeVisible();
    await expect(page.locator('[name="scanWeeks"]')).toBeVisible();
  });

  test('all five reach a result, and the note says how certain each is', async ({ page }) => {
    const note = page.locator('[data-pg-method-note]');
    await expect(note).toContainText('works the whole schedule backwards');
    await page.locator('[name="dueDate"]').fill(iso(140));
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');

    await pickMethod(page, 'lmp');
    await expect(note).toContainText('Naegele');
    await page.locator('[name="lmp"]').fill(iso(-100));
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');

    await pickMethod(page, 'ultrasound');
    await expect(note).toContainText('measures the pregnancy');
    await page.locator('[name="scanDate"]').fill(iso(-7));
    await page.locator('[name="scanWeeks"]').fill('9');
    await page.locator('[name="scanDays"]').fill('0');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');

    await pickMethod(page, 'conception');
    await expect(note).toContainText('266 days');
    await page.locator('[name="conception"]').fill(iso(-56));
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');

    await pickMethod(page, 'ivf');
    await expect(note).toContainText('known exactly');
    await page.locator('[name="transferDate"]').fill(iso(-40));
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('the interpretation names the route the visitor actually took', async ({ page }) => {
    await page.locator('[name="dueDate"]').fill(iso(140));
    await submit(page).click();
    await expect(interp(page)).toContainText('From the due date you entered');
    await expect(interp(page)).not.toContainText('last menstrual period');

    await pickMethod(page, 'lmp');
    await page.locator('[name="lmp"]').fill(iso(-100));
    await submit(page).click();
    await expect(interp(page)).toContainText('Based on the entered last menstrual period');

    await pickMethod(page, 'ivf');
    await page.locator('[name="transferDate"]').fill(iso(-40));
    await submit(page).click();
    await expect(interp(page)).toContainText('Based on the IVF transfer date you entered');
  });

  test('a due date of today + 140 days is exactly 20 weeks along', async ({ page }) => {
    await page.locator('[name="dueDate"]').fill(iso(140));
    await submit(page).click();
    await expect(dominant(page)).toHaveText('20 weeks, 0 days');
    await expect(trimester(page)).toHaveText('2nd');
    await expect(dueSecondary(page)).toHaveText(shortOf(iso(140)));
  });

  test('the due date route agrees with the last-period route that implies it', async ({ page }) => {
    await pickMethod(page, 'lmp');
    await page.locator('[name="lmp"]').fill(iso(-100));
    await submit(page).click();
    const viaLmp = await dominant(page).innerText();
    const dueViaLmp = await row(page, 'due').locator('[data-pg-row-date]').innerText();

    await pickMethod(page, 'due');
    await page.locator('[name="dueDate"]').fill(iso(180)); // -100 + 280
    await page.waitForTimeout(DEBOUNCE);
    await expect(dominant(page)).toHaveText(viaLmp);
    await expect(row(page, 'due').locator('[data-pg-row-date]')).toHaveText(dueViaLmp);
  });

  test('a due date further out than 40 weeks is rejected — that is a period yet to happen', async ({ page }) => {
    await page.locator('[name="dueDate"]').fill(iso(281));
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="dueDate"]')).toContainText('within the next 40 weeks');
    await expect(page.locator('[name="dueDate"]')).toBeFocused();
  });

  test('a due date exactly 40 weeks out is accepted, at 0w 0d', async ({ page }) => {
    await page.locator('[name="dueDate"]').fill(iso(280));
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('0 weeks, 0 days');
  });

  test('a 3-day transfer is two days behind a 5-day one', async ({ page }) => {
    await pickMethod(page, 'ivf');
    await page.locator('[name="transferDate"]').fill(iso(-40));
    await page.selectOption('[name="embryoAge"]', '5');
    await submit(page).click();
    const day5 = await row(page, 'due').locator('[data-pg-row-date]').innerText();
    await page.selectOption('[name="embryoAge"]', '3');
    await page.waitForTimeout(DEBOUNCE);
    const day3 = await row(page, 'due').locator('[data-pg-row-date]').innerText();
    expect(Date.parse(day3) - Date.parse(day5)).toBe(2 * 86_400_000);
  });

  test('cycle length shifts the whole schedule day for day', async ({ page }) => {
    await pickMethod(page, 'lmp');
    await page.locator('[name="lmp"]').fill(iso(-100));
    await submit(page).click();
    const at28 = await row(page, 'due').locator('[data-pg-row-date]').innerText();
    await page.locator('[name="cycleDays"]').fill('35');
    await page.waitForTimeout(DEBOUNCE);
    const at35 = await row(page, 'due').locator('[data-pg-row-date]').innerText();
    expect(Date.parse(at35) - Date.parse(at28)).toBe(7 * 86_400_000);
  });

  test('validation asks only for the chosen method’s fields', async ({ page }) => {
    await pickMethod(page, 'ivf');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="transferDate"]')).toBeVisible();
    await expect(page.locator('[data-error-for="dueDate"]')).toBeHidden();
    await expect(page.locator('[data-error-for="lmp"]')).toBeHidden();
  });

  test('Reset brings the Due Date fields back, not just the radio', async ({ page }) => {
    await pickMethod(page, 'ivf');
    await page.locator('[name="transferDate"]').fill(iso(-40));
    await submit(page).click();
    await page.click('[data-reset]');
    await expect(page.locator('[name="method"][value="due"]')).toBeChecked();
    await expect(page.locator('[name="dueDate"]')).toBeVisible();
    await expect(page.locator('[name="dueDate"]')).toHaveValue('');
    await expect(page.locator('[name="transferDate"]')).toBeHidden();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });
});

/* ---- The schedule --------------------------------------------------------- */

test.describe('the pregnancy schedule', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await pickMethod(page, 'lmp');
  });

  const visibleRows = (page: Page) =>
    page.locator('#pg-result .pg-schedule tbody tr:not([hidden])');

  test('lists the pregnancy from the last period to the due date, with today in place', async ({ page }) => {
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    await expect(visibleRows(page).locator('th')).toHaveText([
      'Last menstrual period',
      'Estimated conception',
      'Second trimester begins',
      'Today',
      'Third trimester begins',
      'Full term begins',
      'Estimated due date',
    ]);
    const dates = await visibleRows(page).locator('[data-pg-row-date]').allInnerTexts();
    expect(dates).toHaveLength(7);
    for (const d of dates) expect(Number.isNaN(Date.parse(d))).toBe(false);
    // Strictly non-decreasing, so "Today" really is in its place in the sequence.
    const ms = dates.map((d) => Date.parse(d));
    expect([...ms].sort((a, b) => a - b)).toEqual(ms);
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the Today row moves down the schedule as the pregnancy progresses', async ({ page }) => {
    await setDate(page, '[name="lmp"]', isoOffset(-40)); // past conception, before the 2nd trimester
    await submit(page).click();
    const early = await visibleRows(page).locator('th').allInnerTexts();
    expect(early.indexOf('Today')).toBe(early.indexOf('Estimated conception') + 1);

    await setDate(page, '[name="lmp"]', isoOffset(-250)); // deep in the 3rd
    await page.waitForTimeout(DEBOUNCE);
    const late = await visibleRows(page).locator('th').allInnerTexts();
    expect(late.indexOf('Today')).toBe(late.indexOf('Third trimester begins') + 1);
  });

  test('a past-due pregnancy drops the Today row rather than placing it past the end', async ({ page }) => {
    await setDate(page, '[name="lmp"]', PAST_DUE);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#pg-result [data-pg-row="today"]')).toBeHidden();
    await expect(visibleRows(page)).toHaveCount(6);
  });

  test('the gestational ages are the ones the milestones are named for', async ({ page }) => {
    await setDate(page, '[name="lmp"]', ONGOING);
    await submit(page).click();
    const ageOf = (key: string) =>
      page.locator(`#pg-result [data-pg-row="${key}"] [data-pg-row-age]`);
    await expect(ageOf('lmp')).toHaveText('0w');
    await expect(ageOf('conception')).toHaveText('2w');
    await expect(ageOf('trimester-2')).toHaveText('13w');
    await expect(ageOf('trimester-3')).toHaveText('27w');
    await expect(ageOf('full-term')).toHaveText('39w');
    await expect(ageOf('due')).toHaveText('40w');
  });
});
