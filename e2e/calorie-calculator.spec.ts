import { test, expect, type Page } from '@playwright/test';

/**
 * Calorie — the reference's fields, its guideline report, and the Food Energy Converter
 * that sits under it as a second calculator.
 *
 * Three tabs, two of which are unit systems; the third opens the shared five-category
 * converter above the calculator. The result is a guideline table, not one number: maintain
 * at 100%, three rates of loss, three of gain behind a disclosure, then two zigzag weeks.
 */
const ROUTE = '/health/calorie-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#cal-result');
const goal = (page: Page, key: string) => page.locator(`#cal-result [data-goal="${key}"]`);
const calories = (page: Page, key: string) => goal(page, key).locator('[data-goal-calories]');
const percent = (page: Page, key: string) => goal(page, key).locator('[data-goal-percent]');
const rate = (page: Page, key: string) => goal(page, key).locator('[data-goal-rate]');
const liveRegion = (page: Page) => page.locator('#cal-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#cal-result [data-result-when~="${when}"]`);

/** The reference's metric case: 25, male, 180 cm, 65 kg, Moderate. */
const calcMetric = async (page: Page, over: Partial<Record<string, string>> = {}) => {
  await page.click('[data-unit="metric"]');
  await page.fill('[name="age"]', over.age ?? '25');
  await page.fill('[name="heightCm"]', over.heightCm ?? '180');
  await page.fill('[name="weightKg"]', over.weightKg ?? '65');
  await submit(page).click();
};

const calcUs = async (page: Page, over: Partial<Record<string, string>> = {}) => {
  await page.fill('[name="age"]', over.age ?? '25');
  await page.fill('[name="heightFt"]', over.heightFt ?? '5');
  await page.fill('[name="heightIn"]', over.heightIn ?? '10');
  await page.fill('[name="weightLb"]', over.weightLb ?? '165');
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- The reference's anatomy ------------------------------------------- */

test.describe('the reference fields', () => {
  test('three tabs, in the reference’s order, opening on US Units', async ({ page }) => {
    const labels = await page.locator('.cal-tabs button').allTextContents();
    expect(labels.map((l) => l.trim())).toEqual(['US Units', 'Metric Units', 'Other Units']);
    await expect(page.locator('[data-unit="imperial"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('asks for age, gender, height, weight and activity, with Settings closed', async ({ page }) => {
    const form = page.locator('form[data-form]');
    await expect(form.getByText('Age', { exact: true })).toBeVisible();
    await expect(form.getByText('ages 15 - 80')).toBeVisible();
    await expect(form.getByText('Gender', { exact: true })).toBeVisible();
    await expect(form.getByText('Activity', { exact: true })).toBeVisible();
    await expect(page.locator('[name="weightLb"]')).toBeVisible();
    await expect(page.locator('[name="weightKg"]')).toBeHidden();
    await expect(page.locator('[data-settings]')).toBeHidden();
  });

  test('the activity select offers the reference’s six bands, defaulting to Moderate', async ({ page }) => {
    const options = await page.locator('[name="activity"] option').allTextContents();
    expect(options).toEqual([
      'Sedentary: little or no exercise',
      'Light: exercise 1-3 times/week',
      'Moderate: exercise 4-5 times/week',
      'Active: daily exercise or intense exercise 3-4 times/week',
      'Very Active: intense exercise 6-7 times/week',
      'Extra Active: very intense exercise daily, or physical job',
    ]);
    await expect(page.locator('[name="activity"]')).toHaveValue('1.465');
  });

  test('prints the three exercise definitions under the calculator', async ({ page }) => {
    const notes = page.locator('.cal-notes li');
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
    await page.fill('[name="weightLb"]', '165');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });
});

/* ---- The reference's report, figure for figure -------------------------- */

test.describe('the published report reproduces exactly', () => {
  test('Metric: 25, male, 180 cm, 65 kg, Moderate', async ({ page }) => {
    await calcMetric(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(calories(page, 'maintain')).toHaveText('2,425');
    await expect(percent(page, 'maintain')).toHaveText('100%');
    await expect(calories(page, 'mild-loss')).toHaveText('2,175');
    await expect(percent(page, 'mild-loss')).toHaveText('90%');
    await expect(calories(page, 'loss')).toHaveText('1,925');
    await expect(percent(page, 'loss')).toHaveText('79%');
    await expect(calories(page, 'extreme-loss')).toHaveText('1,425');
    await expect(percent(page, 'extreme-loss')).toHaveText('59%');
    await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
  });

  test('names the rows and rates the way the reference does', async ({ page }) => {
    await calcMetric(page);
    await expect(goal(page, 'maintain')).toContainText('Maintain weight');
    await expect(goal(page, 'mild-loss')).toContainText('Mild weight loss');
    await expect(rate(page, 'mild-loss')).toHaveText('0.25 kg/week');
    await expect(rate(page, 'loss')).toHaveText('0.5 kg/week');
    await expect(rate(page, 'extreme-loss')).toHaveText('1 kg/week');
    await expect(goal(page, 'extreme-loss')).toContainText('Extreme weight loss');
  });

  test('states the rates in pounds under US Units', async ({ page }) => {
    await calcUs(page);
    await expect(rate(page, 'mild-loss')).toHaveText('0.5 lb/week');
    await expect(rate(page, 'loss')).toHaveText('1 lb/week');
    await expect(rate(page, 'extreme-loss')).toHaveText('2 lb/week');
  });

  test('opens the intro sentence the reference opens with', async ({ page }) => {
    await calcMetric(page);
    await expect(page.locator('.cal-lede')).toContainText(
      'daily calorie estimates that can be used as a guideline',
    );
  });

  test('warns about the minimum only when the report goes below it', async ({ page }) => {
    await calcMetric(page); // extreme loss = 1,425
    const warning = page.locator('[data-minimum-warning]');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('1 kg or more per week');
    await expect(warning).toContainText('1,500 calories a day');

    // A larger, very active body stays above the minimum, and the warning goes away.
    await page.fill('[name="weightKg"]', '95');
    await page.selectOption('[name="activity"]', '1.9');
    await page.waitForTimeout(DEBOUNCE);
    await expect(warning).toBeHidden();
  });

  test('the gain half is behind a disclosure, and holds the reference’s three rows', async ({ page }) => {
    await calcMetric(page);
    const gain = page.locator('[data-gain]');
    await expect(gain).toBeHidden();
    const toggle = page.getByRole('button', { name: 'Show info for weight gain' });
    await toggle.click();
    await expect(gain).toBeVisible();
    await expect(calories(page, 'mild-gain')).toHaveText('2,675');
    await expect(percent(page, 'mild-gain')).toHaveText('110%');
    await expect(calories(page, 'gain')).toHaveText('2,925');
    await expect(percent(page, 'gain')).toHaveText('121%');
    await expect(calories(page, 'fast-gain')).toHaveText('3,425');
    await expect(percent(page, 'fast-gain')).toHaveText('141%');
    await page.getByRole('button', { name: 'Hide info for weight gain' }).click();
    await expect(gain).toBeHidden();
  });

  test('the activity band moves every row', async ({ page }) => {
    await calcMetric(page);
    await page.selectOption('[name="activity"]', '1.2');
    await page.waitForTimeout(DEBOUNCE);
    await expect(calories(page, 'maintain')).toHaveText('1,986'); // 1655 × 1.2
    await expect(calories(page, 'loss')).toHaveText('1,486');
  });
});

/* ---- Zigzag ------------------------------------------------------------- */

test.describe('zigzag calorie cycling', () => {
  test('shows two Sunday-first weeks that each total seven days at maintenance', async ({ page }) => {
    await calcMetric(page);
    const tables = page.locator('#cal-result [data-zigzag]');
    await expect(tables).toHaveCount(2);
    for (const key of ['weekend', 'gradual']) {
      const table = page.locator(`#cal-result [data-zigzag="${key}"]`);
      await expect(table.locator('tbody th[scope="row"]')).toHaveText([
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ]);
      const days = (await table.locator('[data-zigzag-day]').allTextContents()).map((t) =>
        Number(t.replace(/,/g, '')),
      );
      expect(days).toHaveLength(7);
      expect(days.reduce((a, b) => a + b, 0)).toBe(2425 * 7);
      await expect(table.locator('[data-zigzag-total]')).toHaveText('16,975');
    }
  });

  test('the first week has two higher days and five lower', async ({ page }) => {
    await calcMetric(page);
    const days = (
      await page.locator('#cal-result [data-zigzag="weekend"] [data-zigzag-day]').allTextContents()
    ).map((t) => Number(t.replace(/,/g, '')));
    expect(days.filter((d) => d > 2425)).toHaveLength(2);
    expect(days.filter((d) => d < 2425)).toHaveLength(5);
  });

  test('the second week never jumps more than 150 calories between adjacent days', async ({ page }) => {
    await calcMetric(page);
    const days = (
      await page.locator('#cal-result [data-zigzag="gradual"] [data-zigzag-day]').allTextContents()
    ).map((t) => Number(t.replace(/,/g, '')));
    for (let i = 1; i < days.length; i++) expect(Math.abs(days[i] - days[i - 1])).toBeLessThanOrEqual(150);
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

  test('the equation changes the whole report', async ({ page }) => {
    await calcMetric(page);
    await open(page);
    await page.locator('[name="formula"][value="harris-benedict"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(calories(page, 'maintain')).toHaveText('2,463');
  });

  test('Katch-McArdle without a body fat percentage asks rather than guessing', async ({ page }) => {
    await open(page);
    await page.locator('[name="formula"][value="katch-mcardle"]').check();
    await calcMetric(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="bodyFatPct"]')).toContainText('body fat percentage');
  });
});

/* ---- Validation --------------------------------------------------------- */

test('an empty submission focuses the first invalid field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const age = page.locator('[name="age"]');
  await expect(age).toBeFocused();
  const errId = await age.getAttribute('aria-describedby');
  await expect(page.locator(`#${errId}`)).toHaveText('Enter your age.');
});

test('an age outside 15–80 is an input error, not a result', async ({ page }) => {
  await calcUs(page, { age: '12' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="age"]')).toHaveText('Enter an age from 15 to 80.');
});

/* ---- Live-after-first + units ------------------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcMetric(page);
  const kg = page.locator('[name="weightKg"]');
  await kg.focus();
  await kg.fill('75');
  await page.waitForTimeout(DEBOUNCE);
  await expect(calories(page, 'maintain')).toHaveText('2,571'); // 1755 × 1.465
  await expect(kg).toBeFocused();
});

test('switching units converts height and weight rather than clearing them', async ({ page }) => {
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '10');
  await page.fill('[name="weightLb"]', '165');
  await page.click('[data-unit="metric"]');
  await expect(page.locator('[name="heightCm"]')).toHaveValue('177.8');
  await expect(page.locator('[name="weightKg"]')).toHaveValue('74.8');
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
  await page.selectOption('[name="activity"]', '1.9');
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

test('announces maintenance only, never the whole table', async ({ page }) => {
  await calcMetric(page);
  await expect(liveRegion(page)).toHaveText('To maintain your weight you need about 2,425 Calories a day.');
  await expect(liveRegion(page)).not.toContainText(/2,175|1,425|Sunday/);
});

/* ---- The second calculator: Food Energy Converter ----------------------- */

test.describe('Food Energy Converter', () => {
  test('sits under the calorie calculator as its own tool', async ({ page }) => {
    const converter = page.locator('[data-food-energy]');
    await expect(converter.getByRole('heading', { name: 'Food Energy Converter' })).toBeVisible();
    const calcBottom = (await page.locator('[data-calorie]').boundingBox())!;
    const converterTop = (await converter.boundingBox())!.y;
    expect(converterTop).toBeGreaterThanOrEqual(calcBottom.y + calcBottom.height - 1);
  });

  test('opens on 1 Calorie = 4.1868 Kilojoules, exactly as the reference shows', async ({ page }) => {
    await expect(page.locator('[name="feValue"]')).toHaveValue('1');
    await expect(page.locator('[name="feFrom"]')).toHaveValue('kcal');
    await expect(page.locator('[name="feTo"]')).toHaveValue('kj');
    await expect(page.locator('[data-fe-out]')).toHaveText('4.1868');
  });

  test('converts as the visitor types, both ways', async ({ page }) => {
    await page.fill('[name="feValue"]', '2000');
    await expect(page.locator('[data-fe-out]')).toHaveText('8,373.6');
    await page.selectOption('[name="feTo"]', 'j');
    await expect(page.locator('[data-fe-out]')).toHaveText('8,373,600');
  });

  test('names both calorie definitions rather than merging them', async ({ page }) => {
    const options = await page.locator('[name="feFrom"] option').allTextContents();
    expect(options).toContain('Calorie [Nutritional, kcal]');
    expect(options).toContain('Calorie [International Table, cal]');
    expect(options).toContain('Calorie [Thermochemical, cal]');
  });

  test('says so plainly when there is nothing to convert, and never prints NaN', async ({ page }) => {
    await page.fill('[name="feValue"]', '');
    await expect(page.locator('[data-fe-error]')).toBeVisible();
    await expect(page.locator('[data-fe-out]')).toHaveText('—');
    await expect(page.locator('[name="feValue"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-food-energy]')).not.toContainText(/NaN|Infinity/);
  });

  test('Clear returns it to the neutral 1 Calorie', async ({ page }) => {
    await page.fill('[name="feValue"]', '500');
    await page.selectOption('[name="feTo"]', 'kwh');
    await page.locator('[data-fe-reset]').click();
    await expect(page.locator('[name="feValue"]')).toHaveValue('1');
    await expect(page.locator('[name="feTo"]')).toHaveValue('kj');
    await expect(page.locator('[data-fe-out]')).toHaveText('4.1868');
  });

  test('its Calculate never submits the calorie calculator', async ({ page }) => {
    await page.locator('[data-fe-form] button[type="submit"]').click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  });
});

/* ---- Responsive / theme / embed / monetization -------------------------- */

test('desktop shows the result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcUs(page);
  await expect(calories(page, 'maintain')).toBeInViewport();
});

test('mobile stacks inputs → action → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcUs(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcUs(page);
  await expect(calories(page, 'maintain')).toBeVisible();
});

test('the embed route mounts the calculator without the second tool', async ({ page }) => {
  await page.goto('/embed/health/calorie-calculator', { waitUntil: 'domcontentloaded' });
  await page.click('[data-unit="metric"]');
  await page.fill('[name="age"]', '25');
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="weightKg"]', '65');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#cal-result [data-goal="maintain"] [data-goal-calories]')).toHaveText('2,425');
  await expect(page.locator('[data-food-energy]')).toHaveCount(0);
});

test('the guide that embeds the island gets the calculator only', async ({ page }) => {
  await page.goto('/guides/bmi-bmr-and-calories-explained', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-calorie]')).toHaveCount(1);
  await expect(page.locator('[data-food-energy]')).toHaveCount(0);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
