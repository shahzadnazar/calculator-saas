import { test, expect, type Page } from '@playwright/test';

/**
 * Pace — the three-way solver, plus the multipoint splits and the finish-time projection
 * the same page carries.
 *
 * Time, distance and pace are one relationship, so the form has three targets rather than
 * three calculators. The box being solved for locks, and the answer is written back into it.
 */
const ROUTE = '/health/pace-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#pc-result');
const value = (page: Page) => page.locator('#pc-result [data-pace-value]');
const unit = (page: Page) => page.locator('#pc-result [data-pace-unit]');
const fact = (page: Page, key: string) => page.locator(`#pc-result [data-pace-${key}]`);
const equiv = (page: Page, key: string) => page.locator(`#pc-result [data-equiv="${key}"]`);
const liveRegion = (page: Page) => page.locator('#pc-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#pc-result [data-result-when~="${when}"]`);

/** 6 miles in 48:00 → 8:00 per mile. */
const calcPace = async (page: Page) => {
  await page.fill('[name="m"]', '48');
  await page.fill('[name="distance"]', '6');
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- The solver --------------------------------------------------------- */

test.describe('the three-way solver', () => {
  test('offers the three targets and opens on Pace', async ({ page }) => {
    const labels = await page.locator('.pc-radios label').allTextContents();
    expect(labels.map((l) => l.trim())).toEqual(['Pace', 'Time', 'Distance']);
    await expect(page.locator('[name="solveFor"][value="pace"]')).toBeChecked();
  });

  test('locks the box it is working out, and only that one', async ({ page }) => {
    await expect(page.locator('[name="paceMin"]')).toHaveJSProperty('readOnly', true);
    await expect(page.locator('[name="m"]')).toHaveJSProperty('readOnly', false);
    await expect(page.locator('[name="distance"]')).toHaveJSProperty('readOnly', false);

    await page.locator('[name="solveFor"][value="time"]').check();
    await expect(page.locator('[name="m"]')).toHaveJSProperty('readOnly', true);
    await expect(page.locator('[name="paceMin"]')).toHaveJSProperty('readOnly', false);
  });

  test('finds the pace from a time and a distance', async ({ page }) => {
    await calcPace(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(value(page)).toHaveText('8:00');
    await expect(unit(page)).toHaveText('per Mile');
    await expect(fact(page, 'time')).toHaveText('48:00');
    await expect(fact(page, 'distance')).toHaveText('6 Miles');
    await expect(fact(page, 'pace')).toHaveText('8:00 per Mile');
    await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
  });

  test('finds the time from a distance and a pace', async ({ page }) => {
    await page.locator('[name="solveFor"][value="time"]').check();
    await page.fill('[name="distance"]', '6');
    await page.fill('[name="paceMin"]', '8');
    await page.fill('[name="paceSec"]', '0');
    await submit(page).click();
    await expect(value(page)).toHaveText('48:00');
    await expect(fact(page, 'time')).toHaveText('48:00');
  });

  test('finds the distance from a time and a pace', async ({ page }) => {
    await page.locator('[name="solveFor"][value="distance"]').check();
    await page.fill('[name="m"]', '48');
    await page.fill('[name="paceMin"]', '8');
    await page.fill('[name="paceSec"]', '0');
    await submit(page).click();
    await expect(value(page)).toHaveText('6');
    await expect(unit(page)).toHaveText('Miles');
  });

  test('writes the answer back into its own box, so it carries into the next sum', async ({ page }) => {
    await calcPace(page);
    await expect(page.locator('[name="paceMin"]')).toHaveValue('8');
    await expect(page.locator('[name="paceSec"]')).toHaveValue('0');
  });

  test('reports the same run in the other units', async ({ page }) => {
    await calcPace(page);
    await expect(fact(page, 'permi')).toHaveText('8:00 / mile');
    await expect(fact(page, 'perkm')).toHaveText('4:58 / km');
    await expect(fact(page, 'mph')).toHaveText('7.50 mph');
    await expect(fact(page, 'kmh')).toHaveText('12.07 km/h');
  });

  test('the pace unit is independent of the distance unit', async ({ page }) => {
    await page.selectOption('[name="distanceUnit"]', 'km');
    await page.selectOption('[name="paceUnit"]', 'mi');
    await page.fill('[name="m"]', '50');
    await page.fill('[name="distance"]', '10');
    await submit(page).click();
    await expect(value(page)).toHaveText('8:03'); // 5:00/km per mile
    await expect(unit(page)).toHaveText('per Mile');
    await expect(fact(page, 'perkm')).toHaveText('5:00 / km');
  });

  test('a common-distance chip fills the box in the selected unit', async ({ page }) => {
    await page.selectOption('[name="distanceUnit"]', 'km');
    await page.locator('[data-race="marathon"]').click();
    await expect(page.locator('[name="distance"]')).toHaveValue('42.195');
    await page.selectOption('[name="distanceUnit"]', 'mi');
    await page.locator('[data-race="marathon"]').click();
    await expect(page.locator('[name="distance"]')).toHaveValue('26.2188');
  });
});

/* ---- Equivalent times ---------------------------------------------------- */

test.describe('equivalent finish times', () => {
  test('reports every standard distance at the solved pace', async ({ page }) => {
    await calcPace(page);
    await expect(equiv(page, '1mi')).toHaveText('8:00');
    await expect(equiv(page, '5k')).toHaveText('24:51');
    await expect(equiv(page, '10k')).toHaveText('49:43');
    await expect(equiv(page, 'half')).toHaveText('1:44:53');
    await expect(equiv(page, 'marathon')).toHaveText('3:29:45');
  });

  test('the times rise with distance, always', async ({ page }) => {
    await calcPace(page);
    const keys = ['1k', '1mi', '5k', '10k', 'half', 'marathon'];
    const toSeconds = (t: string) => {
      const parts = t.split(':').map(Number);
      return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    };
    const values = [];
    for (const k of keys) values.push(toSeconds((await equiv(page, k).textContent())!));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });
});

/* ---- Validation ---------------------------------------------------------- */

test.describe('validation', () => {
  test('asks only for the two boxes it reads', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="time"]')).toHaveText('Enter a time.');
    await expect(page.locator('[data-error-for="distance"]')).toHaveText('Enter a distance.');
    await expect(page.locator('[data-error-for="pace"]')).toBeHidden();
  });

  test('never rolls 60 seconds into the next minute — it says so', async ({ page }) => {
    await page.fill('[name="m"]', '10');
    await page.fill('[name="s"]', '60');
    await page.fill('[name="distance"]', '2');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="time"]')).toHaveText('Enter seconds from 0 to 59.');
  });

  test('an all-zero time is not a duration', async ({ page }) => {
    await page.fill('[name="h"]', '0');
    await page.fill('[name="m"]', '0');
    await page.fill('[name="s"]', '0');
    await page.fill('[name="distance"]', '6');
    await submit(page).click();
    await expect(page.locator('[data-error-for="time"]')).toHaveText('Enter a time greater than zero.');
  });

  test('a zero distance is refused rather than dividing by it', async ({ page }) => {
    await page.fill('[name="m"]', '48');
    await page.fill('[name="distance"]', '0');
    await submit(page).click();
    await expect(page.locator('[data-error-for="distance"]')).toHaveText('Enter a distance greater than zero.');
    await expect(shell(page)).not.toContainText(/NaN|Infinity/);
  });
});

/* ---- Live-after-first, reset, announcement -------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcPace(page);
  const d = page.locator('[name="distance"]');
  await d.focus();
  await d.fill('12');
  await page.waitForTimeout(DEBOUNCE);
  await expect(value(page)).toHaveText('4:00');
  await expect(d).toBeFocused();
});

test('Clear empties every box and unlocks the right one', async ({ page }) => {
  await page.locator('[name="solveFor"][value="time"]').check();
  await page.fill('[name="distance"]', '6');
  await page.fill('[name="paceMin"]', '8');
  await page.fill('[name="paceSec"]', '0');
  await submit(page).click();
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(page.locator('[name="solveFor"][value="pace"]')).toBeChecked();
  // The reset restores the radio silently; the lock must follow it.
  await expect(page.locator('[name="m"]')).toHaveJSProperty('readOnly', false);
  await expect(page.locator('[name="paceMin"]')).toHaveJSProperty('readOnly', true);
  for (const name of ['h', 'm', 's', 'distance', 'paceMin', 'paceSec']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
});

test('announces the figure that was asked for, and nothing else', async ({ page }) => {
  await calcPace(page);
  await expect(liveRegion(page)).toHaveText('Your pace is 8:00 per Mile.');
  await expect(liveRegion(page)).not.toContainText(/marathon|3:29/i);
});

test('loads with empty boxes and a labelled example result', async ({ page }) => {
  for (const name of ['h', 'm', 's', 'distance', 'paceMin', 'paceSec']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(region(page, 'empty')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Multipoint Pace Calculator ------------------------------------------ */

test.describe('Multipoint Pace Calculator', () => {
  const fillPoint = async (page: Page, row: number, distance: string, h: string, m: string, s: string) => {
    const tr = page.locator(`[data-mp-row="${row}"]`);
    await tr.locator('[data-mp-distance]').fill(distance);
    await tr.locator('[data-mp-h]').fill(h);
    await tr.locator('[data-mp-m]').fill(m);
    await tr.locator('[data-mp-s]').fill(s);
  };

  test('sits under the main calculator as its own tool', async ({ page }) => {
    const mp = page.locator('[data-multipoint]');
    await expect(mp.getByRole('heading', { name: 'Multipoint Pace Calculator' })).toBeVisible();
    const main = (await page.locator('[data-pace]').boundingBox())!;
    expect((await mp.boundingBox())!.y).toBeGreaterThanOrEqual(main.y + main.height - 1);
  });

  test('measures the first leg from the start line and each later one from the point before', async ({ page }) => {
    await page.selectOption('[name="mpUnit"]', 'km');
    await fillPoint(page, 0, '1', '0', '5', '0');
    await fillPoint(page, 1, '2', '0', '10', '20');
    await fillPoint(page, 2, '5', '0', '25', '20');
    await page.locator('[data-mp-form] button[type="submit"]').click();
    const rows = page.locator('[data-mp-out] tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('5:00 / km');
    await expect(rows.nth(1)).toContainText('5:20 / km');
    await expect(rows.nth(2)).toContainText('5:00 / km');
    // The running average at the end: 25:20 over 5 km.
    await expect(rows.nth(2)).toContainText('5:04 / km');
  });

  test('adds a point on request', async ({ page }) => {
    await expect(page.locator('[data-mp-row]')).toHaveCount(4);
    await page.locator('[data-mp-add]').click();
    await expect(page.locator('[data-mp-row]')).toHaveCount(5);
  });

  test('says what is wrong rather than showing a broken table', async ({ page }) => {
    await page.locator('[data-mp-form] button[type="submit"]').click();
    await expect(page.locator('[data-mp-error]')).toBeVisible();
    await expect(page.locator('[data-mp-results]')).toBeHidden();

    await fillPoint(page, 0, '1', '', '', '');
    await page.locator('[data-mp-form] button[type="submit"]').click();
    await expect(page.locator('[data-mp-error]')).toContainText('both a distance and a time');
    await expect(page.locator('[data-mp-results]')).toBeHidden();
  });

  test('a leg that covers no ground has no pace rather than a made-up one', async ({ page }) => {
    await page.selectOption('[name="mpUnit"]', 'km');
    await fillPoint(page, 0, '1', '0', '5', '0');
    await fillPoint(page, 1, '1', '0', '6', '0'); // stood still
    await page.locator('[data-mp-form] button[type="submit"]').click();
    const second = page.locator('[data-mp-out] tr').nth(1);
    await expect(second).toContainText('—');
    await expect(page.locator('[data-mp-results]')).not.toContainText(/NaN|Infinity/);
  });

  test('Clear empties it', async ({ page }) => {
    await page.selectOption('[name="mpUnit"]', 'km');
    await fillPoint(page, 0, '1', '0', '5', '0');
    await page.locator('[data-mp-form] button[type="submit"]').click();
    await expect(page.locator('[data-mp-results]')).toBeVisible();
    await page.locator('[data-mp-reset]').click();
    await expect(page.locator('[data-mp-results]')).toBeHidden();
    await expect(page.locator('[data-mp-row="0"] [data-mp-distance]')).toHaveValue('');
  });
});

/* ---- Finish Time Calculator ---------------------------------------------- */

test.describe('Finish Time Calculator', () => {
  const project = async (page: Page) => {
    await page.selectOption('[data-ft-unit]', 'km');
    await page.locator('[data-ft-covered]').fill('10');
    await page.locator('[data-ft-h]').fill('0');
    await page.locator('[data-ft-m]').fill('50');
    await page.locator('[data-ft-s]').fill('0');
    await page.locator('[data-ft-total]').fill('42.195');
    await page.locator('[data-ft-form] button[type="submit"]').click();
  };

  test('projects the whole race at the pace held so far', async ({ page }) => {
    await project(page);
    await expect(page.locator('[data-ft-finish]')).toHaveText('3:30:59');
    await expect(page.locator('[data-ft-pace]')).toContainText('5:00 / km');
    await expect(page.locator('[data-ft-remaining]')).toHaveText('32.2 kilometers');
    await expect(page.locator('[data-ft-remaining-time]')).toHaveText('2:40:59');
  });

  test('the remaining time plus the elapsed time is the finish time', async ({ page }) => {
    await project(page);
    const secs = (t: string) => {
      const p = t.split(':').map(Number);
      return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    };
    const finish = secs((await page.locator('[data-ft-finish]').textContent())!);
    const remaining = secs((await page.locator('[data-ft-remaining-time]').textContent())!);
    expect(remaining + 3000).toBe(finish);
  });

  test('refuses when there is nothing left to project', async ({ page }) => {
    await page.selectOption('[data-ft-unit]', 'km');
    await page.locator('[data-ft-covered]').fill('10');
    await page.locator('[data-ft-m]').fill('50');
    await page.locator('[data-ft-total]').fill('10');
    await page.locator('[data-ft-form] button[type="submit"]').click();
    await expect(page.locator('[data-ft-error]')).toContainText('longer than the distance');
    await expect(page.locator('[data-ft-results]')).toBeHidden();
  });

  test('a common-distance chip fills the total in the selected unit', async ({ page }) => {
    await page.selectOption('[data-ft-unit]', 'km');
    await page.locator('[data-ft-race]').last().click();
    await expect(page.locator('[data-ft-total]')).toHaveValue('42.195');
  });

  test('Clear empties it', async ({ page }) => {
    await project(page);
    await expect(page.locator('[data-ft-results]')).toBeVisible();
    await page.locator('[data-ft-reset]').click();
    await expect(page.locator('[data-ft-results]')).toBeHidden();
    await expect(page.locator('[data-ft-covered]')).toHaveValue('');
  });

  test('its Calculate never submits the main calculator', async ({ page }) => {
    await page.locator('[data-ft-form] button[type="submit"]').click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  });
});

/* ---- Responsive / theme / embed / monetization --------------------------- */

test('desktop shows the result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcPace(page);
  await expect(value(page)).toBeInViewport();
});

test('mobile stacks inputs → action → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcPace(page);
  await expect(value(page)).toHaveText('8:00');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcPace(page);
  await expect(value(page)).toBeVisible();
});

test('the embed route mounts the main calculator without the extra tools', async ({ page }) => {
  await page.goto('/embed/health/pace-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="m"]', '48');
  await page.fill('[name="distance"]', '6');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#pc-result [data-pace-value]')).toHaveText('8:00');
  await expect(page.locator('[data-multipoint]')).toHaveCount(0);
  await expect(page.locator('[data-finish]')).toHaveCount(0);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
