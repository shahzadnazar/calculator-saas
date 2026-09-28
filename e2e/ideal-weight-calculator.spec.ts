import { test, expect, type Page } from '@playwright/test';

/**
 * Ideal weight — the reference's fields and its result table.
 *
 * Three tabs, two of which are unit systems; the third opens the shared converter above
 * the calculator without changing the system. The result is the reference's five rows —
 * Robinson, Miller, Devine, Hamwi and the healthy BMI range — under our own dominant
 * number, the band the four formulas agree on.
 */
const ROUTE = '/health/ideal-weight-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#iw-result');
const low = (page: Page) => page.locator('#iw-result [data-iw-low]');
const high = (page: Page) => page.locator('#iw-result [data-iw-high]');
const row = (page: Page, key: string) => page.locator(`#iw-result [data-iw-row="${key}"]`);
const bmiRange = (page: Page) => page.locator('#iw-result [data-iw-bmirange]');
const liveRegion = (page: Page) => page.locator('#iw-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#iw-result [data-result-when~="${when}"]`);

/** The reference's US case: a 25-year-old man of 5 ft 10 in. */
const calcUs = async (page: Page, ft = '5', inch = '10', age = '25') => {
  await page.fill('[name="age"]', age);
  await page.fill('[name="heightFt"]', ft);
  await page.fill('[name="heightIn"]', inch);
  await submit(page).click();
};

/** The reference's metric case: the same man at 180 cm. */
const calcMetric = async (page: Page, cm = '180', age = '25') => {
  await page.click('[data-unit="metric"]');
  await page.fill('[name="age"]', age);
  await page.fill('[name="heightCm"]', cm);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- The reference's anatomy ------------------------------------------- */

test.describe('the reference fields', () => {
  test('three tabs, in the reference’s order, opening on US Units', async ({ page }) => {
    const labels = await page.locator('.iw-tabs button').allTextContents();
    expect(labels.map((l) => l.trim())).toEqual(['US Units', 'Metric Units', 'Other Units']);
    await expect(page.locator('[data-unit="imperial"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('asks for age, gender and height — and nothing else', async ({ page }) => {
    const form = page.locator('form[data-form]');
    await expect(form.getByText('Age', { exact: true })).toBeVisible();
    await expect(form.getByText('ages 2 - 80')).toBeVisible();
    await expect(form.getByText('Gender', { exact: true })).toBeVisible();
    // Both height groups carry the label; only the US one is on screen.
    await expect(form.getByText('Height', { exact: true })).toHaveCount(2);
    await expect(form.getByText('Height', { exact: true }).first()).toBeVisible();
    await expect(page.locator('[name="sex"][value="male"]')).toBeChecked();
    // US units means two height boxes; the metric box is not on screen.
    await expect(page.locator('[name="heightFt"]')).toBeVisible();
    await expect(page.locator('[name="heightIn"]')).toBeVisible();
    await expect(page.locator('[name="heightCm"]')).toBeHidden();
  });

  test('loads with empty personal fields and a labelled example result', async ({ page }) => {
    await expect(page.locator('[name="age"]')).toHaveValue('');
    await expect(page.locator('[name="heightFt"]')).toHaveValue('');
    await expect(page.locator('[name="heightIn"]')).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(region(page, 'empty')).toBeHidden();
    await expect(page.locator('[data-live-note]')).toBeHidden();
    await expect(liveRegion(page)).toHaveText('');
  });

  test('the example reads in the units the tabs opened on', async ({ page }) => {
    // A metric example under a tab that says US Units would be its own small lie.
    await expect(page.locator('#iw-result [data-iw-unit]')).toHaveText('lbs');
    await expect(row(page, 'devine')).toHaveText('160.9 lbs');
  });

  test('does not calculate automatically before the first submission', async ({ page }) => {
    await page.fill('[name="age"]', '25');
    await page.fill('[name="heightFt"]', '5');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(liveRegion(page)).toHaveText('');
  });
});

/* ---- The reference's report, figure for figure -------------------------- */

test.describe('the published reports reproduce exactly', () => {
  test('US: 25, male, 5 ft 10 in', async ({ page }) => {
    await calcUs(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(row(page, 'robinson')).toHaveText('156.5 lbs');
    await expect(row(page, 'miller')).toHaveText('155.0 lbs');
    await expect(row(page, 'devine')).toHaveText('160.9 lbs');
    await expect(row(page, 'hamwi')).toHaveText('165.3 lbs');
    await expect(bmiRange(page)).toHaveText('128.9 - 174.2 lbs');
    await expect(low(page)).toHaveText('155.0');
    await expect(high(page)).toHaveText('165.3');
    await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
  });

  test('Metric: 25, male, 180 cm', async ({ page }) => {
    await calcMetric(page);
    await expect(row(page, 'robinson')).toHaveText('72.6 kg');
    await expect(row(page, 'miller')).toHaveText('71.5 kg');
    await expect(row(page, 'devine')).toHaveText('75.0 kg');
    await expect(row(page, 'hamwi')).toHaveText('77.3 kg');
    await expect(bmiRange(page)).toHaveText('59.9 - 81.0 kg');
    await expect(page.locator('#iw-result [data-iw-unit]')).toHaveText('kg');
  });

  test('every row keeps one decimal place, as the reference prints them', async ({ page }) => {
    await calcUs(page);
    for (const key of ['robinson', 'miller', 'devine', 'hamwi']) {
      await expect(row(page, key)).toHaveText(/^\d+\.\d lbs$/);
    }
  });

  test('the table is accessible: column headers, a row header per formula, and the range row', async ({ page }) => {
    await calcUs(page);
    const table = page.locator('#iw-result table.iw-formulas');
    await expect(table.locator('thead th[scope="col"]')).toHaveCount(2);
    await expect(table.locator('tbody th[scope="row"]')).toHaveCount(5);
    await expect(table.locator('tbody th[scope="row"]').last()).toHaveText('Healthy BMI Range');
  });

  test('the dominant band is visually larger than the table cells', async ({ page }) => {
    await calcUs(page);
    const bandSize = await low(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const cellSize = await row(page, 'robinson').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(bandSize).toBeGreaterThan(cellSize * 1.5);
    await expect(page.locator('[data-live-note]')).toBeVisible();
  });
});

/* ---- The age gate ------------------------------------------------------- */

test.describe('age', () => {
  test('below 18 the adult formulas are withheld, with the reason and a way forward', async ({ page }) => {
    await calcUs(page, '4', '6', '10');
    // Still a VALID result — the visitor asked a sensible question and got a true answer.
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#iw-result [data-iw-adult]')).toBeHidden();
    const child = page.locator('#iw-result [data-iw-child]');
    await expect(child).toBeVisible();
    await expect(child).toContainText('do not apply at age 10');
    await expect(child.getByRole('link', { name: /BMI calculator/i })).toBeVisible();
    // No ideal weight is on screen: the table is hidden, not merely empty.
    await expect(row(page, 'devine')).toBeHidden();
    await expect(bmiRange(page)).toBeHidden();
    await expect(child).not.toContainText('lbs');
  });

  test('at 18 the formulas come back', async ({ page }) => {
    await calcUs(page, '5', '10', '18');
    await expect(page.locator('#iw-result [data-iw-adult]')).toBeVisible();
    await expect(page.locator('#iw-result [data-iw-child]')).toBeHidden();
    await expect(row(page, 'devine')).toHaveText('160.9 lbs');
  });

  test('an age outside 2–80 is an input error, not a result', async ({ page }) => {
    await page.fill('[name="age"]', '81');
    await page.fill('[name="heightFt"]', '5');
    await page.fill('[name="heightIn"]', '10');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="age"]')).toHaveText('Enter an age from 2 to 80.');
  });
});

/* ---- Validation, focus, aria -------------------------------------------- */

test('an empty submission focuses the first invalid field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const age = page.locator('[name="age"]');
  await expect(age).toBeFocused();
  await expect(age).toHaveAttribute('aria-invalid', 'true');
  const errId = await age.getAttribute('aria-describedby');
  await expect(page.locator(`#${errId}`)).toHaveText('Enter an age.');
});

test('US height rejects 12+ inches without normalizing', async ({ page }) => {
  await page.fill('[name="age"]', '25');
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '13');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="height"]')).toHaveText('Enter inches from 0 to 11.');
});

/* ---- Live-after-first --------------------------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcMetric(page, '180');
  await expect(row(page, 'devine')).toHaveText('75.0 kg');
  const cm = page.locator('[name="heightCm"]');
  await cm.focus();
  await cm.fill('190');
  await page.waitForTimeout(DEBOUNCE);
  await expect(row(page, 'devine')).toHaveText('84.0 kg');
  await expect(cm).toBeFocused();
});

test('changing gender after the first result moves every formula and announces it', async ({ page }) => {
  await calcMetric(page, '180');
  await expect(row(page, 'devine')).toHaveText('75.0 kg');

  const female = page.locator('[name="sex"][value="female"]');
  await female.check();
  await page.waitForTimeout(DEBOUNCE);

  await expect(row(page, 'devine')).toHaveText('70.5 kg');
  // The healthy BMI range is height-only, so it does not move.
  await expect(bmiRange(page)).toHaveText('59.9 - 81.0 kg');
  await expect(female).toBeFocused();
  await expect(liveRegion(page)).toContainText('67.5 to 70.5 kilograms');
  await expect(liveRegion(page)).not.toContainText(/robinson|miller|devine|hamwi/i);
});

/* ---- Unit switching ----------------------------------------------------- */

test('switching units converts the height rather than clearing it', async ({ page }) => {
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '9');
  await page.click('[data-unit="metric"]');
  await expect(page.locator('[name="heightCm"]')).toHaveValue('175.3');
  await page.click('[data-unit="imperial"]');
  await expect(page.locator('[name="heightFt"]')).toHaveValue('5');
  await expect(page.locator('[name="heightIn"]')).toHaveValue('9');
  // Switching a unit is not a calculation.
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Other Units: the shared converter ---------------------------------- */

test.describe('Other Units', () => {
  test('opens a converter above the calculator, leaving the unit system alone', async ({ page }) => {
    const panel = page.locator('[data-converter]');
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Other Units' }).click();
    await expect(panel).toBeVisible();
    // The calculator keeps the units it was on — the converter is a helper, not a mode.
    await expect(page.locator('[data-unit="imperial"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[name="heightFt"]')).toBeVisible();
    // And it sits ABOVE the calculator, exactly where the reference puts it.
    const panelTop = (await panel.boundingBox())!.y;
    const formTop = (await page.locator('form[data-form]').boundingBox())!.y;
    expect(panelTop).toBeLessThan(formTop);
  });

  test('offers the five categories and converts, both ways', async ({ page }) => {
    await page.getByRole('button', { name: 'Other Units' }).click();
    const cats = await page.locator('[data-conv-cat]').allTextContents();
    expect(cats.map((c) => c.trim())).toEqual(['Length', 'Temperature', 'Area', 'Volume', 'Weight']);

    await page.locator('[data-conv-cat="mass"]').click();
    await page.locator('[data-conv-from-unit]').selectOption('st');
    await page.locator('[data-conv-to-unit]').selectOption('kg');
    await page.locator('[data-conv-from-value]').fill('11');
    expect(Number(await page.locator('[data-conv-to-value]').inputValue())).toBeCloseTo(69.85, 1);

    await page.locator('[data-conv-cat="length"]').click();
    await page.locator('[data-conv-from-unit]').selectOption('cm');
    await page.locator('[data-conv-to-unit]').selectOption('in');
    await page.locator('[data-conv-to-value]').fill('70');
    expect(Number(await page.locator('[data-conv-from-value]').inputValue())).toBeCloseTo(177.8, 1);
    await expect(page.locator('[data-conv-sentence]')).toContainText('Centimetres');
  });

  test('a converted figure can be typed straight into the calculator', async ({ page }) => {
    await page.getByRole('button', { name: 'Other Units' }).click();
    await page.locator('[data-conv-from-unit]').selectOption('m');
    await page.locator('[data-conv-to-unit]').selectOption('cm');
    await page.locator('[data-conv-from-value]').fill('1.8');
    const cm = await page.locator('[data-conv-to-value]').inputValue();
    await page.click('[data-unit="metric"]');
    await page.fill('[name="age"]', '25');
    await page.fill('[name="heightCm"]', cm);
    await submit(page).click();
    await expect(row(page, 'devine')).toHaveText('75.0 kg');
  });
});

/* ---- Reset -------------------------------------------------------------- */

test('Clear empties every field, restores male, and returns to empty', async ({ page }) => {
  await calcUs(page);
  await page.check('[name="sex"][value="female"]');
  await page.waitForTimeout(DEBOUNCE);
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(page.locator('[name="age"]')).toHaveValue('');
  await expect(page.locator('[name="heightFt"]')).toHaveValue('');
  await expect(page.locator('[name="heightIn"]')).toHaveValue('');
  await expect(page.locator('[name="sex"][value="male"]')).toBeChecked();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Announcement ------------------------------------------------------- */

test('announces the band once, and never a formula name', async ({ page }) => {
  await calcUs(page);
  await expect(liveRegion(page)).toHaveText('Your ideal weight is approximately 155.0 to 165.3 pounds.');
  await expect(liveRegion(page)).not.toContainText(/robinson|devine|156\.5/i);
});

test('a child hears why the formulas do not apply, and no weight', async ({ page }) => {
  await calcUs(page, '4', '6', '10');
  await expect(liveRegion(page)).toHaveText(
    'Ideal-weight formulas apply from age 18. At 10, healthy weight is judged from BMI-for-age percentiles instead.',
  );
});

/* ---- Responsive / theme / embed / monetization -------------------------- */

test('desktop shows the result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcUs(page);
  await expect(low(page)).toBeInViewport();
});

test('mobile stacks inputs → action → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcUs(page);
  await expect(row(page, 'devine')).toHaveText('160.9 lbs');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the converter does not overflow on mobile either', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Other Units' }).click();
  await expect(page.locator('[data-converter]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcUs(page);
  await expect(low(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/health/ideal-weight-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="age"]', '25');
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '10');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#iw-result [data-iw-row="devine"]')).toHaveText('160.9 lbs');
});

test('the guide that embeds the island renders the migrated task-first tool', async ({ page }) => {
  await page.goto('/guides/healthy-weight-for-your-height', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#iw-result')).toHaveAttribute('data-result-state', 'example');
  await page.fill('[name="age"]', '25');
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '10');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#iw-result [data-iw-row="devine"]')).toHaveText('160.9 lbs');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
