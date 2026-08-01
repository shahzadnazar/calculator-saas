import { test, expect, type Page } from '@playwright/test';

/**
 * Descriptive-statistics — R13B1 task-first ATOMIC migration (Statistics +
 * Standard Deviation, 2 of 2). ONE shared island (StatisticsCalculator) serves
 * both routes via the `primary` prop; the two routes share the UNCHANGED
 * statistics.ts formula and the statistics-form binding. The complete-result
 * guard lives in the binding's resultValue (a NaN sentinel — NO isUsableResult).
 * Task-first: the data-set textarea starts empty, the visitor presses the
 * route-specific Calculate button for the first result, live-after-first after.
 * The binding REJECTS invalid tokens (unlike the lenient formula parse); n = 1
 * is a valid result with sample dispersion + quartiles shown "Not available".
 */

const DEBOUNCE = 300;
const DATA = '2, 4, 4, 4, 5, 5, 7, 9'; // mean 5, median 4.5, mode 4, popSD 2, sampleSD 2.1381

type RouteCfg = {
  route: string;
  embed: string;
  primary: 'summary' | 'sd';
  label: string;
  dominant: string; // the dominant hero value for DATA
};
const ROUTES: RouteCfg[] = [
  { route: '/math/statistics-calculator', embed: '/embed/math/statistics-calculator', primary: 'summary', label: 'Calculate Statistics', dominant: '5' },
  { route: '/math/standard-deviation-calculator', embed: '/embed/math/standard-deviation-calculator', primary: 'sd', label: 'Calculate Standard Deviation', dominant: '2.1381' },
];

const shell = (page: Page) => page.locator('#stat-result');
const submit = (page: Page) => page.locator('[data-stat-submit]');
const input = (page: Page) => page.locator('[name="values"]');
const live = (page: Page) => page.locator('#stat-live');
const fieldError = (page: Page) => page.locator('[data-error-for="values"]');
const dominant = (page: Page) => page.locator('#stat-result [data-result-value]');
const interp = (page: Page) => page.locator('[data-stat-interpretation]');
const region = (page: Page, when: string) => page.locator(`#stat-result [data-result-when~="${when}"]`);
// Grid cell (scoped to the descriptive grid, not the hero). `.first()` where a key repeats (median).
const gridStat = (page: Page, key: string) => page.locator(`#stat-result .stat-group [data-stat="${key}"]`).first();

for (const cfg of ROUTES) {
  test.describe(`statistics (${cfg.primary}): ${cfg.route}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(cfg.route, { waitUntil: 'domcontentloaded' });
    });

    /* ---- Initial state -------------------------------------------------- */

    test('loads task-first: empty textarea, empty result, route action label, no auto-calc', async ({ page }) => {
      await expect(input(page)).toHaveValue('');
      await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
      await expect(submit(page)).toHaveText(cfg.label);
      await page.waitForTimeout(DEBOUNCE);
      await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    });

    /* ---- Ordinary calculation ------------------------------------------ */

    test('an ordinary data set produces the correct dominant + grid values', async ({ page }) => {
      await input(page).fill(DATA);
      await submit(page).click();
      await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
      await expect(dominant(page)).toHaveText(cfg.dominant);
      // The full grid is identical for both routes.
      await expect(gridStat(page, 'mean')).toHaveText('5');
      await expect(gridStat(page, 'popSD')).toHaveText('2');
      await expect(gridStat(page, 'sampleSD')).toHaveText('2.1381');
      await expect(gridStat(page, 'range')).toHaveText('7');
      await expect(gridStat(page, 'iqr')).toHaveText('2');
      await expect(gridStat(page, 'q1')).toHaveText('4');
      await expect(gridStat(page, 'q3')).toHaveText('6');
      await expect(gridStat(page, 'count')).toHaveText('8');
      await expect(gridStat(page, 'sum')).toHaveText('40');
      await expect(gridStat(page, 'mode')).toHaveText('4');
    });

    test('no NaN / Infinity / undefined renders for a valid result', async ({ page }) => {
      await input(page).fill(DATA);
      await submit(page).click();
      expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
    });

    /* ---- Token validation ---------------------------------------------- */

    test('an invalid token is rejected: invalid state, error, focus, no result', async ({ page }) => {
      await input(page).fill('2, 4, oops, 8');
      await submit(page).click();
      await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
      await expect(fieldError(page)).toBeVisible();
      await expect(fieldError(page)).toContainText('Remove invalid values');
      await expect(input(page)).toBeFocused();
      await expect(region(page, 'valid')).toBeHidden();
    });

    test('the textarea is associated with its error via aria-describedby / data-error-for', async ({ page }) => {
      await input(page).fill('x');
      await submit(page).click();
      await expect(input(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(input(page)).toHaveAttribute('aria-describedby', /stat-values-error/);
      await expect(page.locator('#stat-values-error')).toHaveAttribute('data-error-for', 'values');
    });

    test('an empty submission asks for at least one number and focuses the textarea', async ({ page }) => {
      await submit(page).click();
      await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
      await expect(fieldError(page)).toContainText('Enter at least one number');
      await expect(input(page)).toBeFocused();
    });

    /* ---- One value ----------------------------------------------------- */

    test('one value is valid: population 0, sample dispersion + quartiles "Not available"', async ({ page }) => {
      await input(page).fill('5');
      await submit(page).click();
      await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
      await expect(gridStat(page, 'popSD')).toHaveText('0');
      await expect(gridStat(page, 'sampleSD')).toHaveText('Not available');
      await expect(gridStat(page, 'sampleVar')).toHaveText('Not available');
      await expect(gridStat(page, 'q1')).toHaveText('Not available');
      await expect(gridStat(page, 'iqr')).toHaveText('Not available');
      await expect(gridStat(page, 'mean')).toHaveText('5');
    });

    /* ---- Live-after-first ---------------------------------------------- */

    test('after the first result, valid edits update live and keep textarea focus (no scroll)', async ({ page }) => {
      await input(page).fill('2, 4, 6, 8');
      await submit(page).click();
      await expect(gridStat(page, 'mean')).toHaveText('5');
      const before = await page.evaluate(() => window.scrollY);
      await input(page).focus();
      await input(page).fill('2, 4, 6, 8, 10'); // mean 6
      await page.waitForTimeout(DEBOUNCE);
      await expect(gridStat(page, 'mean')).toHaveText('6');
      await expect(input(page)).toBeFocused();
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
    });

    test('an invalid live edit clears the stale grid and shows guidance', async ({ page }) => {
      await input(page).fill(DATA);
      await submit(page).click();
      await expect(dominant(page)).toHaveText(cfg.dominant);
      await input(page).fill(`${DATA}, oops`);
      await page.waitForTimeout(DEBOUNCE);
      await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
      await expect(region(page, 'valid')).toBeHidden();
      await expect(dominant(page)).toHaveText('—'); // stale value cleared, not just hidden
    });

    /* ---- Announcement / reset / keyboard ------------------------------- */

    test('reset clears the textarea, result and announcement, and does not calculate', async ({ page }) => {
      await input(page).fill(DATA);
      await submit(page).click();
      await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
      await page.locator('[data-reset]').click();
      await expect(input(page)).toHaveValue('');
      await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
      await expect(live(page)).toHaveText('');
    });

    test('keyboard submission (Enter on the focused Calculate button) computes', async ({ page }) => {
      await input(page).fill('2, 4, 6, 8');
      await submit(page).focus();
      await submit(page).press('Enter');
      await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
      await expect(gridStat(page, 'mean')).toHaveText('5');
    });

    /* ---- Responsive / embed / monetization ----------------------------- */

    test('desktop: the dominant result is within the first viewport at 1366×768', async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await input(page).fill(DATA);
      await submit(page).click();
      await expect(dominant(page)).toBeInViewport();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test('mobile does not overflow horizontally', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(cfg.route, { waitUntil: 'domcontentloaded' });
      await input(page).fill(DATA);
      await submit(page).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test('renders in dark scheme', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await input(page).fill(DATA);
      await submit(page).click();
      await expect(dominant(page)).toBeVisible();
    });

    test('the generated embed route mounts the same task-first island', async ({ page }) => {
      await page.goto(cfg.embed, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#stat-result')).toHaveAttribute('data-result-state', 'empty');
      await expect(page.locator('[data-stat-submit]')).toHaveText(cfg.label);
      await page.locator('[name="values"]').fill(DATA);
      await page.locator('[data-stat-submit]').click();
      await expect(page.locator('#stat-result')).toHaveAttribute('data-result-state', 'valid');
      await expect(page.locator('#stat-result [data-result-value]')).toHaveText(cfg.dominant);
    });

    test('the live page carries no monetization output', async ({ page }) => {
      await expect(page.locator('[data-mon-region]')).toHaveCount(0);
      expect(await page.content()).not.toContain('data-mon-');
    });
  });
}

/* ---- Route-specific hero + announcement --------------------------------- */

test.describe('statistics: route-specific hero + announcement', () => {
  test('summary route features the mean and announces count + mean', async ({ page }) => {
    await page.goto('/math/statistics-calculator', { waitUntil: 'domcontentloaded' });
    await input(page).fill(DATA);
    await submit(page).click();
    await expect(dominant(page)).toHaveText('5'); // mean is dominant
    await expect(live(page)).toHaveText('Statistics calculated for 8 values. The mean is 5.');
    await expect(interp(page)).toContainText('the mean is 5');
  });

  test('sd route features the sample SD and announces it', async ({ page }) => {
    await page.goto('/math/standard-deviation-calculator', { waitUntil: 'domcontentloaded' });
    await input(page).fill('2, 4, 6, 8');
    await submit(page).click();
    await expect(dominant(page)).toHaveText('2.582'); // sample SD is dominant
    await expect(live(page)).toHaveText('The sample standard deviation is 2.582.');
  });

  test('sd route, one value: sample SD "Not available", population 0, clear announcement', async ({ page }) => {
    await page.goto('/math/standard-deviation-calculator', { waitUntil: 'domcontentloaded' });
    await input(page).fill('7');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('Not available'); // sample SD dominant, unavailable at n=1
    await expect(live(page)).toHaveText(
      'The population standard deviation is 0. Sample standard deviation is not available for one value.',
    );
  });
});

/* ---- Guide embed regression --------------------------------------------- */

test.describe('guide: standard-deviation-explained embeds one task-first island', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guides/standard-deviation-explained', { waitUntil: 'domcontentloaded' });
  });

  test('exactly one calculator instance, task-first, with the SD action label', async ({ page }) => {
    await expect(page.locator('[data-stats]')).toHaveCount(1);
    await expect(page.locator('#stat-result')).toHaveAttribute('data-result-state', 'empty');
    await expect(page.locator('[name="values"]')).toHaveValue('');
    await expect(page.locator('[data-stat-submit]')).toHaveText('Calculate Standard Deviation');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1); // no duplicate H1 from the island
  });

  test('the embedded island calculates on explicit submit', async ({ page }) => {
    await page.locator('[name="values"]').fill('2, 4, 6, 8');
    await page.locator('[data-stat-submit]').click();
    await expect(page.locator('#stat-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#stat-result [data-result-value]')).toHaveText('2.582');
  });
});
