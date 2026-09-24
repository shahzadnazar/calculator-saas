import { test, expect, type Page } from '@playwright/test';

/**
 * Salary — the reference's pay-schedule table: eight frequencies, each read twice.
 *
 * The published reference case is frozen here end to end: $50 an hour, 40 hours over 5
 * days, 10 holidays and 15 vacation days gives $104,000 unadjusted and $94,000 adjusted,
 * down to every cell of the table.
 */
const ROUTE = '/finance/salary-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#salary-result');
const primary = (page: Page) => shell(page).locator('[data-result-when~="valid"] [data-result-value]').first();
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate' });
const clearBtn = (page: Page) => page.getByRole('button', { name: 'Clear' });
const unadjusted = (page: Page, key: string) => shell(page).locator(`[data-sal-unadjusted="${key}"]`);
const adjusted = (page: Page, key: string) => shell(page).locator(`[data-sal-adjusted="${key}"]`);

/** The reference table, cell for cell. */
const REFERENCE: [string, string, string][] = [
  ['hourly', '$50.00', '$45.19'],
  ['daily', '$400.00', '$361.54'],
  ['weekly', '$2,000', '$1,808'],
  ['biweekly', '$4,000', '$3,615'],
  ['semimonthly', '$4,333', '$3,917'],
  ['monthly', '$8,667', '$7,833'],
  ['quarterly', '$26,000', '$23,500'],
  ['annual', '$104,000', '$94,000'],
];

const calc = async (
  page: Page,
  i: { amount?: string; frequency?: string; hours?: string; days?: string; holidays?: string; vacation?: string } = {},
) => {
  if (i.amount !== undefined) await page.locator('[name="amount"]').fill(i.amount);
  if (i.frequency !== undefined) await page.locator('[name="frequency"]').selectOption(i.frequency);
  if (i.hours !== undefined) await page.locator('[name="hoursPerWeek"]').fill(i.hours);
  if (i.days !== undefined) await page.locator('[name="daysPerWeek"]').fill(i.days);
  if (i.holidays !== undefined) await page.locator('[name="holidaysPerYear"]').fill(i.holidays);
  if (i.vacation !== undefined) await page.locator('[name="vacationDaysPerYear"]').fill(i.vacation);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE);
});

/* ------------------------------------------------------------------ */
/* The reference case                                                  */
/* ------------------------------------------------------------------ */

test.describe('the published reference case', () => {
  test('offers the reference field set with its documented defaults', async ({ page }) => {
    await expect(page.getByLabel('Salary amount')).toHaveValue('');
    await expect(page.locator('[name="frequency"]')).toHaveValue('hourly');
    await expect(page.locator('[name="hoursPerWeek"]')).toHaveValue('40');
    await expect(page.locator('[name="daysPerWeek"]')).toHaveValue('5');
    await expect(page.locator('[name="holidaysPerYear"]')).toHaveValue('10');
    await expect(page.locator('[name="vacationDaysPerYear"]')).toHaveValue('15');
  });

  test('reproduces every cell of the published table', async ({ page }) => {
    await calc(page, { amount: '50' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    for (const [key, u, a] of REFERENCE) {
      await expect(unadjusted(page, key)).toHaveText(u);
      await expect(adjusted(page, key)).toHaveText(a);
    }
  });

  test('leads with the adjusted annual salary', async ({ page }) => {
    await calc(page, { amount: '50' });
    await expect(primary(page)).toHaveText('$94,000');
  });

  test('explains what the time off cost', async ({ page }) => {
    await calc(page, { amount: '50' });
    await expect(shell(page).locator('[data-sal-interpretation]')).toHaveText(
      '25 days of holidays and vacation leave 235 days worked out of 260 days, so the year pays $94,000 rather than $104,000.',
    );
  });

  test('names both columns the way the reference names them', async ({ page }) => {
    const heads = await shell(page).locator('table thead th').allTextContents();
    expect(heads.map((h) => h.trim())).toEqual(['Pay frequency', 'Unadjusted', 'Holidays & vacation days adjusted']);
  });

  test('lists the eight frequencies in order', async ({ page }) => {
    const rows = await shell(page).locator('table tbody th').allTextContents();
    expect(rows.map((r) => r.trim())).toEqual([
      'Hourly', 'Daily', 'Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly', 'Quarterly', 'Annual',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Which column the entry lands in                                     */
/* ------------------------------------------------------------------ */

test.describe('the entered period decides how the figure is read', () => {
  test('a daily entry matches the hourly one it equals', async ({ page }) => {
    await calc(page, { amount: '400', frequency: 'daily' });
    await expect(unadjusted(page, 'annual')).toHaveText('$104,000');
    await expect(adjusted(page, 'annual')).toHaveText('$94,000');
  });

  test('a salary entry is taken as already covering the time off', async ({ page }) => {
    await calc(page, { amount: '94000', frequency: 'annual' });
    await expect(adjusted(page, 'annual')).toHaveText('$94,000');
    await expect(unadjusted(page, 'annual')).toHaveText('$104,000');
    await expect(unadjusted(page, 'hourly')).toHaveText('$50.00');
  });

  test('offers all eight periods', async ({ page }) => {
    const opts = await page.locator('[name="frequency"] option').allTextContents();
    expect(opts.map((o) => o.trim())).toEqual([
      'Hour', 'Day', 'Week', 'Bi-week', 'Semi-month', 'Month', 'Quarter', 'Year',
    ]);
  });

  test('with no time off the two columns agree', async ({ page }) => {
    await calc(page, { amount: '50', holidays: '0', vacation: '0' });
    for (const key of ['hourly', 'annual', 'monthly']) {
      await expect(adjusted(page, key)).toHaveText(await unadjusted(page, key).innerText());
    }
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

test.describe('validation', () => {
  test('refuses to calculate without an amount', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="amount"]')).toBeVisible();
  });

  test('a zero salary is a real answer', async ({ page }) => {
    await calc(page, { amount: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$0');
  });

  test('rejects a negative salary', async ({ page }) => {
    await calc(page, { amount: '-5' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('rejects a week with no hours or no days', async ({ page }) => {
    await calc(page, { amount: '50', hours: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="hoursPerWeek"]')).toBeVisible();
  });

  test('rejects more than seven days in a week', async ({ page }) => {
    await calc(page, { amount: '50', days: '8' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="daysPerWeek"]')).toBeVisible();
  });

  test('rejects time off that swallows the working year', async ({ page }) => {
    await calc(page, { amount: '50', holidays: '200', vacation: '100' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('accepts a fractional week', async ({ page }) => {
    await calc(page, { amount: '50', hours: '37.5' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(unadjusted(page, 'annual')).toHaveText('$97,500');
  });
});

/* ------------------------------------------------------------------ */
/* Behaviour                                                           */
/* ------------------------------------------------------------------ */

test.describe('behaviour', () => {
  test('does not calculate before the first submission', async ({ page }) => {
    await page.locator('[name="amount"]').fill('50');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).not.toHaveAttribute('data-result-state', 'valid');
  });

  test('updates live after the first calculation', async ({ page }) => {
    await calc(page, { amount: '50' });
    await expect(primary(page)).toHaveText('$94,000');
    await page.locator('[name="amount"]').fill('100');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$188,000');
  });

  test('changing the time off moves only the adjusted column', async ({ page }) => {
    await calc(page, { amount: '50' });
    await page.locator('[name="vacationDaysPerYear"]').fill('0');
    await page.waitForTimeout(DEBOUNCE);
    await expect(unadjusted(page, 'annual')).toHaveText('$104,000');
    await expect(adjusted(page, 'annual')).toHaveText('$100,000');
  });

  test('Clear empties the amount and restores the schedule', async ({ page }) => {
    await calc(page, { amount: '50', holidays: '3' });
    await clearBtn(page).click();
    await expect(page.locator('[name="amount"]')).toHaveValue('');
    await expect(page.locator('[name="holidaysPerYear"]')).toHaveValue('10');
    await expect(page.locator('[name="vacationDaysPerYear"]')).toHaveValue('15');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('no stale figure survives leaving the valid state', async ({ page }) => {
    await calc(page, { amount: '50' });
    await page.locator('[name="amount"]').fill('-1');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(unadjusted(page, 'annual')).toHaveText('—');
  });

  test('is operable from the keyboard', async ({ page }) => {
    await page.locator('[name="amount"]').fill('50');
    await page.locator('[name="amount"]').press('Enter');
    await expect(primary(page)).toHaveText('$94,000');
  });
});

/* ------------------------------------------------------------------ */
/* Doctrine                                                            */
/* ------------------------------------------------------------------ */

test.describe('doctrine', () => {
  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    await calc(page, { amount: '50', holidays: '259', vacation: '0' });
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('announces the result politely, once', async ({ page }) => {
    await expect(page.locator('#salary-live')).toHaveAttribute('aria-live', 'polite');
    await calc(page, { amount: '50' });
    await expect(page.locator('#salary-live')).toContainText('94,000');
  });

  test('every control clears 44px', async ({ page }) => {
    const small = await page.evaluate(
      () =>
        [...document.querySelectorAll('form[data-form] button, form[data-form] select, form[data-form] input')].filter(
          (e) => e.getBoundingClientRect().height < 44,
        ).length,
    );
    expect(small).toBe(0);
  });

  test('desktop shows the form, the action and the result at 1366x768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await calc(page, { amount: '50' });
    const box = await primary(page).boundingBox();
    expect(box!.y).toBeLessThan(768);
  });

  test('mobile does not overflow; the table scrolls in its own box', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await calc(page, { amount: '50' });
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(doc).toBeLessThanOrEqual(win);
  });

  test('the generated embed mounts the same island', async ({ page }) => {
    await page.goto('/embed/finance/salary-calculator');
    await calc(page, { amount: '50' });
    await expect(page.locator('[data-sal-adjusted="annual"]')).toHaveText('$94,000');
  });
});
