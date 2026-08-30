import { test, expect, type Page } from '@playwright/test';

/**
 * VAT — the reference's four-field solver: fill any two, the other two are worked out.
 *
 * The published reference case is frozen here end to end: a net price of 1,200 at a 20% rate
 * carries 240 of VAT and comes to 1,440 gross. All six ways in must land on those same four
 * numbers.
 */
const ROUTE = '/finance/vat-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#vat-result');
const primary = (page: Page) => shell(page).locator('[data-result-when~="valid"] [data-result-value]').first();
const summaryLabel = (page: Page) => shell(page).locator('[data-result-when~="valid"] [data-result-summary-label]');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate VAT' });
const clearBtn = (page: Page) => page.getByRole('button', { name: 'Clear' });

interface Entry {
  rate?: string;
  net?: string;
  gross?: string;
  tax?: string;
}

const calc = async (page: Page, entry: Entry) => {
  for (const name of ['rate', 'net', 'gross', 'tax'] as const) {
    await page.locator(`[name="${name}"]`).fill(entry[name] ?? '');
  }
  await submit(page).click();
};

/** The four figures as the breakdown prints them. */
const figures = async (page: Page) => ({
  rate: await shell(page).locator('[data-vat-rate]').innerText(),
  net: await shell(page).locator('[data-vat-net]').innerText(),
  tax: await shell(page).locator('[data-vat-tax]').innerText(),
  gross: await shell(page).locator('[data-vat-gross]').innerText(),
});

const REFERENCE = { rate: '20%', net: '1,200.00', tax: '240.00', gross: '1,440.00' };

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE);
  await page.locator('[data-example-dismiss]').click();
});

/* ------------------------------------------------------------------ */
/* The six directions                                                  */
/* ------------------------------------------------------------------ */

test.describe('the published reference case', () => {
  const pairs: Array<[string, Entry, string]> = [
    ['rate + net price', { rate: '20', net: '1200' }, 'Gross price'],
    ['rate + gross price', { rate: '20', gross: '1440' }, 'Net price'],
    ['rate + tax amount', { rate: '20', tax: '240' }, 'Gross price'],
    ['net + gross price', { net: '1200', gross: '1440' }, 'Tax amount'],
    ['net price + tax amount', { net: '1200', tax: '240' }, 'Gross price'],
    ['gross price + tax amount', { gross: '1440', tax: '240' }, 'Net price'],
  ];

  for (const [name, entry, headline] of pairs) {
    test(`${name} reproduces all four figures`, async ({ page }) => {
      await calc(page, entry);
      await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
      await expect(summaryLabel(page)).toHaveText(headline);
      expect(await figures(page)).toEqual(REFERENCE);
    });
  }

  test('the headline is always a figure the visitor did NOT type', async ({ page }) => {
    await calc(page, { rate: '20', net: '1200' });
    await expect(summaryLabel(page)).toHaveText('Gross price');
    await expect(primary(page)).toHaveText('1,440.00');

    await calc(page, { rate: '20', gross: '1440' });
    await expect(summaryLabel(page)).toHaveText('Net price');
    await expect(primary(page)).toHaveText('1,200.00');
  });

  test('marks the two figures it worked out, in words rather than colour alone', async ({ page }) => {
    await calc(page, { rate: '20', net: '1200' });
    await expect(shell(page).locator('[data-vat-row="gross"] [data-vat-tag]')).toBeVisible();
    await expect(shell(page).locator('[data-vat-row="tax"] [data-vat-tag]')).toBeVisible();
    await expect(shell(page).locator('[data-vat-row="ratePct"] [data-vat-tag]')).toBeHidden();
    await expect(shell(page).locator('[data-vat-row="net"] [data-vat-tag]')).toBeHidden();
  });

  test('removing VAT divides rather than subtracting', async ({ page }) => {
    await calc(page, { rate: '20', gross: '1440' });
    await expect(primary(page)).toHaveText('1,200.00');
    await expect(primary(page)).not.toHaveText('1,152.00');
  });
});

/* ------------------------------------------------------------------ */
/* The field set                                                       */
/* ------------------------------------------------------------------ */

test.describe('the field set', () => {
  test('names the four fields as the reference names them', async ({ page }) => {
    await expect(page.getByLabel('VAT rate')).toBeVisible();
    await expect(page.getByLabel('Net price')).toBeVisible();
    await expect(page.getByLabel('Gross price')).toBeVisible();
    await expect(page.getByLabel('Tax amount')).toBeVisible();
  });

  test('all four start blank, with no mode to choose', async ({ page }) => {
    for (const n of ['rate', 'net', 'gross', 'tax']) {
      await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="mode"]')).toHaveCount(0);
  });

  test('offers one primary action and a reset', async ({ page }) => {
    await expect(submit(page)).toBeVisible();
    await expect(clearBtn(page)).toBeVisible();
  });

  test('the solved fields are left for the visitor to keep, not filled in', async ({ page }) => {
    await calc(page, { rate: '20', net: '1200' });
    await expect(page.locator('[name="gross"]')).toHaveValue('');
    await expect(page.locator('[name="tax"]')).toHaveValue('');
  });

  test('amounts carry no currency symbol — VAT is levied in many currencies', async ({ page }) => {
    await calc(page, { rate: '20', net: '1200' });
    const text = await shell(page).innerText();
    expect(text).not.toMatch(/[$£€]/);
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

test.describe('validation', () => {
  test('asks for two when only one is given', async ({ page }) => {
    await calc(page, { net: '1200' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('asks for two blanks when three are given', async ({ page }) => {
    await calc(page, { rate: '20', net: '1200', gross: '1440' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('rejects a gross below its own net, on the gross field', async ({ page }) => {
    await calc(page, { net: '1200', gross: '900' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="gross"]')).toBeVisible();
  });

  test('rejects a gross below the tax inside it, on the gross field', async ({ page }) => {
    await calc(page, { gross: '100', tax: '240' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="gross"]')).toBeVisible();
  });

  test('will not read a rate off a net of nothing', async ({ page }) => {
    await calc(page, { net: '0', gross: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="net"]')).toBeVisible();
  });

  test('will not recover a net price from a tax amount at a zero rate', async ({ page }) => {
    await calc(page, { rate: '0', tax: '100' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="rate"]')).toBeVisible();
  });

  test('a zero rate against a price is a real answer — zero-rated goods', async ({ page }) => {
    await calc(page, { rate: '0', net: '500' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(shell(page).locator('[data-vat-tax]')).toHaveText('0.00');
    await expect(shell(page).locator('[data-vat-gross]')).toHaveText('500.00');
  });

  test('rejects a negative rate rather than treating it as a discount', async ({ page }) => {
    await calc(page, { rate: '-5', net: '1200' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="rate"]')).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/* Behaviour and doctrine                                              */
/* ------------------------------------------------------------------ */

test.describe('behaviour and doctrine', () => {
  test('does not calculate before the first submission', async ({ page }) => {
    await page.locator('[name="rate"]').fill('20');
    await page.locator('[name="net"]').fill('1200');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).not.toHaveAttribute('data-result-state', 'valid');
  });

  test('updates live after the first calculation', async ({ page }) => {
    await calc(page, { rate: '20', net: '1200' });
    await page.locator('[name="net"]').fill('2400');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('2,880.00');
  });

  test('Clear empties all four and returns the panel to empty', async ({ page }) => {
    await calc(page, { rate: '20', net: '1200' });
    await clearBtn(page).click();
    for (const n of ['rate', 'net', 'gross', 'tax']) {
      await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
    }
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('no stale figure survives leaving the valid state', async ({ page }) => {
    await calc(page, { rate: '20', net: '1200' });
    await page.locator('[name="gross"]').fill('1440');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(shell(page).locator('[data-vat-gross]')).toHaveText('—');
    await expect(shell(page).locator('[data-vat-row="gross"] [data-vat-tag]')).toBeHidden();
  });

  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    await calc(page, { net: '0', tax: '0' });
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('announces the result politely, and once', async ({ page }) => {
    await expect(page.locator('#vat-live')).toHaveAttribute('aria-live', 'polite');
    await calc(page, { rate: '20', net: '1200' });
    await expect(page.locator('#vat-live')).toContainText('1,440');
  });

  test('is operable from the keyboard', async ({ page }) => {
    await page.locator('[name="rate"]').fill('20');
    await page.locator('[name="net"]').fill('1200');
    await page.locator('[name="net"]').press('Enter');
    await expect(primary(page)).toHaveText('1,440.00');
  });

  test('every control clears 44px', async ({ page }) => {
    const small = await page.evaluate(
      () =>
        [...document.querySelectorAll('form[data-form] button, form[data-form] input')].filter(
          (e) => e.getBoundingClientRect().height < 44,
        ).length,
    );
    expect(small).toBe(0);
  });

  test('mobile does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await calc(page, { rate: '20', net: '1200' });
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(doc).toBeLessThanOrEqual(win);
  });

  test('the generated embed mounts the same island', async ({ page }) => {
    await page.goto('/embed/finance/vat-calculator');
    await page.locator('[data-example-dismiss]').click();
    await calc(page, { rate: '20', net: '1200' });
    await expect(page.locator('[data-vat-gross]')).toHaveText('1,440.00');
  });
});
