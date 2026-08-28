import { test, expect, type Page } from '@playwright/test';

/**
 * Body fat — the reference's report and its three unit tabs.
 *
 * Both published cases are frozen here end to end: the same 25-year-old man measured
 * metrically (70 kg, 178/50/96 cm → 15.7%) and in US units (152 lb, 5'10.5", neck 1'7.5",
 * waist 3'1.5" → 15.3%), down to every row of the seven-row report.
 */
const ROUTE = '/health/body-fat-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#bf-result');
const primary = (page: Page) => shell(page).locator('[data-result-when~="valid"] [data-result-value]').first();
const row = (page: Page, key: string) => shell(page).locator(`[data-bf-row="${key}"]`);
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate' });
const clearBtn = (page: Page) => page.getByRole('button', { name: 'Clear' });

const tab = async (page: Page, value: 'us' | 'metric') => {
  await page.locator(`[name="unitTab"][value="${value}"]`).check();
  await page.waitForTimeout(150);
};
const fill = async (page: Page, fields: Record<string, string | number>) => {
  for (const [name, value] of Object.entries(fields)) {
    await page.locator(`[name="${name}"]`).fill(String(value));
  }
};

const METRIC = { age: 25, weight: 70, height: 178, neck: 50, waist: 96 };
const US = { age: 25, weight: 152, height: 5, heightIn: 10.5, neck: 1, neckIn: 7.5, waist: 3, waistIn: 1.5 };

/** The published report, row for row. */
const METRIC_REPORT: [string, string][] = [
  ['navy', '15.7%'], ['category', 'Fitness'], ['fatMass', '11.0 kg'], ['leanMass', '59.0 kg'],
  ['ideal', '10.5%'], ['toLose', '3.6 kg'], ['bmi', '16.1%'],
];
const US_REPORT: [string, string][] = [
  ['navy', '15.3%'], ['category', 'Fitness'], ['fatMass', '23.2 lbs'], ['leanMass', '128.8 lbs'],
  ['ideal', '10.5%'], ['toLose', '7.2 lbs'], ['bmi', '15.4%'],
];

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE);
  await page.locator('[data-example-dismiss]').click();
});

/* ------------------------------------------------------------------ */
/* The three tabs                                                      */
/* ------------------------------------------------------------------ */

test.describe('the three unit tabs', () => {
  test('offers the three tabs the reference offers', async ({ page }) => {
    const labels = await page.locator('.bf-tab span').allTextContents();
    expect(labels.map((l) => l.trim())).toEqual(['US Units', 'Metric Units', 'Other Units']);
  });

  test('relabels the boxes for each tab', async ({ page }) => {
    await tab(page, 'metric');
    await expect(page.locator('[data-affix-main="height"]')).toHaveText('cm');
    await expect(page.locator('[data-part-for="height"]')).toBeHidden();

    await tab(page, 'us');
    await expect(page.locator('[data-affix-main="height"]')).toHaveText('feet');
    await expect(page.locator('[data-affix-part="height"]')).toHaveText('inches');
    await expect(page.locator('[data-part-for="height"]')).toBeVisible();

  });

  test('switching tabs converts what is typed rather than clearing it', async ({ page }) => {
    await tab(page, 'metric');
    await fill(page, METRIC);
    await tab(page, 'us');
    await expect(page.locator('[name="weight"]')).toHaveValue('154.3');
    await expect(page.locator('[name="height"]')).toHaveValue('5');
    await expect(page.locator('[name="heightIn"]')).toHaveValue('10.1');
  });

  test('the same body reads about the same in either system', async ({ page }) => {
    await tab(page, 'metric');
    await fill(page, METRIC);
    await submit(page).click();
    await expect(primary(page)).toHaveText('15.7%');
    await tab(page, 'us');
    await page.waitForTimeout(DEBOUNCE);
    // Converted boxes show one decimal, so a tenth of a point of drift is expected and
    // honest: the reading follows the numbers actually on screen.
    const after = Number.parseFloat((await primary(page).innerText()).replace('%', ''));
    expect(Math.abs(after - 15.7)).toBeLessThanOrEqual(0.2);
  });

  test('Other Units opens a converter above the calculator, leaving the system alone', async ({ page }) => {
    await tab(page, 'metric');
    const panel = page.locator('[data-converter]');
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Other Units' }).click();
    await expect(panel).toBeVisible();
    // The calculator keeps the units it was on — the converter is a helper, not a mode.
    await expect(page.locator('[name="unitTab"][value="metric"]')).toBeChecked();
    await expect(page.locator('[data-affix-main="height"]')).toHaveText('cm');
    // And it sits above the form.
    const panelBox = await panel.boundingBox();
    const formBox = await page.locator('form[data-form]').boundingBox();
    expect(panelBox!.y).toBeLessThan(formBox!.y);
  });

  test('the converter offers the five categories and converts', async ({ page }) => {
    await page.getByRole('button', { name: 'Other Units' }).click();
    const cats = await page.locator('[data-conv-cat]').allTextContents();
    expect(cats.map((c) => c.trim())).toEqual(['Length', 'Temperature', 'Area', 'Volume', 'Weight']);

    // Weight: 11 stone is 69.85 kg.
    await page.locator('[data-conv-cat="mass"]').click();
    await page.locator('[data-conv-from-unit]').selectOption('st');
    await page.locator('[data-conv-to-unit]').selectOption('kg');
    await page.locator('[data-conv-from-value]').fill('11');
    await page.waitForTimeout(150);
    const kg = Number(await page.locator('[data-conv-to-value]').inputValue());
    expect(kg).toBeCloseTo(69.85, 1);
  });

  test('the converter runs backwards too, and says what it did', async ({ page }) => {
    await page.getByRole('button', { name: 'Other Units' }).click();
    await page.locator('[data-conv-cat="length"]').click();
    await page.locator('[data-conv-from-unit]').selectOption('cm');
    await page.locator('[data-conv-to-unit]').selectOption('in');
    await page.locator('[data-conv-to-value]').fill('37.795');
    await page.waitForTimeout(150);
    expect(Number(await page.locator('[data-conv-from-value]').inputValue())).toBeCloseTo(96, 1);
    await expect(page.locator('[data-conv-sentence]')).toContainText('Inches');
  });

  test('the converter handles temperature, which is not a factor', async ({ page }) => {
    await page.getByRole('button', { name: 'Other Units' }).click();
    await page.locator('[data-conv-cat="temperature"]').click();
    await page.locator('[data-conv-from-value]').fill('100');
    await page.waitForTimeout(150);
    const out = Number(await page.locator('[data-conv-to-value]').inputValue());
    expect(Number.isFinite(out)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The published reports                                               */
/* ------------------------------------------------------------------ */

test.describe('the published reports', () => {
  test('reproduces every row of the metric report', async ({ page }) => {
    await tab(page, 'metric');
    await fill(page, METRIC);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    for (const [key, value] of METRIC_REPORT) await expect(row(page, key)).toHaveText(value);
  });

  test('reproduces every row of the US report', async ({ page }) => {
    await tab(page, 'us');
    await fill(page, US);
    await submit(page).click();
    for (const [key, value] of US_REPORT) await expect(row(page, key)).toHaveText(value);
  });

  test('names the seven rows the reference names', async ({ page }) => {
    const heads = await shell(page).locator('table tbody th').allTextContents();
    expect(heads.map((h) => h.trim())).toEqual([
      'Body Fat (U.S. Navy Method)', 'Body Fat Category', 'Body Fat Mass', 'Lean Body Mass',
      'Ideal Body Fat for Given Age (Jackson & Pollock)', 'Body Fat to Lose to Reach Ideal',
      'Body Fat (BMI method)',
    ]);
  });

  test('places the reading on the category gauge', async ({ page }) => {
    await tab(page, 'metric');
    await fill(page, METRIC);
    await submit(page).click();
    const pointer = shell(page).locator('[data-gauge-for="male"] [data-bf-pointer]');
    await expect(pointer).toHaveText('15.7%');
    const left = await pointer.evaluate((el) => (el as HTMLElement).style.left);
    expect(Number.parseFloat(left)).toBeGreaterThan(0);
    expect(Number.parseFloat(left)).toBeLessThan(100);
  });

  test('names every band in words, not colour alone', async ({ page }) => {
    const keys = await shell(page).locator('[data-gauge-for="male"] .bf-gauge__key').allTextContents();
    expect(keys.map((k) => k.trim())).toEqual(['Essential fat', 'Athletes', 'Fitness', 'Average', 'Obese']);
  });
});

/* ------------------------------------------------------------------ */
/* Gender                                                              */
/* ------------------------------------------------------------------ */

test.describe('gender', () => {
  test('the hip box exists only for women', async ({ page }) => {
    await expect(page.locator('[data-measure="hip"]')).toBeHidden();
    await page.locator('[name="sex"][value="female"]').check();
    await expect(page.locator('[data-measure="hip"]')).toBeVisible();
    await page.locator('[name="sex"][value="male"]').check();
    await expect(page.locator('[data-measure="hip"]')).toBeHidden();
  });

  test('a hidden hip is emptied, never left to act invisibly', async ({ page }) => {
    await page.locator('[name="sex"][value="female"]').check();
    await page.locator('[name="hip"]').fill('96');
    await page.locator('[name="sex"][value="male"]').check();
    await expect(page.locator('[name="hip"]')).toHaveValue('');
  });

  test('computes a report for a woman from all five measurements', async ({ page }) => {
    await tab(page, 'metric');
    await page.locator('[name="sex"][value="female"]').check();
    await fill(page, { age: 30, weight: 62, height: 165, neck: 32, waist: 74, hip: 96 });
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(row(page, 'ideal')).toHaveText('19.3%');
  });

  test('refuses a woman without a hip measurement', async ({ page }) => {
    await tab(page, 'metric');
    await page.locator('[name="sex"][value="female"]').check();
    await fill(page, { age: 30, weight: 62, height: 165, neck: 32, waist: 74 });
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="hip"]')).toBeVisible();
  });

  test('shows the gauge that matches the gender', async ({ page }) => {
    await expect(shell(page).locator('[data-gauge-for="male"]')).toBeAttached();
    await page.locator('[name="sex"][value="female"]').check();
    await expect(shell(page).locator('[data-gauge-for="female"]')).toBeAttached();
  });
});

/* ------------------------------------------------------------------ */
/* Validation and behaviour                                            */
/* ------------------------------------------------------------------ */

test.describe('validation and behaviour', () => {
  test('requires every measurement', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    for (const name of ['age', 'weight', 'height', 'neck', 'waist']) {
      await expect(page.locator(`[data-error-for="${name}"]`)).toBeVisible();
    }
  });

  test('refuses a waist no larger than the neck', async ({ page }) => {
    await tab(page, 'metric');
    await fill(page, { ...METRIC, waist: 50 });
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('refuses measurements that drive the percentage below zero', async ({ page }) => {
    await tab(page, 'metric');
    await fill(page, { ...METRIC, waist: 78 });
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('accepts zero feet when the inches box carries the measurement', async ({ page }) => {
    await tab(page, 'us');
    await fill(page, { ...US, neck: 0, neckIn: 19.5 });
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('updates live after the first calculation', async ({ page }) => {
    await tab(page, 'metric');
    await fill(page, METRIC);
    await submit(page).click();
    await expect(primary(page)).toHaveText('15.7%');
    await page.locator('[name="waist"]').fill('100');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('18.7%');
    await expect(row(page, 'category')).toHaveText('Average');
  });

  test('Clear empties the measurements and returns to US units', async ({ page }) => {
    await tab(page, 'metric');
    await fill(page, METRIC);
    await submit(page).click();
    await clearBtn(page).click();
    for (const name of ['age', 'weight', 'height', 'neck', 'waist']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="unitTab"][value="us"]')).toBeChecked();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('no stale figure survives leaving the valid state', async ({ page }) => {
    await tab(page, 'metric');
    await fill(page, METRIC);
    await submit(page).click();
    await page.locator('[name="waist"]').fill('50');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(row(page, 'navy')).toHaveText('—');
  });
});

/* ------------------------------------------------------------------ */
/* Doctrine                                                            */
/* ------------------------------------------------------------------ */

test.describe('doctrine', () => {
  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    await tab(page, 'metric');
    await fill(page, { ...METRIC, waist: 50 });
    await submit(page).click();
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('announces the result politely', async ({ page }) => {
    await expect(page.locator('#bf-live')).toHaveAttribute('aria-live', 'polite');
    await tab(page, 'metric');
    await fill(page, METRIC);
    await submit(page).click();
    await expect(page.locator('#bf-live')).toContainText('15.7');
  });

  test('every control clears 44px', async ({ page }) => {
    const small = await page.evaluate(
      () =>
        [...document.querySelectorAll('form[data-form] button, form[data-form] input')]
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => e.closest('label') ?? e)
          .filter((e) => e.getBoundingClientRect().height < 44).length,
    );
    expect(small).toBe(0);
  });

  test('mobile does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await tab(page, 'metric');
    await fill(page, METRIC);
    await submit(page).click();
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(doc).toBeLessThanOrEqual(win);
  });

  test('the generated embed mounts the same island', async ({ page }) => {
    await page.goto('/embed/health/body-fat-calculator');
    await page.locator('[data-example-dismiss]').click();
    await tab(page, 'metric');
    await fill(page, METRIC);
    await submit(page).click();
    await expect(page.locator('[data-bf-row="navy"]')).toHaveText('15.7%');
  });
});
