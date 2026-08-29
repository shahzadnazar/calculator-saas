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
const DATA = '2, 4, 4, 4, 5, 5, 7, 9'; // mean 5, median 4.5, mode 4 (×3), popSD 2, sampleSD 2.1380899352994

type RouteCfg = {
  route: string;
  embed: string;
  primary: 'summary' | 'sd';
  label: string;
  dominant: string; // the dominant hero value for DATA
};
const ROUTES: RouteCfg[] = [
  { route: '/math/statistics-calculator', embed: '/embed/math/statistics-calculator', primary: 'summary', label: 'Calculate Statistics', dominant: '5' },
  { route: '/math/standard-deviation-calculator', embed: '/embed/math/standard-deviation-calculator', primary: 'sd', label: 'Calculate Standard Deviation', dominant: '2.1380899352994' },
];

const shell = (page: Page) => page.locator('#stat-result');
const submit = (page: Page) => page.locator('[data-stat-submit]');
const input = (page: Page) => page.locator('[name="values"]');
const live = (page: Page) => page.locator('#stat-live');
const fieldError = (page: Page) => page.locator('[data-error-for="values"]');
const dominant = (page: Page) => page.locator('#stat-result [data-result-value]');
const interp = (page: Page) => page.locator('[data-stat-interpretation]');
const region = (page: Page, when: string) => page.locator(`#stat-result [data-result-when~="${when}"]`);

/** Resolve once the page has stopped scrolling — the calculate-then-scroll is smooth, so a reading
 *  taken straight after the result appears can land mid-animation. */
async function settledScrollY(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let last = window.scrollY;
        let still = 0;
        const tick = () => {
          if (window.scrollY === last) still += 1;
          else {
            still = 0;
            last = window.scrollY;
          }
          if (still >= 5) resolve(window.scrollY);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}
// A cell of the result TABLE (never the hero, which repeats several of the same keys).
const gridStat = (page: Page, key: string) => page.locator(`#stat-result td[data-stat="${key}"]`).first();
const sortedData = (page: Page) => page.locator('#stat-result [data-stat="sorted"]');

for (const cfg of ROUTES) {
  test.describe(`statistics (${cfg.primary}): ${cfg.route}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(cfg.route, { waitUntil: 'domcontentloaded' });
    });

    /* ---- Initial state -------------------------------------------------- */

    test('loads task-first: empty textarea, empty result, route action label, no auto-calc', async ({ page }) => {
      await expect(input(page)).toHaveValue('');
      await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
      await expect(submit(page)).toHaveText(cfg.label);
      await page.waitForTimeout(DEBOUNCE);
      await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
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
      await expect(gridStat(page, 'sampleSD')).toHaveText('2.1380899352994');
      await expect(gridStat(page, 'range')).toHaveText('7');
      await expect(gridStat(page, 'count')).toHaveText('8');
      await expect(gridStat(page, 'sum')).toHaveText('40');
      await expect(gridStat(page, 'mode')).toHaveText('4, appeared 3 times');
      await expect(gridStat(page, 'gm')).toHaveText('4.6032155960467');
      await expect(sortedData(page)).toHaveText('2, 4, 4, 4, 5, 5, 7, 9');
    });

    /**
     * The reference's own worked example, printed from its page. This is the comparison a visitor
     * actually makes: our table against theirs, row by row.
     */
    test('reproduces the reference result table for 10, 2, 38, 23, 38, 23, 21, 23', async ({ page }) => {
      await input(page).fill('10, 2, 38, 23, 38, 23, 21, 23');
      await submit(page).click();
      await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
      for (const [key, text] of [
        ['count', '8'],
        ['sum', '178'],
        ['mean', '22.25'],
        ['median', '23'],
        ['mode', '23, appeared 3 times'],
        ['max', '38'],
        ['min', '2'],
        ['range', '36'],
        ['gm', '17.119851726053'],
        ['popSD', '11.508149286484'],
        ['popVar', '132.4375'],
        ['sampleSD', '12.302729081677'],
        ['sampleVar', '151.35714285714'],
      ] as const) {
        await expect(gridStat(page, key), key).toHaveText(text);
      }
      await expect(sortedData(page)).toHaveText('2, 10, 21, 23, 23, 23, 38, 38');
    });

    test('the table names its rows the way the reference names them', async ({ page }) => {
      await input(page).fill(DATA);
      await submit(page).click();
      const labels = await page.locator('#stat-result table:not(.stat-table--plain) th').allTextContents();
      expect(labels.map((t) => t.trim())).toEqual([
        'Count', 'Sum', 'Mean (Average)', 'Median', 'Mode', 'Largest', 'Smallest', 'Range',
        'Geometric Mean', 'Standard Deviation (σ)', 'Variance (σ²)',
        'Sample Standard Deviation (s)', 'Sample Variance (s²)',
      ]);
    });

    test('says the geometric mean is undefined rather than printing a meaningless number', async ({ page }) => {
      await input(page).fill('0, 4, 9');
      await submit(page).click();
      await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
      await expect(gridStat(page, 'gm')).toHaveText('Not defined for zero or negative values');
      await expect(gridStat(page, 'mean')).toHaveText('4.3333333333333');
    });

    test('the quartiles the reference does not report are still there, under their own heading', async ({ page }) => {
      await input(page).fill(DATA);
      await submit(page).click();
      const details = page.locator('#stat-result .stat-more');
      await expect(details.locator('summary')).toHaveText('Quartiles');
      await details.locator('summary').click();
      await expect(page.locator('#stat-result .stat-table--plain td[data-stat="q1"]')).toHaveText('4');
      await expect(page.locator('#stat-result .stat-table--plain td[data-stat="q3"]')).toHaveText('6');
      await expect(page.locator('#stat-result .stat-table--plain td[data-stat="iqr"]')).toHaveText('2');
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
      await expect(page.locator('#stat-result .stat-table--plain td[data-stat="q1"]')).toHaveText('Not available');
      await expect(page.locator('#stat-result .stat-table--plain td[data-stat="iqr"]')).toHaveText('Not available');
      await expect(gridStat(page, 'mean')).toHaveText('5');
    });

    /* ---- Live-after-first ---------------------------------------------- */

    test('after the first result, valid edits update live and keep textarea focus (no scroll)', async ({ page }) => {
      await input(page).fill('2, 4, 6, 8');
      await submit(page).click();
      await expect(gridStat(page, 'mean')).toHaveText('5');
      await input(page).focus();
      // Measured once the calculate-then-scroll has SETTLED and after focusing: the contract is that
      // the LIVE UPDATE does not move the page, not that nothing ever scrolls before it.
      const before = await settledScrollY(page);
      await input(page).fill('2, 4, 6, 8, 10'); // mean 6
      await page.waitForTimeout(DEBOUNCE);
      await expect(gridStat(page, 'mean')).toHaveText('6');
      await expect(input(page)).toBeFocused();
      expect(await settledScrollY(page)).toBe(before);
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
      await expect(page.locator('#stat-result')).toHaveAttribute('data-result-state', 'example');
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
    await expect(dominant(page)).toHaveText('2.5819888974716'); // sample SD is dominant
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
    await expect(page.locator('#stat-result')).toHaveAttribute('data-result-state', 'example');
    await expect(page.locator('[name="values"]')).toHaveValue('');
    await expect(page.locator('[data-stat-submit]')).toHaveText('Calculate Standard Deviation');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1); // no duplicate H1 from the island
  });

  test('the embedded island calculates on explicit submit', async ({ page }) => {
    await page.locator('[name="values"]').fill('2, 4, 6, 8');
    await page.locator('[data-stat-submit]').click();
    await expect(page.locator('#stat-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#stat-result [data-result-value]')).toHaveText('2.5819888974716');
  });
});

/* ------------------------------------------------------------------ */
/* The accumulator keypad — the reference's panel above the list box   */
/* ------------------------------------------------------------------ */

test.describe('statistics keypad', () => {
  const ROUTE = '/math/statistics-calculator';
  const kp = (page: Page) => page.locator('[data-stats-keypad]');
  const display = (page: Page) => page.locator('[data-sk-display]');
  const note = (page: Page) => page.locator('[data-sk-note]');
  const key = (page: Page, k: string) => kp(page).locator(`[data-sk-key="${k}"]`).click();

  async function typeNumber(page: Page, text: string) {
    for (const c of text) await key(page, c === '.' ? 'dot' : `digit:${c}`);
  }
  async function enter(page: Page, values: number[]) {
    for (const v of values) {
      await typeNumber(page, String(v));
      await key(page, 'add');
    }
  }

  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('offers the reference keys, each labelled with what it does', async ({ page }) => {
    for (const [k, name] of [
      ['stat:mean', 'Mean'],
      ['stat:meanOfSquares', 'Mean of squares'],
      ['stat:sum', 'Sum'],
      ['stat:sumOfSquares', 'Sum of squares'],
      ['stat:popSD', 'Population SD'],
      ['stat:popVar', 'Population variance'],
      ['stat:sampleSD', 'Sample SD'],
      ['stat:sampleVar', 'Sample variance'],
      ['stat:gm', 'Geometric mean'],
    ] as const) {
      await expect(kp(page).locator(`[data-sk-key="${k}"] .sk-key__name`)).toHaveText(name);
    }
    for (const k of ['digit:0', 'dot', 'exp', 'sign', 'add', 'clearEntry', 'clearAll']) {
      await expect(kp(page).locator(`[data-sk-key="${k}"]`)).toHaveCount(1);
    }
  });

  test('starts empty and adds values one at a time', async ({ page }) => {
    await expect(display(page)).toHaveText('0');
    await expect(page.locator('[data-sk-count]')).toHaveText('0');
    await expect(page.locator('[data-sk-empty]')).toBeVisible();
    await enter(page, [10, 2, 38]);
    await expect(page.locator('[data-sk-count]')).toHaveText('3');
    await expect(page.locator('[data-sk-list] .sk-row')).toHaveCount(3);
    await expect(page.locator('[data-sk-empty]')).toBeHidden();
  });

  test('every function key reports the reference figure', async ({ page }) => {
    await enter(page, [10, 2, 38, 23, 38, 23, 21, 23]);
    for (const [k, value] of [
      ['stat:mean', '22.25'],
      ['stat:meanOfSquares', '627.5'],
      ['stat:sum', '178'],
      ['stat:sumOfSquares', '5020'],
      ['stat:popSD', '11.508149286484'],
      ['stat:popVar', '132.4375'],
      ['stat:sampleSD', '12.302729081677'],
      ['stat:sampleVar', '151.35714285714'],
      ['stat:gm', '17.119851726053'],
    ] as const) {
      await key(page, k);
      await expect(display(page), k).toHaveText(value);
    }
  });

  test('a typed-but-unadded value blocks a statistic and says what to press', async ({ page }) => {
    await enter(page, [2, 4]);
    await typeNumber(page, '99');
    await key(page, 'stat:mean');
    await expect(note(page)).toContainText('Press ADD');
    await expect(display(page)).toHaveText('99'); // never a mean of a set the visitor did not mean
    await key(page, 'add');
    await key(page, 'stat:mean');
    await expect(display(page)).toHaveText('35');
  });

  test('says why a statistic is unavailable rather than printing NaN', async ({ page }) => {
    await key(page, 'stat:mean');
    await expect(note(page)).toContainText('Add at least one value');
    await expect(display(page)).toHaveText('—');

    await enter(page, [5]);
    await key(page, 'stat:sampleSD');
    await expect(note(page)).toContainText('at least two values');

    await key(page, 'clearAll');
    await enter(page, [0, 4, 9]);
    await key(page, 'stat:gm');
    await expect(note(page)).toContainText('every value to be positive');
    await expect(kp(page)).not.toContainText(/NaN|Infinity|undefined/);
  });

  test('sign, EXP, C and CAD behave', async ({ page }) => {
    await typeNumber(page, '15');
    await key(page, 'sign');
    await expect(display(page)).toHaveText('-15');
    await key(page, 'exp');
    await typeNumber(page, '3');
    await key(page, 'add');
    await expect(display(page)).toHaveText('-15000');

    await typeNumber(page, '12');
    await key(page, 'clearEntry');
    await expect(display(page)).toHaveText('0');
    await expect(page.locator('[data-sk-count]')).toHaveText('1'); // C leaves the data alone

    await key(page, 'clearAll');
    await expect(page.locator('[data-sk-count]')).toHaveText('0');
  });

  test('a single value can be removed without clearing the set', async ({ page }) => {
    await enter(page, [1, 2, 3]);
    await page.locator('[data-sk-list] .sk-row__remove').nth(1).click();
    await expect(page.locator('[data-sk-count]')).toHaveText('2');
    await key(page, 'stat:sum');
    await expect(display(page)).toHaveText('4');
  });

  test('the keypad and the list box below are separate calculators', async ({ page }) => {
    await enter(page, [10, 2, 38]);
    await expect(input(page)).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');

    await input(page).fill('1, 2, 3');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('[data-sk-count]')).toHaveText('3'); // keypad data untouched
    await key(page, 'stat:sum');
    await expect(display(page)).toHaveText('50'); // its own set, not the textarea's
  });

  test('announces what happened once, in one live region', async ({ page }) => {
    await expect(kp(page).locator('[aria-live]')).toHaveCount(1);
    await enter(page, [4]);
    await expect(kp(page).locator('[data-sk-live]')).toContainText('Added 4');
  });

  test('the standard deviation route has no keypad', async ({ page }) => {
    await page.goto('/math/standard-deviation-calculator', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-stats-keypad]')).toHaveCount(0);
  });

  test('mobile: keys stay tappable and nothing overflows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    const box = await kp(page).locator('[data-sk-key="add"]').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await enter(page, [10, 2, 38]);
    await key(page, 'stat:mean');
    await expect(display(page)).toHaveText('16.666666666667');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
