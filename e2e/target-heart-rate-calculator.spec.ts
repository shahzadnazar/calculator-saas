import { test, expect, type Page } from '@playwright/test';

/**
 * Target heart rate — the reference's fields, its "+ Settings" disclosure and its zone table.
 *
 * Max heart rate is a choice, not a field: estimate from age, or a measured test result. The
 * resting heart rate is optional and changes what the percentages are OF, which the panel
 * says out loud. Form and result sit side by side rather than stacked.
 */
const ROUTE = '/health/target-heart-rate-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#thr-result');
const low = (page: Page) => page.locator('#thr-result [data-thr-low]');
const high = (page: Page) => page.locator('#thr-result [data-thr-high]');
const headline = (page: Page) => page.locator('#thr-result [data-thr-headline]');
const zoneBpm = (page: Page, key: string) => page.locator(`#thr-result [data-zone="${key}"] [data-zone-bpm]`);
const zoneScale = (page: Page, key: string) => page.locator(`#thr-result [data-zone="${key}"] [data-zone-scale]`);
const liveRegion = (page: Page) => page.locator('#thr-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#thr-result [data-result-when~="${when}"]`);

/** The reference's case: age 30, resting 70. */
const calc = async (page: Page, over: Partial<Record<string, string>> = {}) => {
  await page.fill('[name="age"]', over.age ?? '30');
  await page.fill('[name="restingHr"]', over.restingHr ?? '70');
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- The reference's anatomy ------------------------------------------- */

test.describe('the reference fields', () => {
  test('offers the two ways to get a maximum heart rate, defaulting to age', async ({ page }) => {
    const form = page.locator('form[data-form]');
    await expect(form.getByText('Max Heart Rate', { exact: true }).first()).toBeVisible();
    await expect(form.getByText('Estimate from age')).toBeVisible();
    await expect(form.getByText('Test result')).toBeVisible();
    await expect(page.locator('[name="mode"][value="age"]')).toBeChecked();
    await expect(page.locator('[name="age"]')).toBeVisible();
    await expect(page.locator('[name="measuredMaxHr"]')).toBeHidden();
  });

  test('marks the resting heart rate optional, with Settings closed', async ({ page }) => {
    const form = page.locator('form[data-form]');
    await expect(form.getByText('Resting Heart Rate', { exact: true })).toBeVisible();
    await expect(form.getByText('(optional)')).toBeVisible();
    await expect(page.locator('[data-settings]')).toBeHidden();
  });

  test('sits form beside result, not stacked, at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    const form = (await page.locator('form[data-form]').boundingBox())!;
    const result = (await shell(page).boundingBox())!;
    // Side by side: the result starts to the RIGHT of the form, and they share a top edge.
    expect(result.x).toBeGreaterThan(form.x + form.width - 1);
    expect(Math.abs(result.y - form.y)).toBeLessThan(20);
  });

  test('loads with empty personal fields and a labelled example result', async ({ page }) => {
    for (const name of ['age', 'measuredMaxHr', 'restingHr']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(region(page, 'empty')).toBeHidden();
    await expect(liveRegion(page)).toHaveText('');
  });

  test('does not calculate automatically before the first submission', async ({ page }) => {
    await page.fill('[name="age"]', '30');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });
});

/* ---- The report --------------------------------------------------------- */

test.describe('the published report reproduces exactly', () => {
  test('age 30, resting 70, Haskell & Fox, Karvonen', async ({ page }) => {
    await calc(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(headline(page)).toHaveText(
      '50 - 85% of your heart rate reserve — the gap between your maximum of 190 bpm and your resting rate.',
    );
    await expect(low(page)).toHaveText('130');
    await expect(high(page)).toHaveText('172');
    await expect(zoneBpm(page, 'very-light')).toHaveText('130 - 142');
    await expect(zoneBpm(page, 'light')).toHaveText('142 - 154');
    await expect(zoneBpm(page, 'moderate')).toHaveText('154 - 166');
    await expect(zoneBpm(page, 'hard')).toHaveText('166 - 178');
    await expect(zoneBpm(page, 'vo2max')).toHaveText('178 - 190');
    await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
  });

  test('names the five intensities and their bands the way the reference does', async ({ page }) => {
    await calc(page);
    const table = page.locator('#thr-result table.thr-zones');
    await expect(table.locator('thead th')).toHaveText([
      'Exercise Intensity',
      'Heart Rate Reserve',
      'Target Heart Rate (bpm)',
    ]);
    await expect(table.locator('tbody th[scope="row"]')).toHaveText([
      'Very light',
      'Light',
      'Moderate',
      'Hard',
      'VO₂ Max (maximum)',
    ]);
    for (const [key, band] of [
      ['very-light', '50 - 60%'],
      ['light', '60 - 70%'],
      ['moderate', '70 - 80%'],
      ['hard', '80 - 90%'],
      ['vo2max', '90 - 100%'],
    ] as const) {
      await expect(zoneScale(page, key)).toHaveText(band);
    }
  });

  test('shows the maximum and the reserve it worked from', async ({ page }) => {
    await calc(page);
    await expect(page.locator('[data-thr-max]')).toHaveText('190');
    await expect(page.locator('[data-thr-reserve-row]')).toBeVisible();
    await expect(page.locator('[data-thr-reserve]')).toHaveText('120');
  });

  test('the zones run continuously — one band’s top is the next one’s floor', async ({ page }) => {
    await calc(page);
    const keys = ['very-light', 'light', 'moderate', 'hard', 'vo2max'];
    const bands = [];
    for (const k of keys) bands.push((await zoneBpm(page, k).textContent())!.split(' - ').map(Number));
    for (let i = 1; i < bands.length; i++) expect(bands[i][0]).toBe(bands[i - 1][1]);
  });

  test('the aerobic figure is visually dominant over the table cells', async ({ page }) => {
    await calc(page);
    const head = await low(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const cell = await zoneBpm(page, 'moderate').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(head).toBeGreaterThan(cell * 1.5);
    await expect(page.locator('[data-live-note]')).toBeVisible();
  });
});

/* ---- The optional resting rate ------------------------------------------ */

test.describe('the resting heart rate', () => {
  test('is genuinely optional, and the result says which basis it used', async ({ page }) => {
    await calc(page, { restingHr: '' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(headline(page)).toHaveText(
      '50 - 85% of your maximum heart rate of 190 bpm. Add a resting heart rate for the more personal Karvonen figure.',
    );
    await expect(page.locator('[data-thr-basis]')).toHaveText('maximum heart rate');
    await expect(page.locator('[data-thr-reserve-row]')).toBeHidden();
    await expect(zoneBpm(page, 'very-light')).toHaveText('95 - 114');
  });

  test('adding one switches the basis and every number', async ({ page }) => {
    await calc(page, { restingHr: '' });
    await expect(zoneBpm(page, 'very-light')).toHaveText('95 - 114');
    await page.fill('[name="restingHr"]', '70');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-thr-basis]')).toHaveText('heart rate reserve');
    await expect(zoneBpm(page, 'very-light')).toHaveText('130 - 142');
  });

  test('a nonsense resting rate is refused rather than absorbed', async ({ page }) => {
    await calc(page, { restingHr: '5' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="restingHr"]')).toContainText('resting heart rate from');
  });
});

/* ---- Test result mode --------------------------------------------------- */

test.describe('Test result', () => {
  test('swaps Age for a measured maximum, and empties the box it hides', async ({ page }) => {
    await page.fill('[name="age"]', '30');
    await page.locator('[name="mode"][value="test"]').check();
    await expect(page.locator('[name="age"]')).toBeHidden();
    await expect(page.locator('[name="measuredMaxHr"]')).toBeVisible();
    await expect(page.locator('[name="age"]')).toHaveValue('');
  });

  test('uses the measurement instead of any equation', async ({ page }) => {
    await page.locator('[name="mode"][value="test"]').check();
    await page.fill('[name="measuredMaxHr"]', '200');
    await page.fill('[name="restingHr"]', '70');
    await submit(page).click();
    await expect(page.locator('[data-thr-max]')).toHaveText('200');
    await expect(page.locator('[data-thr-reserve]')).toHaveText('130');
    await expect(zoneBpm(page, 'very-light')).toHaveText('135 - 148');
  });

  test('asks for the measurement rather than falling back to an age', async ({ page }) => {
    await page.locator('[name="mode"][value="test"]').check();
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="measuredMaxHr"]')).toContainText('test measured');
  });
});

/* ---- Settings ----------------------------------------------------------- */

test.describe('+ Settings', () => {
  const open = async (page: Page) => {
    await page.locator('[data-settings-toggle]').click();
    await expect(page.locator('[data-settings]')).toBeVisible();
  };

  test('offers the three equations and the three intensity scales', async ({ page }) => {
    await open(page);
    await expect(page.locator('[name="formula"]')).toHaveCount(3);
    await expect(page.locator('[name="scale"]')).toHaveCount(3);
    const s = page.locator('[data-settings]');
    await expect(s.getByText('Haskell & Fox (1971)')).toBeVisible();
    await expect(s.getByText('Tanaka, Monahan, & Seals (2001)')).toBeVisible();
    await expect(s.getByText('Nes, Janszky, Wisloff, Stoylen, Karlsen (2013)')).toBeVisible();
    await expect(s.getByText('The Karvonen Formula')).toBeVisible();
  });

  test('the equation moves every zone', async ({ page }) => {
    await calc(page);
    await open(page);
    await page.locator('[name="formula"][value="tanaka"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-thr-max]')).toHaveText('187');
    await expect(zoneBpm(page, 'very-light')).toHaveText('129 - 140');
    await page.locator('[name="formula"][value="nes"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-thr-max]')).toHaveText('192');
  });

  test('the Borg scales rename the column and never touch the bpm', async ({ page }) => {
    await calc(page);
    const before = await zoneBpm(page, 'moderate').textContent();
    await open(page);

    await page.locator('[name="scale"][value="borg"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-thr-column]')).toHaveText('Borg scale (6-20)');
    await expect(zoneScale(page, 'moderate')).toHaveText('13 - 15');
    await expect(zoneBpm(page, 'moderate')).toHaveText(before!);

    await page.locator('[name="scale"][value="borg-cr10"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-thr-column]')).toHaveText('Borg CR10 (0-10)');
    await expect(zoneScale(page, 'moderate')).toHaveText('5 - 6');
    await expect(zoneBpm(page, 'moderate')).toHaveText(before!);
  });
});

/* ---- Validation, live-after-first, reset --------------------------------- */

test('an empty submission focuses the age and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const age = page.locator('[name="age"]');
  await expect(age).toBeFocused();
  await expect(age).toHaveAttribute('aria-invalid', 'true');
  const errId = await age.getAttribute('aria-describedby');
  await expect(page.locator(`#${errId}`)).toHaveText('Enter your age.');
});

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calc(page);
  const ageBox = page.locator('[name="age"]');
  await ageBox.focus();
  await ageBox.fill('50');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-thr-max]')).toHaveText('170');
  await expect(ageBox).toBeFocused();
});

test('Clear empties every field and restores the defaults', async ({ page }) => {
  await calc(page);
  await page.locator('[data-settings-toggle]').click();
  await page.locator('[name="scale"][value="borg"]').check();
  await page.waitForTimeout(DEBOUNCE);
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  for (const name of ['age', 'measuredMaxHr', 'restingHr']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[name="mode"][value="age"]')).toBeChecked();
  await expect(page.locator('[name="formula"][value="haskell-fox"]')).toBeChecked();
  await expect(page.locator('[name="scale"][value="karvonen"]')).toBeChecked();
  await expect(liveRegion(page)).toHaveText('');
});

test('announces the aerobic span only, never the table', async ({ page }) => {
  await calc(page);
  await expect(liveRegion(page)).toHaveText(
    'Your target heart rate for aerobic exercise is 130 to 172 beats per minute.',
  );
  await expect(liveRegion(page)).not.toContainText(/very light|vo2|142/i);
});

/* ---- Responsive / theme / embed / monetization -------------------------- */

test('desktop shows the result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page);
  await expect(low(page)).toBeInViewport();
});

test('mobile stacks inputs → action → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calc(page);
  await expect(low(page)).toHaveText('130');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page);
  await expect(low(page)).toBeVisible();
});

test('the zone colour is never the only signal', async ({ page }) => {
  await calc(page);
  // Every row names its intensity in words and writes its band out in full.
  const table = page.locator('#thr-result table.thr-zones');
  await expect(table.locator('tbody th[scope="row"]')).toHaveCount(5);
  for (const key of ['very-light', 'light', 'moderate', 'hard', 'vo2max']) {
    await expect(zoneScale(page, key)).not.toHaveText('');
    await expect(zoneBpm(page, key)).not.toHaveText('');
  }
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/health/target-heart-rate-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="age"]', '30');
  await page.fill('[name="restingHr"]', '70');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#thr-result [data-thr-low]')).toHaveText('130');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});

test('Clear from Test result brings the Age box back, not just the radio', async ({ page }) => {
  // resetValues restores the radio silently; without a re-sync the form would claim
  // "Estimate from age" while the age box stayed hidden and unusable.
  await page.locator('[name="mode"][value="test"]').check();
  await page.fill('[name="measuredMaxHr"]', '200');
  await page.fill('[name="restingHr"]', '70');
  await submit(page).click();
  await page.click('[data-reset]');
  await expect(page.locator('[name="mode"][value="age"]')).toBeChecked();
  await expect(page.locator('[name="age"]')).toBeVisible();
  await expect(page.locator('[name="measuredMaxHr"]')).toBeHidden();
  // And the form still works.
  await calc(page);
  await expect(low(page)).toHaveText('130');
});

test('no figure from a previous calculation is ever on screen after Clear', async ({ page }) => {
  await page.locator('[name="mode"][value="test"]').check();
  await page.fill('[name="measuredMaxHr"]', '200');
  await page.fill('[name="restingHr"]', '70');
  await submit(page).click();
  await expect(page.locator('[data-thr-max]')).toHaveText('200');

  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(page.locator('[data-thr-max]')).toBeHidden();

  // A failed submit must not surface it either.
  await page.fill('[name="age"]', '30');
  await page.fill('[name="restingHr"]', '5');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-thr-max]')).toBeHidden();

  // And a good one replaces it outright.
  await page.fill('[name="restingHr"]', '70');
  await submit(page).click();
  await expect(page.locator('[data-thr-max]')).toHaveText('190');
});
