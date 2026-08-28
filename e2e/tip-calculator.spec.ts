import { test, expect, type Page } from '@playwright/test';

/**
 * Tip — TWO independent calculators on one page: the tip table, and the shared bill.
 *
 * Both published reference cases are frozen here on a $55 bill: the ten-row table, and the
 * shared bill at 15% split one way, which is $8.25 of tip and $63.25 in all.
 */
const ROUTE = '/finance/tip-calculator';
const DEBOUNCE = 300;

type Kind = 'quick' | 'shared';
const form = (page: Page, kind: Kind) => page.locator(`form[data-equation="${kind}"]`);
const shell = (page: Page, kind: Kind) => form(page, kind).locator('[data-result-shell]');
const primary = (page: Page, kind: Kind) =>
  form(page, kind).locator('[data-result-when~="valid"] [data-result-value]').first();
const summaryLabel = (page: Page, kind: Kind) =>
  form(page, kind).locator('[data-result-when~="valid"] [data-result-summary-label]');
const calcBtn = (page: Page, kind: Kind) => form(page, kind).getByRole('button', { name: 'Calculate' });
const clearBtn = (page: Page, kind: Kind) => form(page, kind).getByRole('button', { name: 'Clear' });

/** The published tip table for $55. */
const TABLE: [number, string, string][] = [
  [5, '$2.75', '$57.75'],
  [10, '$5.50', '$60.50'],
  [12, '$6.60', '$61.60'],
  [14, '$7.70', '$62.70'],
  [15, '$8.25', '$63.25'],
  [18, '$9.90', '$64.90'],
  [20, '$11.00', '$66.00'],
  [25, '$13.75', '$68.75'],
  [30, '$16.50', '$71.50'],
  [50, '$27.50', '$82.50'],
];

const calcQuick = async (page: Page, price = '55') => {
  await form(page, 'quick').locator('[data-example-dismiss]').click();
  await form(page, 'quick').locator('[name="price"]').fill(price);
  await calcBtn(page, 'quick').click();
};

const calcShared = async (page: Page, price = '55', tip = '15', people = '1') => {
  const f = form(page, 'shared');
  await f.locator('[data-example-dismiss]').click();
  await f.locator('[name="price"]').fill(price);
  await f.locator('[name="tipPct"]').fill(tip);
  await f.locator('[name="people"]').fill(people);
  await calcBtn(page, 'shared').click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE);
});

/* ------------------------------------------------------------------ */
/* Two calculators                                                     */
/* ------------------------------------------------------------------ */

test.describe('the two calculators', () => {
  test('both are present and named as the reference names them', async ({ page }) => {
    // Scoped to each form's own title: the page's H1 is "Tip Calculator" too, and the
    // result panel carries headings of its own.
    await expect(form(page, 'quick').locator('h2.tpeq-q')).toHaveText('Tip Calculator');
    await expect(form(page, 'shared').locator('h2.tpeq-q')).toHaveText('Shared Bill Tip Calculator');
    await expect(page.locator('form[data-equation]')).toHaveCount(2);
  });

  test('both open on a labelled example with the price blank', async ({ page }) => {
    for (const kind of ['quick', 'shared'] as const) {
      await expect(shell(page, kind)).toHaveAttribute('data-result-state', 'example');
      await expect(form(page, kind).locator('[name="price"]')).toHaveValue('');
    }
  });

  test('calculating one leaves the other untouched', async ({ page }) => {
    await calcQuick(page);
    await expect(shell(page, 'quick')).toHaveAttribute('data-result-state', 'valid');
    await expect(shell(page, 'shared')).toHaveAttribute('data-result-state', 'example');
  });

  test('clearing one leaves the other standing', async ({ page }) => {
    await calcQuick(page);
    await calcShared(page);
    await clearBtn(page, 'quick').click();
    await expect(shell(page, 'quick')).toHaveAttribute('data-result-state', 'empty');
    await expect(shell(page, 'shared')).toHaveAttribute('data-result-state', 'valid');
  });
});

/* ------------------------------------------------------------------ */
/* The tip table                                                       */
/* ------------------------------------------------------------------ */

test.describe('the tip table', () => {
  test('names its one field Price', async ({ page }) => {
    await expect(form(page, 'quick').getByLabel('Price')).toBeVisible();
  });

  test('reproduces every row of the published table', async ({ page }) => {
    await calcQuick(page);
    await expect(shell(page, 'quick')).toHaveAttribute('data-result-state', 'valid');
    for (const [pct, tip, total] of TABLE) {
      await expect(form(page, 'quick').locator(`[data-tip-amount="${pct}"]`)).toHaveText(tip);
      await expect(form(page, 'quick').locator(`[data-tip-total="${pct}"]`)).toHaveText(total);
    }
  });

  test('heads the three columns the way the reference does', async ({ page }) => {
    const heads = await form(page, 'quick').locator('table thead th').allTextContents();
    expect(heads.map((h) => h.trim())).toEqual(['Tip %', 'Tip Amount', 'Total']);
  });

  test('leads with the customary rate and marks it in words, not colour alone', async ({ page }) => {
    await calcQuick(page);
    await expect(summaryLabel(page, 'quick')).toHaveText('Total at 15%');
    await expect(primary(page, 'quick')).toHaveText('$63.25');
    await expect(form(page, 'quick').locator('.tpeq-row--customary')).toContainText('typical');
  });

  test('updates live after the first calculation', async ({ page }) => {
    await calcQuick(page);
    await form(page, 'quick').locator('[name="price"]').fill('100');
    await page.waitForTimeout(DEBOUNCE);
    await expect(form(page, 'quick').locator('[data-tip-total="20"]')).toHaveText('$120.00');
  });

  test('a zero price is a real table of zeros', async ({ page }) => {
    await calcQuick(page, '0');
    await expect(shell(page, 'quick')).toHaveAttribute('data-result-state', 'valid');
    await expect(form(page, 'quick').locator('[data-tip-amount="15"]')).toHaveText('$0.00');
  });

  test('refuses to calculate without a price', async ({ page }) => {
    await form(page, 'quick').locator('[data-example-dismiss]').click();
    await calcBtn(page, 'quick').click();
    await expect(shell(page, 'quick')).toHaveAttribute('data-result-state', 'invalid');
    await expect(form(page, 'quick').locator('[data-error-for="price"]')).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/* The shared bill                                                     */
/* ------------------------------------------------------------------ */

test.describe('the shared bill', () => {
  test('names its three fields as the reference names them', async ({ page }) => {
    const f = form(page, 'shared');
    await expect(f.getByLabel('Price')).toBeVisible();
    await expect(f.getByLabel('Tip %')).toBeVisible();
    await expect(f.getByLabel('Number of People')).toBeVisible();
  });

  test('ships the documented defaults: 15% and one person', async ({ page }) => {
    await expect(form(page, 'shared').locator('[name="tipPct"]')).toHaveValue('15');
    await expect(form(page, 'shared').locator('[name="people"]')).toHaveValue('1');
  });

  test('lays the fields out two to a row', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    const f = form(page, 'shared');
    const price = await f.locator('[name="price"]').boundingBox();
    const tip = await f.locator('[name="tipPct"]').boundingBox();
    expect(Math.abs(price!.y - tip!.y)).toBeLessThan(4);
    expect(tip!.x).toBeGreaterThan(price!.x + price!.width - 1);
  });

  test('reproduces the published case', async ({ page }) => {
    await calcShared(page);
    await expect(shell(page, 'shared')).toHaveAttribute('data-result-state', 'valid');
    await expect(form(page, 'shared').locator('[data-shared-tip]')).toHaveText('$8.25');
    await expect(form(page, 'shared').locator('[data-shared-total]')).toHaveText('$63.25');
    await expect(primary(page, 'shared')).toHaveText('$63.25');
  });

  test('labels the two lines Tip and Total Amount for one person', async ({ page }) => {
    await calcShared(page);
    await expect(form(page, 'shared').locator('[data-shared-tip-label]')).toHaveText('Tip');
    await expect(form(page, 'shared').locator('[data-shared-total-label]')).toHaveText('Total Amount');
    await expect(form(page, 'shared').locator('[data-shared-whole]')).toBeHidden();
  });

  test('splits between people and says so', async ({ page }) => {
    await calcShared(page, '55', '15', '4');
    await expect(form(page, 'shared').locator('[data-shared-tip-label]')).toHaveText('Tip per Person');
    await expect(form(page, 'shared').locator('[data-shared-tip]')).toHaveText('$2.06');
    await expect(form(page, 'shared').locator('[data-shared-total]')).toHaveText('$15.81');
    // The whole-bill figures appear only once there is a split to explain.
    await expect(form(page, 'shared').locator('[data-shared-whole]')).toBeVisible();
    await expect(form(page, 'shared').locator('[data-shared-bill-total]')).toHaveText('$63.25');
  });

  test('a zero tip is a real answer', async ({ page }) => {
    await calcShared(page, '55', '0', '1');
    await expect(shell(page, 'shared')).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page, 'shared')).toHaveText('$55.00');
  });

  test('rejects a fractional or empty party', async ({ page }) => {
    await calcShared(page, '55', '15', '2.5');
    await expect(shell(page, 'shared')).toHaveAttribute('data-result-state', 'invalid');
    await expect(form(page, 'shared').locator('[data-error-for="people"]')).toBeVisible();
  });

  test('rejects a negative price', async ({ page }) => {
    await calcShared(page, '-5', '15', '1');
    await expect(shell(page, 'shared')).toHaveAttribute('data-result-state', 'invalid');
  });

  test('Clear empties the price and restores the defaults', async ({ page }) => {
    await calcShared(page, '99', '20', '3');
    await clearBtn(page, 'shared').click();
    const f = form(page, 'shared');
    await expect(f.locator('[name="price"]')).toHaveValue('');
    await expect(f.locator('[name="tipPct"]')).toHaveValue('15');
    await expect(f.locator('[name="people"]')).toHaveValue('1');
    await expect(shell(page, 'shared')).toHaveAttribute('data-result-state', 'empty');
  });
});

/* ------------------------------------------------------------------ */
/* Doctrine                                                            */
/* ------------------------------------------------------------------ */

test.describe('doctrine', () => {
  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    await calcShared(page, '55', '15', '0');
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('announces each result politely', async ({ page }) => {
    await expect(page.locator('#tps-live')).toHaveAttribute('aria-live', 'polite');
    await calcShared(page);
    await expect(page.locator('#tps-live')).toContainText('63');
  });

  test('is operable from the keyboard', async ({ page }) => {
    await form(page, 'quick').locator('[data-example-dismiss]').click();
    await form(page, 'quick').locator('[name="price"]').fill('55');
    await form(page, 'quick').locator('[name="price"]').press('Enter');
    await expect(primary(page, 'quick')).toHaveText('$63.25');
  });

  test('every control clears 44px', async ({ page }) => {
    const small = await page.evaluate(
      () =>
        [...document.querySelectorAll('form[data-equation] button, form[data-equation] input')]
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => e.closest('label') ?? e)
          .filter((e) => e.getBoundingClientRect().height < 44).length,
    );
    expect(small).toBe(0);
  });

  test('mobile does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await calcQuick(page);
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(doc).toBeLessThanOrEqual(win);
  });

  test('the generated embed mounts both calculators', async ({ page }) => {
    await page.goto('/embed/finance/tip-calculator');
    await expect(page.locator('form[data-equation]')).toHaveCount(2);
    await calcQuick(page);
    await expect(page.locator('[data-tip-total="15"]')).toHaveText('$63.25');
  });
});
