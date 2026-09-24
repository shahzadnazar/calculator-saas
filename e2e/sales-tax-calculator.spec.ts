import { test, expect, type Page } from '@playwright/test';

/**
 * Sales tax — the reference's three-field solver: fill any two, the third is worked out.
 *
 * The published reference case is frozen here end to end: $100 before tax at 6.5% is $6.50
 * of tax and $106.50 after.
 */
const ROUTE = '/finance/sales-tax-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#st-result');
const primary = (page: Page) => shell(page).locator('[data-result-when~="valid"] [data-result-value]').first();
const summaryLabel = (page: Page) => shell(page).locator('[data-result-when~="valid"] [data-result-summary-label]');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate' });
const clearBtn = (page: Page) => page.getByRole('button', { name: 'Clear' });

const calc = async (page: Page, before: string, rate: string, after: string) => {
  await page.locator('[name="beforeTax"]').fill(before);
  await page.locator('[name="rate"]').fill(rate);
  await page.locator('[name="afterTax"]').fill(after);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE);
  await page.locator('[data-example-dismiss]').click();
});

/* ------------------------------------------------------------------ */
/* The three directions                                                */
/* ------------------------------------------------------------------ */

test.describe('the published reference case', () => {
  test('leaving the after-tax price blank works it out', async ({ page }) => {
    await calc(page, '100', '6.5', '');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('After Tax Price');
    await expect(primary(page)).toHaveText('$106.50');
  });

  test('reports all three figures the way the reference reports them', async ({ page }) => {
    await calc(page, '100', '6.5', '');
    await expect(shell(page).locator('[data-st-before]')).toHaveText('$100.00');
    await expect(shell(page).locator('[data-st-tax]')).toHaveText('6.50% or $6.50');
    await expect(shell(page).locator('[data-st-after]')).toHaveText('$106.50');
  });

  test('leaving the before-tax price blank works it out', async ({ page }) => {
    await calc(page, '', '6.5', '106.50');
    await expect(summaryLabel(page)).toHaveText('Before Tax Price');
    await expect(primary(page)).toHaveText('$100.00');
    await expect(shell(page).locator('[data-st-tax]')).toHaveText('6.50% or $6.50');
  });

  test('leaving the rate blank works it out', async ({ page }) => {
    await calc(page, '100', '', '106.50');
    await expect(summaryLabel(page)).toHaveText('Sales Tax Rate');
    await expect(primary(page)).toHaveText('6.50%');
    await expect(shell(page).locator('[data-st-tax]')).toHaveText('6.50% or $6.50');
  });

  test('the three directions agree with one another', async ({ page }) => {
    await calc(page, '100', '6.5', '');
    const after = await shell(page).locator('[data-st-after]').innerText();
    await calc(page, '', '6.5', after.replace(/[$,]/g, ''));
    await expect(shell(page).locator('[data-st-before]')).toHaveText('$100.00');
  });
});

/* ------------------------------------------------------------------ */
/* The field set                                                       */
/* ------------------------------------------------------------------ */

test.describe('the field set', () => {
  test('names the three fields as the reference names them', async ({ page }) => {
    await expect(page.getByLabel('Before Tax Price')).toBeVisible();
    await expect(page.getByLabel('Sales Tax Rate')).toBeVisible();
    await expect(page.getByLabel('After Tax Price')).toBeVisible();
  });

  test('all three start blank, with no mode to choose', async ({ page }) => {
    for (const n of ['beforeTax', 'rate', 'afterTax']) {
      await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="mode"]')).toHaveCount(0);
  });

  test('offers one primary action and a reset', async ({ page }) => {
    await expect(submit(page)).toBeVisible();
    await expect(clearBtn(page)).toBeVisible();
  });

  test('the solved field is left for the visitor to keep, not filled in', async ({ page }) => {
    await calc(page, '100', '6.5', '');
    await expect(page.locator('[name="afterTax"]')).toHaveValue('');
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

test.describe('validation', () => {
  test('asks for two when only one is given', async ({ page }) => {
    await calc(page, '100', '', '');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('asks for a blank when all three are given', async ({ page }) => {
    await calc(page, '100', '6.5', '106.50');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('rejects a negative price', async ({ page }) => {
    await calc(page, '-5', '6.5', '');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="beforeTax"]')).toBeVisible();
  });

  test('rejects a rate at the -100% cliff', async ({ page }) => {
    await calc(page, '100', '-100', '');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="rate"]')).toBeVisible();
  });

  test('will not look for a rate against a zero price', async ({ page }) => {
    await calc(page, '0', '', '10');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="beforeTax"]')).toBeVisible();
  });

  test('a zero price is otherwise a real entry', async ({ page }) => {
    await calc(page, '0', '6.5', '');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$0.00');
  });

  test('a negative rate is a discount, not an error', async ({ page }) => {
    await calc(page, '100', '-10', '');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$90.00');
  });
});

/* ------------------------------------------------------------------ */
/* Behaviour and doctrine                                              */
/* ------------------------------------------------------------------ */

test.describe('behaviour and doctrine', () => {
  test('does not calculate before the first submission', async ({ page }) => {
    await page.locator('[name="beforeTax"]').fill('100');
    await page.locator('[name="rate"]').fill('6.5');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).not.toHaveAttribute('data-result-state', 'valid');
  });

  test('updates live after the first calculation', async ({ page }) => {
    await calc(page, '100', '6.5', '');
    await page.locator('[name="beforeTax"]').fill('200');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$213.00');
  });

  test('Clear empties all three and returns the panel to empty', async ({ page }) => {
    await calc(page, '100', '6.5', '');
    await clearBtn(page).click();
    for (const n of ['beforeTax', 'rate', 'afterTax']) {
      await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
    }
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('no stale figure survives leaving the valid state', async ({ page }) => {
    await calc(page, '100', '6.5', '');
    await page.locator('[name="afterTax"]').fill('106.50');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(shell(page).locator('[data-st-after]')).toHaveText('—');
  });

  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    await calc(page, '100', '-100', '');
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('announces the result politely', async ({ page }) => {
    await expect(page.locator('#st-live')).toHaveAttribute('aria-live', 'polite');
    await calc(page, '100', '6.5', '');
    await expect(page.locator('#st-live')).toContainText('106');
  });

  test('is operable from the keyboard', async ({ page }) => {
    await page.locator('[name="beforeTax"]').fill('100');
    await page.locator('[name="rate"]').fill('6.5');
    await page.locator('[name="rate"]').press('Enter');
    await expect(primary(page)).toHaveText('$106.50');
  });

  test('every control clears 44px', async ({ page }) => {
    const small = await page.evaluate(
      () =>
        [...document.querySelectorAll('form[data-form] button, form[data-form] input')]
          .filter((e) => e.getBoundingClientRect().height < 44).length,
    );
    expect(small).toBe(0);
  });

  test('mobile does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await calc(page, '100', '6.5', '');
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(doc).toBeLessThanOrEqual(win);
  });

  test('the generated embed mounts the same island', async ({ page }) => {
    await page.goto('/embed/finance/sales-tax-calculator');
    await page.locator('[data-example-dismiss]').click();
    await calc(page, '100', '6.5', '');
    await expect(page.locator('[data-st-after]')).toHaveText('$106.50');
  });
});
