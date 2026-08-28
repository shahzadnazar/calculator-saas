import { test, expect, type Page } from '@playwright/test';

/**
 * BMR — the reference's fields, its "+ Settings" disclosure and its result table.
 *
 * Three tabs, two of which are unit systems; the third opens a pair of per-field converters
 * above the calculator without changing the system. The result is one headline —
 * "BMR = 1,717 Calories/day" — over the reference's six-row activity table.
 */
const ROUTE = '/health/bmr-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#bmr-result');
const value = (page: Page) => page.locator('#bmr-result [data-bmr-value]');
const suffix = (page: Page) => page.locator('#bmr-result [data-bmr-suffix]');
const rows = (page: Page) => page.locator('#bmr-result [data-bmr-activity]');
const liveRegion = (page: Page) => page.locator('#bmr-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#bmr-result [data-result-when~="${when}"]`);

/** The reference's US case: 25, male, 5 ft 10 in, 160 lb. */
const calcUs = async (page: Page, over: Partial<Record<string, string>> = {}) => {
  await page.fill('[name="age"]', over.age ?? '25');
  await page.fill('[name="heightFt"]', over.heightFt ?? '5');
  await page.fill('[name="heightIn"]', over.heightIn ?? '10');
  await page.fill('[name="weightLb"]', over.weightLb ?? '160');
  await submit(page).click();
};

/** The reference's metric case: 25, male, 180 cm, 60 kg. */
const calcMetric = async (page: Page) => {
  await page.click('[data-unit="metric"]');
  await page.fill('[name="age"]', '25');
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="weightKg"]', '60');
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- The reference's anatomy ------------------------------------------- */

test.describe('the reference fields', () => {
  test('three tabs, in the reference’s order, opening on US Units', async ({ page }) => {
    const labels = await page.locator('.bmr-tabs button').allTextContents();
    expect(labels.map((l) => l.trim())).toEqual(['US Units', 'Metric Units', 'Other Units']);
    await expect(page.locator('[data-unit="imperial"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('asks for age, gender, height and weight, with Settings closed', async ({ page }) => {
    const form = page.locator('form[data-form]');
    await expect(form.getByText('Age', { exact: true })).toBeVisible();
    await expect(form.getByText('ages 15 - 80')).toBeVisible();
    await expect(form.getByText('Gender', { exact: true })).toBeVisible();
    await expect(page.locator('[name="heightFt"]')).toBeVisible();
    await expect(page.locator('[name="heightIn"]')).toBeVisible();
    await expect(page.locator('[name="weightLb"]')).toBeVisible();
    await expect(page.locator('[name="heightCm"]')).toBeHidden();
    await expect(page.locator('[data-settings]')).toBeHidden();
    await expect(page.locator('[data-settings-toggle]')).toHaveAttribute('aria-expanded', 'false');
  });

  test('loads with empty personal fields and a labelled example result', async ({ page }) => {
    for (const name of ['age', 'heightFt', 'heightIn', 'weightLb', 'bodyFatPct']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(region(page, 'empty')).toBeHidden();
    await expect(page.locator('[data-live-note]')).toBeHidden();
    await expect(liveRegion(page)).toHaveText('');
  });

  test('the example is the reference’s US case, in the units the tabs opened on', async ({ page }) => {
    await expect(value(page)).toHaveText('1,717');
    await expect(suffix(page)).toHaveText('Calories/day');
  });

  test('does not calculate automatically before the first submission', async ({ page }) => {
    await page.fill('[name="age"]', '25');
    await page.fill('[name="weightLb"]', '160');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(liveRegion(page)).toHaveText('');
  });
});

/* ---- The reference's report, figure for figure -------------------------- */

test.describe('the published reports reproduce exactly', () => {
  test('US: 25, male, 5 ft 10 in, 160 lb → 1,717 and its six rows', async ({ page }) => {
    await calcUs(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(value(page)).toHaveText('1,717');
    await expect(suffix(page)).toHaveText('Calories/day');
    await expect(rows(page)).toHaveText(['2,060', '2,361', '2,515', '2,661', '2,962', '3,262']);
    await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
  });

  test('Metric: 25, male, 180 cm, 60 kg → 1,605 and its six rows', async ({ page }) => {
    await calcMetric(page);
    await expect(value(page)).toHaveText('1,605');
    await expect(rows(page)).toHaveText(['1,926', '2,207', '2,351', '2,488', '2,769', '3,050']);
  });

  test('names the six activity bands and prints the three footnotes', async ({ page }) => {
    await calcUs(page);
    const table = page.locator('#bmr-result table.bmr-activity');
    await expect(table.locator('tbody th[scope="row"]')).toHaveText([
      'Sedentary: little or no exercise',
      'Exercise 1-3 times/week',
      'Exercise 4-5 times/week',
      'Daily exercise or intense exercise 3-4 times/week',
      'Intense exercise 6-7 times/week',
      'Very intense exercise daily, or physical job',
    ]);
    await expect(page.locator('#bmr-result .bmr-notes li')).toHaveCount(3);
    await expect(page.locator('#bmr-result .bmr-notes')).toContainText('15-30 minutes');
  });

  test('the table is accessible and headed the way the reference heads it', async ({ page }) => {
    await calcUs(page);
    const table = page.locator('#bmr-result table.bmr-activity');
    await expect(table.locator('thead th[scope="col"]')).toHaveText(['Activity Level', 'Calorie']);
    await expect(page.locator('[data-bmr-table-title]')).toHaveText(
      'Daily calorie needs based on activity level',
    );
  });

  test('every row is the displayed BMR times its multiplier', async ({ page }) => {
    await calcUs(page);
    const shown = Number((await value(page).textContent())!.replace(/,/g, ''));
    const cells = (await rows(page).allTextContents()).map((t) => Number(t.replace(/,/g, '')));
    const multipliers = [1.2, 1.375, 1.465, 1.55, 1.725, 1.9];
    expect(cells).toEqual(multipliers.map((m) => Math.round(shown * m)));
  });

  test('the BMR is visually dominant over the table cells', async ({ page }) => {
    await calcUs(page);
    const head = await value(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const cell = await rows(page).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(head).toBeGreaterThan(cell * 1.5);
    await expect(page.locator('[data-live-note]')).toBeVisible();
  });
});

/* ---- Settings ----------------------------------------------------------- */

test.describe('+ Settings', () => {
  const openSettings = async (page: Page) => {
    await page.locator('[data-settings-toggle]').click();
    await expect(page.locator('[data-settings]')).toBeVisible();
  };

  test('opens to the three equations, a result unit, and no body-fat box', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('[name="formula"]')).toHaveCount(3);
    await expect(page.locator('[data-settings]').getByText('Mifflin St Jeor', { exact: true })).toBeVisible();
    await expect(page.locator('[data-settings]').getByText('Revised Harris-Benedict', { exact: true })).toBeVisible();
    await expect(page.locator('[data-settings]').getByText('Katch-McArdle', { exact: true })).toBeVisible();
    await expect(page.locator('[name="resultUnit"]')).toHaveCount(2);
    // Only Katch-McArdle reads body fat, so the box is not on screen yet.
    await expect(page.locator('[data-bodyfat]')).toBeHidden();
  });

  test('switching to Revised Harris-Benedict changes the answer', async ({ page }) => {
    await calcMetric(page);
    await expect(value(page)).toHaveText('1,605');
    await openSettings(page);
    await page.locator('[name="formula"][value="harris-benedict"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(value(page)).toHaveText('1,614');
  });

  test('Katch-McArdle reveals the body-fat box and works from lean mass', async ({ page }) => {
    await calcMetric(page);
    await openSettings(page);
    await page.locator('[name="formula"][value="katch-mcardle"]').check();
    await expect(page.locator('[data-bodyfat]')).toBeVisible();
    await page.fill('[name="bodyFatPct"]', '20');
    await page.waitForTimeout(DEBOUNCE);
    await expect(value(page)).toHaveText('1,407'); // 370 + 21.6 × (60 × 0.8)
  });

  test('Katch-McArdle without a body fat percentage asks for one rather than guessing', async ({ page }) => {
    await openSettings(page);
    await page.locator('[name="formula"][value="katch-mcardle"]').check();
    await calcUs(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="bodyFatPct"]')).toContainText('body fat percentage');
  });

  test('leaving Katch-McArdle empties the body-fat box it hides', async ({ page }) => {
    await openSettings(page);
    await page.locator('[name="formula"][value="katch-mcardle"]').check();
    await page.fill('[name="bodyFatPct"]', '20');
    await page.locator('[name="formula"][value="mifflin"]').check();
    await expect(page.locator('[data-bodyfat]')).toBeHidden();
    await expect(page.locator('[name="bodyFatPct"]')).toHaveValue('');
  });

  test('a required body-fat box behind a closed Settings panel is reopened, not left hidden', async ({ page }) => {
    await openSettings(page);
    await page.locator('[name="formula"][value="katch-mcardle"]').check();
    await page.locator('[data-settings-toggle]').click(); // close it again
    await expect(page.locator('[data-settings]')).toBeHidden();
    await calcUs(page);
    await expect(page.locator('[data-settings]')).toBeVisible();
    await expect(page.locator('[name="bodyFatPct"]')).toBeFocused();
  });

  test('kilojoules re-denominates the headline and the whole table', async ({ page }) => {
    await calcUs(page);
    await openSettings(page);
    await page.locator('[name="resultUnit"][value="kj"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(value(page)).toHaveText('7,184');
    await expect(suffix(page)).toHaveText('kJ/day');
    await expect(page.locator('[data-bmr-col-head]')).toHaveText('Kilojoules');
    await expect(page.locator('[data-bmr-table-title]')).toHaveText(
      'Daily energy needs based on activity level',
    );
    await expect(rows(page).first()).toHaveText('8,621'); // 7184 × 1.2
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
  await expect(page.locator(`#${errId}`)).toHaveText('Enter your age.');
});

test('an age outside 15–80 is an input error, not a result', async ({ page }) => {
  await calcUs(page, { age: '12' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="age"]')).toHaveText('Enter an age from 15 to 80.');
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

/* ---- Live-after-first --------------------------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcUs(page);
  await expect(value(page)).toHaveText('1,717');
  const lb = page.locator('[name="weightLb"]');
  await lb.focus();
  await lb.fill('180');
  await page.waitForTimeout(DEBOUNCE);
  await expect(value(page)).toHaveText('1,808'); // +20 lb ≈ +90.7 kcal
  await expect(lb).toBeFocused();
});

test('changing gender after the first result recalculates and announces concisely', async ({ page }) => {
  await calcUs(page);
  const female = page.locator('[name="sex"][value="female"]');
  await female.check();
  await page.waitForTimeout(DEBOUNCE);
  await expect(value(page)).toHaveText('1,551'); // 1717 − 166
  await expect(female).toBeFocused();
  await expect(liveRegion(page)).toHaveText('Your basal metabolic rate is 1,551 Calories per day.');
  await expect(liveRegion(page)).not.toContainText(/sedentary|exercise/i);
});

/* ---- Unit switching ----------------------------------------------------- */

test('switching units converts height and weight rather than clearing them', async ({ page }) => {
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '10');
  await page.fill('[name="weightLb"]', '160');
  await page.click('[data-unit="metric"]');
  await expect(page.locator('[name="heightCm"]')).toHaveValue('177.8');
  await expect(page.locator('[name="weightKg"]')).toHaveValue('72.6');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Other Units: the per-field converters ------------------------------ */

test.describe('Other Units', () => {
  test('opens two converters above the calculator, leaving the unit system alone', async ({ page }) => {
    const panel = page.locator('[data-converter]');
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Other Units' }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Height Converter:')).toBeVisible();
    await expect(panel.getByText('Weight Converter:')).toBeVisible();
    await expect(page.locator('[data-unit="imperial"]')).toHaveAttribute('aria-checked', 'true');
    const panelTop = (await panel.boundingBox())!.y;
    const formTop = (await page.locator('form[data-form]').boundingBox())!.y;
    expect(panelTop).toBeLessThan(formTop);
  });

  test('each converter answers when asked, in its own category', async ({ page }) => {
    await page.getByRole('button', { name: 'Other Units' }).click();
    const height = page.locator('[data-fieldconv]').first();
    await height.locator('[data-fieldconv-value]').fill('1.8');
    await height.locator('[data-fieldconv-go]').click();
    await expect(height.locator('[data-fieldconv-out]')).toHaveText('1.8 Metres = 70.866142 Inches');

    const weight = page.locator('[data-fieldconv]').nth(1);
    await weight.locator('[data-fieldconv-from]').selectOption('st');
    await weight.locator('[data-fieldconv-to]').selectOption('lb');
    await weight.locator('[data-fieldconv-value]').fill('11');
    await weight.locator('[data-fieldconv-go]').click();
    await expect(weight.locator('[data-fieldconv-out]')).toContainText('Pounds');
  });

  test('changing a unit clears the stale answer rather than leaving it to be misread', async ({ page }) => {
    await page.getByRole('button', { name: 'Other Units' }).click();
    const height = page.locator('[data-fieldconv]').first();
    await height.locator('[data-fieldconv-value]').fill('1.8');
    await height.locator('[data-fieldconv-go]').click();
    await expect(height.locator('[data-fieldconv-out]')).not.toHaveText('');
    await height.locator('[data-fieldconv-to]').selectOption('cm');
    await expect(height.locator('[data-fieldconv-out]')).toHaveText('');
  });

  test('Enter inside a converter converts and never submits the calculator', async ({ page }) => {
    await page.getByRole('button', { name: 'Other Units' }).click();
    const height = page.locator('[data-fieldconv]').first();
    await height.locator('[data-fieldconv-value]').fill('2');
    await height.locator('[data-fieldconv-value]').press('Enter');
    await expect(height.locator('[data-fieldconv-out]')).toContainText('Inches');
    // The calculator is untouched: no first calculation happened.
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  });

  test('the close button puts focus back on the tab that opened it', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Other Units' });
    await toggle.click();
    await page.locator('[data-converter-close]').click();
    await expect(page.locator('[data-converter]')).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('a converted figure can be typed straight into the calculator', async ({ page }) => {
    await page.getByRole('button', { name: 'Other Units' }).click();
    const weight = page.locator('[data-fieldconv]').nth(1);
    await weight.locator('[data-fieldconv-from]').selectOption('kg');
    await weight.locator('[data-fieldconv-to]').selectOption('lb');
    await weight.locator('[data-fieldconv-value]').fill('72.5748');
    await weight.locator('[data-fieldconv-go]').click();
    const lb = (await weight.locator('[data-fieldconv-out]').textContent())!.split('= ')[1].split(' ')[0];
    await calcUs(page, { weightLb: lb });
    await expect(value(page)).toHaveText('1,717');
  });
});

/* ---- Reset -------------------------------------------------------------- */

test('Clear empties every field and restores male, Mifflin-St Jeor and Calories', async ({ page }) => {
  await calcUs(page);
  await page.check('[name="sex"][value="female"]');
  await page.locator('[data-settings-toggle]').click();
  await page.locator('[name="resultUnit"][value="kj"]').check();
  await page.waitForTimeout(DEBOUNCE);
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  for (const name of ['age', 'heightFt', 'heightIn', 'weightLb', 'bodyFatPct']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[name="sex"][value="male"]')).toBeChecked();
  await expect(page.locator('[name="formula"][value="mifflin"]')).toBeChecked();
  await expect(page.locator('[name="resultUnit"][value="kcal"]')).toBeChecked();
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Announcement ------------------------------------------------------- */

test('announces the BMR concisely and never reads the activity table', async ({ page }) => {
  await calcUs(page);
  await expect(liveRegion(page)).toHaveText('Your basal metabolic rate is 1,717 Calories per day.');
  await expect(liveRegion(page)).not.toContainText(/2,060|sedentary/i);
});

/* ---- Responsive / theme / embed / monetization -------------------------- */

test('desktop shows the result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcUs(page);
  await expect(value(page)).toBeInViewport();
});

test('mobile stacks inputs → action → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcUs(page);
  await expect(value(page)).toHaveText('1,717');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the converters do not overflow on mobile either', async ({ page }) => {
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
  await expect(value(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/health/bmr-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="age"]', '25');
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '10');
  await page.fill('[name="weightLb"]', '160');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#bmr-result [data-bmr-value]')).toHaveText('1,717');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
