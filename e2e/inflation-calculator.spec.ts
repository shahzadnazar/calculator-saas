import { test, expect, type Page } from '@playwright/test';

/**
 * Inflation — THREE independent calculators on one page, each on the equation runtime:
 * the CPI-data calculator (the primary tool, and the only one with a chart) plus the
 * forward and backward flat-rate pair.
 *
 * The published reference case is frozen here end to end: $100 of 2016 (Average) buying
 * power is $139.13 in July 2026, a 39.13% total rise and 3.36% a year, from a CPI of
 * 240.007 to 333.918. The flat-rate pair is frozen at $134.39 and $74.41.
 */
const ROUTE = '/finance/inflation-calculator';
const DEBOUNCE = 300;

const form = (page: Page, kind: 'cpi' | 'forward' | 'backward') =>
  page.locator(`form[data-equation="${kind}"]`);
const shell = (page: Page, kind: 'cpi' | 'forward' | 'backward') =>
  form(page, kind).locator('[data-result-shell]');
const primary = (page: Page, kind: 'cpi' | 'forward' | 'backward') =>
  form(page, kind).locator('[data-result-when~="valid"] [data-result-value]').first();
const calcBtn = (page: Page, kind: 'cpi' | 'forward' | 'backward') =>
  form(page, kind).getByRole('button', { name: 'Calculate' });
const clearBtn = (page: Page, kind: 'cpi' | 'forward' | 'backward') =>
  form(page, kind).getByRole('button', { name: 'Clear' });

const calcFlat = async (page: Page, kind: 'forward' | 'backward', amount = '100', rate = '3', years = '10') => {
  const f = form(page, kind);
  await f.locator('[name="amount"]').fill(amount);
  await f.locator('[name="annualRatePct"]').fill(rate);
  await f.locator('[name="years"]').fill(years);
  await calcBtn(page, kind).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE);
});

/* ------------------------------------------------------------------ */
/* The page has three calculators                                      */
/* ------------------------------------------------------------------ */

test.describe('the three calculators', () => {
  test('all three are present and named as the reference names them', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Inflation Calculator with U.S. CPI Data' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Forward Flat Rate Inflation Calculator' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Backward Flat Rate Inflation Calculator' })).toBeVisible();
    await expect(page.locator('form[data-equation]')).toHaveCount(3);
  });

  test('every panel opens on a labelled example with the visitor\'s amount blank', async ({ page }) => {
    for (const kind of ['cpi', 'forward', 'backward'] as const) {
      await expect(shell(page, kind)).toHaveAttribute('data-result-state', 'example');
      await expect(form(page, kind).locator('[name="amount"]')).toHaveValue('');
    }
  });

  test('each example can be dismissed on its own', async ({ page }) => {
    await form(page, 'forward').locator('[data-example-dismiss]').click();
    await expect(shell(page, 'forward')).toHaveAttribute('data-result-state', 'empty');
    // The other two keep theirs.
    await expect(shell(page, 'cpi')).toHaveAttribute('data-result-state', 'example');
    await expect(shell(page, 'backward')).toHaveAttribute('data-result-state', 'example');
  });

  test('the CPI example shows the published figure without the visitor asking', async ({ page }) => {
    await expect(primary(page, 'cpi')).toHaveText('$139.13');
    await expect(form(page, 'cpi').locator('[name="amount"]')).toHaveValue('');
    // An example is never announced — nobody asked for it.
    await expect(form(page, 'cpi').locator('[data-result-live]')).toHaveText('');
  });

  test('each has its own primary action and its own reset', async ({ page }) => {
    for (const kind of ['cpi', 'forward', 'backward'] as const) {
      await expect(calcBtn(page, kind)).toBeVisible();
      await expect(clearBtn(page, kind)).toBeVisible();
    }
  });

  test('calculating one leaves the other two untouched', async ({ page }) => {
    await calcFlat(page, 'forward');
    await expect(shell(page, 'forward')).toHaveAttribute('data-result-state', 'valid');
    await expect(shell(page, 'cpi')).toHaveAttribute('data-result-state', 'example');
    await expect(shell(page, 'backward')).toHaveAttribute('data-result-state', 'example');
  });

  test('resetting one leaves the others standing', async ({ page }) => {
    await calcFlat(page, 'forward');
    await calcFlat(page, 'backward');
    await clearBtn(page, 'forward').click();
    await expect(shell(page, 'forward')).toHaveAttribute('data-result-state', 'empty');
    await expect(shell(page, 'backward')).toHaveAttribute('data-result-state', 'valid');
  });
});

/* ------------------------------------------------------------------ */
/* CPI calculator                                                      */
/* ------------------------------------------------------------------ */

test.describe('the CPI calculator', () => {
  test('opens on the reference span', async ({ page }) => {
    const f = form(page, 'cpi');
    await expect(f.locator('[name="fromMonth"]')).toHaveValue('average');
    await expect(f.locator('[name="fromYear"]')).toHaveValue('2016');
    await expect(f.locator('[name="toMonth"]')).toHaveValue('7');
    await expect(f.locator('[name="toYear"]')).toHaveValue('2026');
  });

  test('reproduces the published result', async ({ page }) => {
    await form(page, 'cpi').locator('[name="amount"]').fill('100');
    await calcBtn(page, 'cpi').click();
    await expect(shell(page, 'cpi')).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page, 'cpi')).toHaveText('$139.13');
    await expect(form(page, 'cpi').locator('[data-cpi-headline]')).toHaveText(
      '$139.13 in Jul. 2026 equals $100 of buying power in 2016 (Average).',
    );
    await expect(form(page, 'cpi').locator('[data-cpi-rates]')).toHaveText(
      'The total inflation rate from 2016 (Average) to Jul. 2026 is 39.13%. The average inflation rate is 3.36% per year.',
    );
    await expect(form(page, 'cpi').locator('[data-cpi-indexes]')).toHaveText(
      'The CPI of 2016 (Average) is 240.007 and the CPI of Jul. 2026 is 333.918.',
    );
  });

  test('draws the purchasing-power chart on the axis the reference uses', async ({ page }) => {
    await form(page, 'cpi').locator('[name="amount"]').fill('100');
    await calcBtn(page, 'cpi').click();
    const figure = form(page, 'cpi').locator('[data-cpi-figure]');
    await expect(figure).toBeVisible();
    await expect(figure.locator('[data-cpi-chart-title]')).toHaveText(
      'Purchasing power of $100 in 2016 (Average) over time: 2016 (Average)–Jul. 2026',
    );
    // $100 to $140 in tens, with the round years marked, plus the axis title.
    const labels = await figure.locator('svg text').allTextContents();
    expect(labels).toEqual(['$100', '$110', '$120', '$130', '$140', '2020', '2025', 'Year']);
    // One point a month across the decade, less the month never published.
    const points = await figure.locator('svg polyline').getAttribute('points');
    expect(points!.trim().split(/\s+/)).toHaveLength(120);
  });

  test('the chart is labelled for readers who cannot see it', async ({ page }) => {
    await form(page, 'cpi').locator('[name="amount"]').fill('100');
    await calcBtn(page, 'cpi').click();
    const svg = form(page, 'cpi').locator('[data-cpi-chart] svg');
    await expect(svg).toHaveAttribute('role', 'img');
    await expect(svg).toHaveAttribute('aria-label', /Purchasing power of \$100/);
  });

  test('converts between two ordinary months', async ({ page }) => {
    const f = form(page, 'cpi');
    await f.locator('[name="amount"]').fill('100');
    await f.locator('[name="fromMonth"]').selectOption('1');
    await f.locator('[name="fromYear"]').selectOption('2000');
    await calcBtn(page, 'cpi').click();
    await expect(shell(page, 'cpi')).toHaveAttribute('data-result-state', 'valid');
    await expect(f.locator('[data-cpi-headline]')).toContainText('of buying power in Jan. 2000.');
  });

  test('reads backwards too', async ({ page }) => {
    const f = form(page, 'cpi');
    await f.locator('[name="amount"]').fill('100');
    await f.locator('[name="fromMonth"]').selectOption('7');
    await f.locator('[name="fromYear"]').selectOption('2026');
    await f.locator('[name="toMonth"]').selectOption('7');
    await f.locator('[name="toYear"]').selectOption('2016');
    await calcBtn(page, 'cpi').click();
    await expect(primary(page, 'cpi')).toHaveText('$72.06');
  });

  test('updates live after the first calculation', async ({ page }) => {
    const f = form(page, 'cpi');
    await f.locator('[name="amount"]').fill('100');
    await calcBtn(page, 'cpi').click();
    await expect(primary(page, 'cpi')).toHaveText('$139.13');
    await f.locator('[name="amount"]').fill('200');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page, 'cpi')).toHaveText('$278.26');
  });

  test('Clear empties the amount and returns the panel to empty', async ({ page }) => {
    const f = form(page, 'cpi');
    await f.locator('[name="amount"]').fill('100');
    await calcBtn(page, 'cpi').click();
    await clearBtn(page, 'cpi').click();
    await expect(f.locator('[name="amount"]')).toHaveValue('');
    await expect(shell(page, 'cpi')).toHaveAttribute('data-result-state', 'empty');
    await expect(f.locator('[name="fromYear"]')).toHaveValue('2016');
  });

  test('refuses to calculate without an amount', async ({ page }) => {
    await calcBtn(page, 'cpi').click();
    await expect(shell(page, 'cpi')).toHaveAttribute('data-result-state', 'invalid');
    await expect(form(page, 'cpi').locator('[data-error-for="amount"]')).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/* Gaps in the published data                                          */
/* ------------------------------------------------------------------ */

test.describe('months the Bureau never published', () => {
  test('October 2025 cannot be chosen', async ({ page }) => {
    await form(page, 'cpi').locator('[name="fromYear"]').selectOption('2025');
    await expect(form(page, 'cpi').locator('[name="fromMonth"] option[value="10"]')).toBeDisabled();
  });

  test('2025 offers no annual average, because it lost a month', async ({ page }) => {
    await form(page, 'cpi').locator('[name="fromYear"]').selectOption('2025');
    await expect(form(page, 'cpi').locator('[name="fromMonth"] option[value="average"]')).toBeDisabled();
  });

  test('a year still in progress offers neither an average nor unreleased months', async ({ page }) => {
    const f = form(page, 'cpi');
    await f.locator('[name="fromYear"]').selectOption('2026');
    await expect(f.locator('[name="fromMonth"] option[value="average"]')).toBeDisabled();
    await expect(f.locator('[name="fromMonth"] option[value="12"]')).toBeDisabled();
    await expect(f.locator('[name="fromMonth"] option[value="7"]')).toBeEnabled();
  });

  test('a disabled month is never left selected', async ({ page }) => {
    const f = form(page, 'cpi');
    // Pick December in a year that has one, then move to a year that does not.
    await f.locator('[name="toYear"]').selectOption('2020');
    await f.locator('[name="toMonth"]').selectOption('12');
    await expect(f.locator('[name="toMonth"]')).toHaveValue('12');
    await f.locator('[name="toYear"]').selectOption('2026');
    // December 2026 has not been published, so the select falls back to the last real month.
    await expect(f.locator('[name="toMonth"]')).toHaveValue('7');
  });
});

/* ------------------------------------------------------------------ */
/* Flat-rate pair                                                      */
/* ------------------------------------------------------------------ */

test.describe('the flat-rate pair', () => {
  test('forward gives the published figure', async ({ page }) => {
    await calcFlat(page, 'forward');
    await expect(primary(page, 'forward')).toHaveText('$134.39');
    await expect(form(page, 'forward').locator('[data-flat-sentence]')).toContainText(
      'has the same buying power as $134.39 in 10 years',
    );
  });

  test('backward gives the published figure', async ({ page }) => {
    await calcFlat(page, 'backward');
    await expect(primary(page, 'backward')).toHaveText('$74.41');
    await expect(form(page, 'backward').locator('[data-flat-sentence]')).toContainText(
      'had the same buying power as $74.41 10 years ago',
    );
  });

  test('a negative rate is deflation, not an error', async ({ page }) => {
    await calcFlat(page, 'forward', '100', '-2', '10');
    await expect(shell(page, 'forward')).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page, 'forward')).toHaveText('$81.71');
  });

  test('a rate at the -100% cliff is refused', async ({ page }) => {
    await calcFlat(page, 'forward', '100', '-100', '10');
    await expect(shell(page, 'forward')).toHaveAttribute('data-result-state', 'invalid');
    await expect(form(page, 'forward').locator('[data-error-for="annualRatePct"]')).toBeVisible();
  });

  test('updates live after the first calculation', async ({ page }) => {
    await calcFlat(page, 'forward');
    await form(page, 'forward').locator('[name="years"]').fill('20');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page, 'forward')).toHaveText('$180.61');
  });

  test('Clear empties every field', async ({ page }) => {
    await calcFlat(page, 'backward');
    await clearBtn(page, 'backward').click();
    const f = form(page, 'backward');
    for (const n of ['amount', 'annualRatePct', 'years']) {
      await expect(f.locator(`[name="${n}"]`)).toHaveValue('');
    }
    await expect(shell(page, 'backward')).toHaveAttribute('data-result-state', 'empty');
  });
});

/* ------------------------------------------------------------------ */
/* Doctrine                                                            */
/* ------------------------------------------------------------------ */

test.describe('doctrine', () => {
  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    await calcFlat(page, 'forward', '100', '500', '5000');
    await expect(shell(page, 'forward')).toHaveAttribute('data-result-state', 'invalid');
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('announces a result once, politely', async ({ page }) => {
    await calcFlat(page, 'forward');
    const live = form(page, 'forward').locator('[data-result-live], [aria-live]').first();
    await expect(live).toHaveAttribute('aria-live', 'polite');
  });

  test('is operable from the keyboard', async ({ page }) => {
    const f = form(page, 'forward');
    await f.locator('[name="amount"]').fill('100');
    await f.locator('[name="annualRatePct"]').fill('3');
    await f.locator('[name="years"]').fill('10');
    await f.locator('[name="years"]').press('Enter');
    await expect(primary(page, 'forward')).toHaveText('$134.39');
  });

  test('every control clears 44px', async ({ page }) => {
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('form[data-equation] button, form[data-equation] select, form[data-equation] input')]
        .filter((e) => e.getBoundingClientRect().height < 44).length,
    );
    expect(small).toBe(0);
  });

  test('does not scroll sideways on a narrow phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await form(page, 'cpi').locator('[name="amount"]').fill('100');
    await calcBtn(page, 'cpi').click();
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(doc).toBeLessThanOrEqual(win);
  });

  test('the embed route renders the island', async ({ page }) => {
    await page.goto('/embed/finance/inflation-calculator');
    await expect(page.locator('form[data-equation="cpi"]')).toBeVisible();
  });
});
