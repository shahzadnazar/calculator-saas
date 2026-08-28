import { test, expect, type Page } from '@playwright/test';

/**
 * Fat intake — the reference's fields, its "+ Settings" disclosure and its report.
 *
 * Three tabs, two of which are unit systems; the third opens the shared five-category
 * converter above the calculator. Every figure is a share of the visitor's own daily
 * Calories, so the whole report moves together — and the two saturated-fat rows read as
 * ceilings, never as targets.
 */
const ROUTE = '/health/fat-intake-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#fi-result');
const low = (page: Page) => page.locator('#fi-result [data-fat-low]');
const high = (page: Page) => page.locator('#fi-result [data-fat-high]');
const basis = (page: Page, key: string) => page.locator(`#fi-result [data-basis="${key}"] [data-basis-grams]`);
const liveRegion = (page: Page) => page.locator('#fi-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#fi-result [data-result-when~="${when}"]`);

/** The reference's case: 25, male, 5 ft 10 in, 160 lb, Light (1.375). */
const calcUs = async (page: Page, over: Partial<Record<string, string>> = {}) => {
  await page.fill('[name="age"]', over.age ?? '25');
  await page.fill('[name="heightFt"]', over.heightFt ?? '5');
  await page.fill('[name="heightIn"]', over.heightIn ?? '10');
  await page.fill('[name="weightLb"]', over.weightLb ?? '160');
  await page.selectOption('[name="activity"]', over.activity ?? '1.375');
  await submit(page).click();
};

const calcMetric = async (page: Page) => {
  await page.click('[data-unit="metric"]');
  await page.fill('[name="age"]', '25');
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="weightKg"]', '60');
  await page.selectOption('[name="activity"]', '1.375');
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- The reference's anatomy ------------------------------------------- */

test.describe('the reference fields', () => {
  test('three tabs, in the reference’s order, opening on US Units', async ({ page }) => {
    const labels = await page.locator('.fi-tabs button').allTextContents();
    expect(labels.map((l) => l.trim())).toEqual(['US Units', 'Metric Units', 'Other Units']);
    await expect(page.locator('[data-unit="imperial"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('asks for age, gender, height, weight and activity, with Settings closed', async ({ page }) => {
    const form = page.locator('form[data-form]');
    await expect(form.getByText('Age', { exact: true })).toBeVisible();
    await expect(form.getByText('ages 18 - 80')).toBeVisible();
    await expect(form.getByText('Gender', { exact: true })).toBeVisible();
    await expect(form.getByText('Activity', { exact: true })).toBeVisible();
    await expect(page.locator('[name="weightLb"]')).toBeVisible();
    await expect(page.locator('[name="weightKg"]')).toBeHidden();
    await expect(page.locator('[data-settings]')).toBeHidden();
  });

  test('the activity select offers the six shared bands', async ({ page }) => {
    const options = await page.locator('[name="activity"] option').allTextContents();
    expect(options).toEqual([
      'Sedentary: little or no exercise',
      'Light: exercise 1-3 times/week',
      'Moderate: exercise 4-5 times/week',
      'Active: daily exercise or intense exercise 3-4 times/week',
      'Very Active: intense exercise 6-7 times/week',
      'Extra Active: very intense exercise daily, or physical job',
    ]);
  });

  test('prints the three exercise definitions under the calculator', async ({ page }) => {
    const notes = page.locator('.fi-notes li');
    await expect(notes).toHaveCount(3);
    await expect(notes.first()).toHaveText('Exercise: 15-30 minutes of elevated heart rate activity.');
  });

  test('loads with empty personal fields and a labelled example result', async ({ page }) => {
    for (const name of ['age', 'heightFt', 'heightIn', 'weightLb', 'bodyFatPct']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(region(page, 'empty')).toBeHidden();
    await expect(liveRegion(page)).toHaveText('');
  });

  test('does not calculate automatically before the first submission', async ({ page }) => {
    await page.fill('[name="age"]', '25');
    await page.fill('[name="weightLb"]', '160');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });
});

/* ---- The report --------------------------------------------------------- */

test.describe('the recommendations', () => {
  test('US: 25, male, 5 ft 10 in, 160 lb, Light', async ({ page }) => {
    await calcUs(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(low(page)).toHaveText('52');
    await expect(high(page)).toHaveText('92');
    await expect(basis(page, 'total')).toHaveText('52 - 92 grams/day');
    await expect(basis(page, 'saturated-guidelines')).toHaveText('up to 26 grams/day');
    await expect(basis(page, 'saturated-aha')).toHaveText('up to 16 grams/day');
    await expect(page.locator('[data-fat-calories]')).toHaveText('2,361');
    await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
  });

  test('Metric: the same person at 180 cm, 60 kg', async ({ page }) => {
    await calcMetric(page);
    await expect(basis(page, 'total')).toHaveText('49 - 86 grams/day');
    await expect(basis(page, 'saturated-guidelines')).toHaveText('up to 25 grams/day');
    await expect(basis(page, 'saturated-aha')).toHaveText('up to 15 grams/day');
    await expect(page.locator('[data-fat-calories]')).toHaveText('2,207');
  });

  test('names each recommendation and its share', async ({ page }) => {
    await calcUs(page);
    const table = page.locator('#fi-result table.fi-bases');
    await expect(table.locator('tbody th[scope="row"]')).toHaveText([
      'Total fat',
      'Saturated fat, Dietary Guidelines',
      'Saturated fat, American Heart Association',
    ]);
    await expect(table.locator('.fi-rate')).toHaveText([
      '20 - 35% of Calories',
      'under 10% of Calories',
      'under 6% of Calories',
    ]);
  });

  test('a ceiling reads as a limit, not a target', async ({ page }) => {
    await calcUs(page);
    await expect(basis(page, 'saturated-guidelines')).toContainText('up to');
    await expect(basis(page, 'saturated-aha')).toContainText('up to');
    await expect(basis(page, 'total')).not.toContainText('up to');
  });

  test('the tighter cap is the smaller number', async ({ page }) => {
    await calcUs(page);
    const grams = async (key: string) =>
      Number((await basis(page, key).textContent())!.replace(/[^0-9]/g, ''));
    expect(await grams('saturated-aha')).toBeLessThan(await grams('saturated-guidelines'));
  });

  test('activity moves every row, because every row is a share of the Calories', async ({ page }) => {
    await calcUs(page);
    await page.selectOption('[name="activity"]', '1.9');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-fat-calories]')).toHaveText('3,262'); // 1717 × 1.9
    await expect(basis(page, 'total')).toHaveText('72 - 127 grams/day');
    await expect(basis(page, 'saturated-guidelines')).toHaveText('up to 36 grams/day');
    await expect(basis(page, 'saturated-aha')).toHaveText('up to 22 grams/day');
  });

  test('the total range is visually dominant over the table cells', async ({ page }) => {
    await calcUs(page);
    const head = await low(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const cell = await basis(page, 'total').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(head).toBeGreaterThan(cell * 1.5);
    await expect(page.locator('[data-live-note]')).toBeVisible();
  });
});

/* ---- Settings ----------------------------------------------------------- */

test.describe('+ Settings', () => {
  const open = async (page: Page) => {
    await page.locator('[data-settings-toggle]').click();
    await expect(page.locator('[data-settings]')).toBeVisible();
  };

  test('offers the three equations and hides the body-fat box until it is needed', async ({ page }) => {
    await open(page);
    await expect(page.locator('[name="formula"]')).toHaveCount(3);
    await expect(page.locator('[data-bodyfat]')).toBeHidden();
    await page.locator('[name="formula"][value="katch-mcardle"]').check();
    await expect(page.locator('[data-bodyfat]')).toBeVisible();
  });

  test('the equation moves the whole report', async ({ page }) => {
    await calcUs(page);
    await open(page);
    await page.locator('[name="formula"][value="harris-benedict"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-fat-calories]')).toHaveText('2,436'); // the unrounded Harris-Benedict BMR × 1.375
    await expect(basis(page, 'total')).toHaveText('54 - 95 grams/day');
  });

  test('Katch-McArdle without a body fat percentage asks rather than guessing', async ({ page }) => {
    await open(page);
    await page.locator('[name="formula"][value="katch-mcardle"]').check();
    await calcUs(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="bodyFatPct"]')).toContainText('body fat percentage');
  });

  test('a required body-fat box behind a closed Settings panel is reopened', async ({ page }) => {
    await open(page);
    await page.locator('[name="formula"][value="katch-mcardle"]').check();
    await page.locator('[data-settings-toggle]').click();
    await expect(page.locator('[data-settings]')).toBeHidden();
    await calcUs(page);
    await expect(page.locator('[data-settings]')).toBeVisible();
    await expect(page.locator('[name="bodyFatPct"]')).toBeFocused();
  });

  test('leaving Katch-McArdle empties the body-fat box it hides', async ({ page }) => {
    await open(page);
    await page.locator('[name="formula"][value="katch-mcardle"]').check();
    await page.fill('[name="bodyFatPct"]', '20');
    await page.locator('[name="formula"][value="mifflin"]').check();
    await expect(page.locator('[data-bodyfat]')).toBeHidden();
    await expect(page.locator('[name="bodyFatPct"]')).toHaveValue('');
  });
});

/* ---- Validation --------------------------------------------------------- */

test('an empty submission focuses the first invalid field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const age = page.locator('[name="age"]');
  await expect(age).toBeFocused();
  await expect(age).toHaveAttribute('aria-invalid', 'true');
  const errId = await age.getAttribute('aria-describedby');
  await expect(page.locator(`#${errId}`)).toHaveText('Enter your age.');
});

test('the calculator is for adults: 17 is an input error, 18 is not', async ({ page }) => {
  await calcUs(page, { age: '17' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="age"]')).toHaveText('Enter an age from 18 to 80.');
  await page.fill('[name="age"]', '18');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('a zero weight is rejected with distinct guidance and no NaN', async ({ page }) => {
  await calcUs(page, { weightLb: '0' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="weightLb"]')).toHaveText('Enter a weight greater than zero.');
  await expect(shell(page)).not.toContainText(/NaN/);
});

test('US height rejects 12+ inches without normalizing', async ({ page }) => {
  await calcUs(page, { heightIn: '13' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="height"]')).toHaveText('Enter inches from 0 to 11.');
});

/* ---- Live-after-first + units ------------------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcUs(page);
  const lb = page.locator('[name="weightLb"]');
  await lb.focus();
  await lb.fill('200');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-fat-calories]')).toHaveText('2,610'); // +40 lb
  await expect(basis(page, 'total')).toHaveText('58 - 102 grams/day'); // 2610 × 35% ÷ 9 = 101.5
  await expect(lb).toBeFocused();
});

test('switching units converts height and weight rather than clearing them', async ({ page }) => {
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '10');
  await page.fill('[name="weightLb"]', '160');
  await page.click('[data-unit="metric"]');
  await expect(page.locator('[name="heightCm"]')).toHaveValue('177.8');
  await expect(page.locator('[name="weightKg"]')).toHaveValue('72.6');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('Other Units opens the shared converter above the calculator, leaving the system alone', async ({ page }) => {
  const panel = page.locator('[data-converter]');
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Other Units' }).click();
  await expect(panel).toBeVisible();
  const cats = await page.locator('[data-conv-cat]').allTextContents();
  expect(cats.map((c) => c.trim())).toEqual(['Length', 'Temperature', 'Area', 'Volume', 'Weight']);
  await expect(page.locator('[data-unit="imperial"]')).toHaveAttribute('aria-checked', 'true');
  const panelTop = (await panel.boundingBox())!.y;
  const formTop = (await page.locator('form[data-form]').boundingBox())!.y;
  expect(panelTop).toBeLessThan(formTop);
});

/* ---- Reset + announcement ----------------------------------------------- */

test('Clear empties every field and restores male, Moderate and Mifflin-St Jeor', async ({ page }) => {
  await calcUs(page);
  await page.check('[name="sex"][value="female"]');
  await page.waitForTimeout(DEBOUNCE);
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  for (const name of ['age', 'heightFt', 'heightIn', 'weightLb']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[name="sex"][value="male"]')).toBeChecked();
  await expect(page.locator('[name="activity"]')).toHaveValue('1.465');
  await expect(page.locator('[name="formula"][value="mifflin"]')).toBeChecked();
  await expect(liveRegion(page)).toHaveText('');
});

test('announces the total range only, never the ceilings', async ({ page }) => {
  await calcUs(page);
  await expect(liveRegion(page)).toHaveText('Aim for 52 to 92 grams of fat a day.');
  await expect(liveRegion(page)).not.toContainText(/saturated|26|16/i);
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
  await expect(low(page)).toHaveText('52');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcUs(page);
  await expect(low(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/health/fat-intake-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="age"]', '25');
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '10');
  await page.fill('[name="weightLb"]', '160');
  await page.selectOption('[name="activity"]', '1.375');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#fi-result [data-fat-low]')).toHaveText('52');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
