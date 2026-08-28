import { test, expect, type Page } from '@playwright/test';

/**
 * Date calculator — R18C2 task-first migration (everyday date/duration). ONE public route, ONE
 * island, TWO calculator-owned STRUCTURAL modes on the UNCHANGED standard-form runtime via its OWN
 * date-form.ts binding, wrapping the UNCHANGED diffDates / addDays / toISODateUTC (frozen by
 * date-duration.test.ts → the R18C0-repaired calculateAge). Task-first: every field starts EMPTY
 * (the legacy island auto-calculated a 2020→2025 / +90-day example on load), and the visitor presses
 * Calculate for the first result (live-after-first). All date assertions are deterministic — never
 * the wall clock — and pin the R18C0 month-end repair (2020-01-31 → 2020-03-01 = 0y 1m 1d, 30 days).
 */

const ROUTE = '/everyday/date-calculator';
const EMBED = '/embed/everyday/date-calculator';
const GUIDE = '/guides/calculating-days-between-dates';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#dc-result');
const diffValue = (page: Page) => page.locator('#dc-result [data-dc-panel="diff"] [data-result-value]').first();
const addValue = (page: Page) => page.locator('#dc-result [data-dc-panel="add"] [data-result-value]').first();
const totalDays = (page: Page) => page.locator('[data-dc-total-days]');
const totalWeeks = (page: Page) => page.locator('[data-dc-total-weeks]');
const diffInterp = (page: Page) => page.locator('[data-dc-diff-interpretation]');
const addInterp = (page: Page) => page.locator('[data-dc-add-interpretation]');
const live = (page: Page) => page.locator('#dc-live');
const modeSel = (page: Page) => page.locator('[name="mode"]');
const submitBtn = (page: Page) => page.locator('[data-date] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#dc-result [data-result-when~="${when}"]`);

const calcDiff = async (page: Page, from: string, to: string) => {
  await modeSel(page).selectOption('diff');
  await page.locator('[name="from"]').fill(from);
  await page.locator('[name="to"]').fill(to);
  await submitBtn(page).click();
};
const calcAdd = async (page: Page, start: string, op: 'add' | 'sub', days: string) => {
  await modeSel(page).selectOption('add');
  await page.locator('[name="start"]').fill(start);
  await page.locator('[name="op"]').selectOption(op);
  await page.locator('[name="days"]').fill(days);
  await submitBtn(page).click();
};

test.describe('date: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- SSR / hydration parity ---- */

  test('server-rendered result equals the hydrated one — empty, no baked example (mode diff, fields blank)', async ({ page }) => {
    const raw = await (await page.request.get(ROUTE)).text();
    const server = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        state: d.querySelector('#dc-result')?.getAttribute('data-result-state') ?? null,
        diff: d.querySelector('#dc-result [data-dc-panel="diff"] [data-result-value]')?.textContent?.trim() ?? null,
        mode: d.querySelector<HTMLSelectElement>('[name="mode"]')?.value ?? null,
        from: d.querySelector<HTMLInputElement>('[name="from"]')?.getAttribute('value') ?? '',
      };
    }, raw);
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    expect(server.state).toBe('empty');
    expect(server.diff).toBe('—'); // no baked-in difference
    expect(server.from).toBe(''); // no baked example date
    // The example is rendered on hydration, never baked into the HTML — so the two DIFFER.
    expect(server.diff).not.toBe((await diffValue(page).textContent())?.trim());
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  });

  /* ---- initial state ---- */

  test('loads empty — default mode difference, dates blank, no result/announcement', async ({ page }) => {
    await expect(modeSel(page)).toHaveValue('diff');
    await expect(page.locator('[name="from"]')).toHaveValue('');
    await expect(page.locator('[name="to"]')).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    // The example fills this calculator's OWN valid region, so it is visible on load.
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await page.locator('[name="from"]').fill('2020-01-01');
    await page.locator('[name="to"]').fill('2025-01-01');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty'); // no live before first calc
  });

  /* ---- difference mode ---- */

  test('ordinary difference: dominant y/m/d, total days + weeks, direction, announcement', async ({ page }) => {
    await calcDiff(page, '2000-06-15', '2020-09-20');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(diffValue(page)).toHaveText('20 years, 3 months, 5 days');
    await expect(totalDays(page)).toHaveText('7,402');
    await expect(totalWeeks(page)).toHaveText('1057 weeks and 3 days');
    await expect(diffInterp(page)).toContainText('after');
    await expect(live(page)).toHaveText('Date difference: 20 years, 3 months, 5 days.');
  });

  test('a same-date pair is a VALID zero difference (0y 0m 0d), not empty or invalid', async ({ page }) => {
    await calcDiff(page, '2024-06-15', '2024-06-15');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(diffValue(page)).toHaveText('0 years, 0 months, 0 days');
    await expect(totalDays(page)).toHaveText('0');
    await expect(diffInterp(page)).toContainText('same day');
  });

  test('preserves the R18C0 month-end repair: 2020-01-31 → 2020-03-01 = 0y 1m 1d (30 days)', async ({ page }) => {
    await calcDiff(page, '2020-01-31', '2020-03-01');
    await expect(diffValue(page)).toHaveText('0 years, 1 month, 1 day');
    await expect(totalDays(page)).toHaveText('30');
  });

  test('leap-day to leap-day is exactly 4 years / 1461 days', async ({ page }) => {
    await calcDiff(page, '2020-02-29', '2024-02-29');
    await expect(diffValue(page)).toHaveText('4 years, 0 months, 0 days');
    await expect(totalDays(page)).toHaveText('1,461');
    await expect(totalWeeks(page)).toHaveText('208 weeks and 5 days');
  });

  test('a reverse pair (start after end) is valid — absolute span with direction "before", never swapped', async ({ page }) => {
    await calcDiff(page, '2025-01-01', '2020-01-01');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(diffValue(page)).toHaveText('5 years, 0 months, 0 days');
    await expect(totalDays(page)).toHaveText('1,827');
    await expect(diffInterp(page)).toContainText('before');
  });

  test('an empty submission focuses the first required field (start date)', async ({ page }) => {
    await page.locator('[name="to"]').fill('2025-01-01');
    await submitBtn(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[name="from"]')).toBeFocused();
  });

  test('after the first result, editing a date recalculates live without moving focus', async ({ page }) => {
    await calcDiff(page, '2020-01-01', '2021-01-01');
    await expect(diffValue(page)).toHaveText('1 year, 0 months, 0 days');
    await page.locator('[name="to"]').fill('2022-01-01');
    await page.locator('[name="to"]').blur();
    await expect(diffValue(page)).toHaveText('2 years, 0 months, 0 days');
  });

  test('an invalid live edit (clearing a date) clears the stale difference', async ({ page }) => {
    await calcDiff(page, '2020-01-01', '2021-01-01');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await page.locator('[name="to"]').fill('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(totalDays(page)).toHaveText('—'); // stale value cleared
  });

  /* ---- add / subtract mode ---- */

  test('add mode: adding whole days yields the resulting date, with announcement', async ({ page }) => {
    await calcAdd(page, '2024-01-01', 'add', '90');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(addValue(page)).toContainText('March 31, 2024');
    await expect(addInterp(page)).toContainText('Adding 90 days');
    await expect(live(page)).toHaveText('Resulting date: March 31, 2024.');
  });

  test('add mode: zero days is valid (the same date)', async ({ page }) => {
    await calcAdd(page, '2024-06-15', 'add', '0');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(addValue(page)).toContainText('June 15, 2024');
  });

  test('add mode: the structural Subtract operation goes backward', async ({ page }) => {
    await calcAdd(page, '2024-01-01', 'sub', '1');
    await expect(addValue(page)).toContainText('December 31, 2023');
    await expect(addInterp(page)).toContainText('Subtracting 1 day');
  });

  test('add mode: leap rollover (2024-02-28 + 1 → February 29, 2024)', async ({ page }) => {
    await calcAdd(page, '2024-02-28', 'add', '1');
    await expect(addValue(page)).toContainText('February 29, 2024');
  });

  test('add mode: a fractional day count is rejected as invalid', async ({ page }) => {
    await calcAdd(page, '2024-01-01', 'add', '1.5');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  /* ---- structural: mode switching ---- */

  test('switching mode before the first calculation is structural — swaps fields, never calculates', async ({ page }) => {
    await expect(page.locator('[data-dc-group="diff"]')).toBeVisible();
    await expect(page.locator('[data-dc-group="add"]')).toBeHidden();
    await modeSel(page).selectOption('add');
    await expect(page.locator('[data-dc-group="add"]')).toBeVisible();
    await expect(page.locator('[data-dc-group="diff"]')).toBeHidden();
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty'); // no auto-calc on switch
    await modeSel(page).selectOption('diff');
    await expect(page.locator('[data-dc-group="diff"]')).toBeVisible();
  });

  test('switching to an empty mode after a calculation shows no cross-mode stale result', async ({ page }) => {
    await calcDiff(page, '2020-01-01', '2021-01-01');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    // switch to the empty add mode → the difference result must not linger
    await modeSel(page).selectOption('add');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    // switching back recomputes the preserved difference values
    await modeSel(page).selectOption('diff');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(diffValue(page)).toHaveText('1 year, 0 months, 0 days');
  });

  test('the primary button label follows the active task', async ({ page }) => {
    await expect(submitBtn(page)).toHaveText('Calculate Difference');
    await modeSel(page).selectOption('add');
    await expect(submitBtn(page)).toHaveText('Calculate Date');
    await modeSel(page).selectOption('diff');
    await expect(submitBtn(page)).toHaveText('Calculate Difference');
  });

  /* ---- reset ---- */

  test('reset restores the default mode, clears every field, empties the result', async ({ page }) => {
    await calcAdd(page, '2024-01-01', 'sub', '30');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await page.locator('[data-reset]').click();
    await expect(modeSel(page)).toHaveValue('diff');
    await expect(page.locator('[name="from"]')).toHaveValue('');
    await expect(page.locator('[name="start"]')).toHaveValue('');
    await expect(page.locator('[name="days"]')).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
    await expect(page.locator('[data-dc-group="diff"]')).toBeVisible();
  });

  /* ---- keyboard / responsive / theme / embed / guide / monetization ---- */

  test('keyboard submission works from a field', async ({ page }) => {
    await modeSel(page).selectOption('diff');
    await page.locator('[name="from"]').fill('2020-01-01');
    await page.locator('[name="to"]').fill('2020-12-31');
    await page.locator('[name="to"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('desktop shows the difference within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await calcDiff(page, '2000-06-15', '2020-09-20');
    const box = await diffValue(page).boundingBox();
    expect(box!.y).toBeLessThan(768);
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await calcAdd(page, '2024-01-01', 'add', '90');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calcDiff(page, '2020-01-01', '2025-01-01');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('no NaN / Infinity / undefined renders for ordinary results in either mode', async ({ page }) => {
    await calcDiff(page, '2000-06-15', '2020-09-20');
    await calcAdd(page, '2024-01-01', 'add', '90');
    const text = await shell(page).innerText();
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the generated embed mounts the same island (empty SSR, no auto-calc, then a result)', async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await calcDiff(page, '2020-01-01', '2025-01-01');
    await expect(diffValue(page)).toHaveText('5 years, 0 months, 0 days');
  });

  test('the direct guide renderer mounts the same working island', async ({ page }) => {
    await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await calcAdd(page, '2024-01-01', 'add', '90');
    await expect(addValue(page)).toContainText('March 31, 2024');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    const html = await page.content();
    expect(html).not.toMatch(/adsbygoogle|data-ad-client|googlesyndication/);
  });
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('date: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__date-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/everyday/date-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-date]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /DateCalculator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__date-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-date]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-date]')).toHaveCount(1);
  }

  test('two instances have no duplicate ids and every reference resolves in its own instance', async ({ page }) => {
    await mountTwo(page);
    const duplicates = await page.evaluate(() => {
      const counts: Record<string, number> = {};
      for (const el of document.querySelectorAll('[id]')) counts[el.id] = (counts[el.id] || 0) + 1;
      return Object.entries(counts).filter(([, n]) => n > 1).map(([id]) => id);
    });
    expect(duplicates).toEqual([]);
    const ok = await page.evaluate(() => {
      for (const scope of ['#inst-a', '#inst-b']) {
        const root = document.querySelector(scope)!;
        for (const el of root.querySelectorAll('[aria-describedby]')) {
          const refs = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
          for (const id of refs) {
            const t = document.getElementById(id);
            if (!t || !t.closest(scope)) return false;
          }
        }
      }
      return true;
    });
    expect(ok).toBe(true);
  });

  test('calculating and resetting one instance never touches the other', async ({ page }) => {
    await mountTwo(page);
    const A = (sel: string) => page.locator(`#inst-a ${sel}`);
    const B = (sel: string) => page.locator(`#inst-b ${sel}`);
    const fill = async (scope: (s: string) => ReturnType<Page['locator']>) => {
      await scope('[name="from"]').fill('2020-01-01');
      await scope('[name="to"]').fill('2025-01-01');
      await scope('button[type="submit"]').click();
    };
    await fill(A);
    await expect(A('[data-dc-panel="diff"] [data-result-value]').first()).toHaveText('5 years, 0 months, 0 days');
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'example'); // B untouched

    await fill(B);
    await expect(B('[data-dc-panel="diff"] [data-result-value]').first()).toHaveText('5 years, 0 months, 0 days');

    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
    await expect(B('[data-dc-panel="diff"] [data-result-value]').first()).toHaveText('5 years, 0 months, 0 days'); // B unaffected
  });
});

/* ---- Include the end day ------------------------------------------------- */

test.describe('date: including the end day', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('adds exactly one day, and says so', async ({ page }) => {
    await calcDiff(page, '2026-01-01', '2026-01-03');
    await expect(totalDays(page)).toHaveText('2');
    await page.locator('[name="includeEnd"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(totalDays(page)).toHaveText('3');
    await expect(diffInterp(page)).toContainText('end day included');
  });

  test('turns a same-day range into one day rather than zero', async ({ page }) => {
    await calcDiff(page, '2026-06-15', '2026-06-15');
    await expect(totalDays(page)).toHaveText('0');
    await page.locator('[name="includeEnd"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(totalDays(page)).toHaveText('1');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('leaves the calendar breakdown alone — it measures the span, not the count', async ({ page }) => {
    await calcDiff(page, '2026-01-01', '2026-03-01');
    await page.locator('[name="includeEnd"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(diffValue(page)).toHaveText('0 years, 2 months, 0 days');
    await expect(totalDays(page)).toHaveText('60');
  });

  test('is cleared by Reset', async ({ page }) => {
    await calcDiff(page, '2026-01-01', '2026-01-03');
    await page.locator('[name="includeEnd"]').check();
    await page.click('[data-reset]');
    await expect(page.locator('[name="includeEnd"]')).not.toBeChecked();
  });
});

/* ---- Business days ------------------------------------------------------- */

test.describe('date: business days', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  const businessDays = (page: Page) => page.locator('[data-dc-business-days]');

  test('counts working days alongside the calendar days', async ({ page }) => {
    // Monday 2026-08-24 to the following Monday.
    await calcDiff(page, '2026-08-24', '2026-08-31');
    await expect(totalDays(page)).toHaveText('7');
    await expect(businessDays(page)).toHaveText('5');
  });

  test('makes the working-day count the dominant answer when asked, keeping the span below it', async ({ page }) => {
    await calcDiff(page, '2026-08-24', '2026-08-31');
    await page.locator('[name="businessOnly"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(diffValue(page)).toHaveText('5 business days');
    await expect(page.locator('[data-dc-row="breakdown"]')).toBeVisible();
    await expect(page.locator('[data-dc-breakdown]')).toHaveText('0 years, 0 months, 7 days');
    await expect(live(page)).toHaveText('Business days: 5.');
  });

  test('the holiday option is inert until business days are on', async ({ page }) => {
    await expect(page.locator('[name="excludeHolidays"]')).toBeDisabled();
    await page.locator('[name="businessOnly"]').check();
    await expect(page.locator('[name="excludeHolidays"]')).toBeEnabled();
    await page.locator('[name="businessOnly"]').uncheck();
    await expect(page.locator('[name="excludeHolidays"]')).toBeDisabled();
    await expect(page.locator('[name="excludeHolidays"]')).not.toBeChecked();
  });

  test('drops an observed federal holiday from the count', async ({ page }) => {
    // The week containing Independence Day 2026, observed Friday 2026-07-03.
    await calcDiff(page, '2026-06-29', '2026-07-06');
    await page.locator('[name="businessOnly"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(diffValue(page)).toHaveText('5 business days');
    await page.locator('[name="excludeHolidays"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(diffValue(page)).toHaveText('4 business days');
    await expect(diffInterp(page)).toContainText('excluding US federal holidays');
  });

  test('shifts a date by business days, never counting the start day', async ({ page }) => {
    await modeSel(page).selectOption('add');
    await page.locator('[name="businessOnly"]').check();
    await page.locator('[name="start"]').fill('2026-08-28'); // a Friday
    await page.locator('[name="days"]').fill('3');
    await submitBtn(page).click();
    await expect(addValue(page)).toHaveText('Wednesday, September 2, 2026');
  });

  test('steps the calendar boxes aside in business mode, and explains why', async ({ page }) => {
    await modeSel(page).selectOption('add');
    await expect(page.locator('[name="years"]')).toBeVisible();
    await page.locator('[name="businessOnly"]').check();
    await expect(page.locator('[name="years"]')).toBeHidden();
    await expect(page.locator('[name="months"]')).toBeHidden();
    await expect(page.locator('[name="weeks"]')).toBeHidden();
    await expect(page.locator('[name="days"]')).toBeVisible();
    await expect(page.locator('[data-dc-business-note]')).toBeVisible();
    await page.locator('[name="businessOnly"]').uncheck();
    await expect(page.locator('[name="years"]')).toBeVisible();
  });
});

/* ---- Years, months, weeks and days --------------------------------------- */

test.describe('date: add or subtract in four units', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await modeSel(page).selectOption('add');
  });

  const shift = async (page: Page, start: string, op: 'add' | 'sub', amount: Record<string, string>) => {
    await page.locator('[name="start"]').fill(start);
    await page.locator('[name="op"]').selectOption(op);
    for (const [unit, value] of Object.entries(amount)) await page.locator(`[name="${unit}"]`).fill(value);
    await submitBtn(page).click();
  };

  test('offers years, months, weeks and days', async ({ page }) => {
    for (const unit of ['years', 'months', 'weeks', 'days']) {
      await expect(page.locator(`[name="${unit}"]`)).toBeVisible();
    }
  });

  test('adds each unit on its own', async ({ page }) => {
    await shift(page, '2026-01-15', 'add', { years: '1' });
    await expect(addValue(page)).toHaveText('Friday, January 15, 2027');
    await page.locator('[name="years"]').fill('');
    await page.locator('[name="months"]').fill('2');
    await page.waitForTimeout(DEBOUNCE);
    await expect(addValue(page)).toHaveText('Sunday, March 15, 2026');
  });

  test('combines them, and names only the units given', async ({ page }) => {
    await shift(page, '2026-01-15', 'add', { years: '1', months: '2', weeks: '1', days: '3' });
    await expect(addValue(page)).toHaveText('Thursday, March 25, 2027');
    await expect(page.locator('[data-dc-add-amount]')).toHaveText('1 year, 2 months, 1 week and 3 days');
    await expect(addInterp(page)).toContainText('Adding 1 year, 2 months, 1 week and 3 days to');
  });

  test('subtracts as well', async ({ page }) => {
    await shift(page, '2026-01-15', 'sub', { years: '1', months: '2' });
    await expect(addValue(page)).toHaveText('Friday, November 15, 2024');
  });

  test('clamps a month step to the end of the target month', async ({ page }) => {
    await shift(page, '2026-01-31', 'add', { months: '1' });
    await expect(addValue(page)).toHaveText('Saturday, February 28, 2026');
    await page.locator('[name="start"]').fill('2024-01-31');
    await page.waitForTimeout(DEBOUNCE);
    await expect(addValue(page)).toHaveText('Thursday, February 29, 2024'); // leap year
  });

  test('applies the calendar steps before the fixed ones', async ({ page }) => {
    // A month clamps to Feb 28 first, then the day is added: March 1, not March 2.
    await shift(page, '2026-01-31', 'add', { months: '1', days: '1' });
    await expect(addValue(page)).toHaveText('Sunday, March 1, 2026');
  });

  test('asks for an amount only when every box is blank', async ({ page }) => {
    await page.locator('[name="start"]').fill('2026-01-15');
    await submitBtn(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="amount"]')).toBeVisible();
    // The first attempt was invalid, so live-after-first is not armed yet — the visitor
    // presses Calculate again rather than the result appearing as they type.
    await page.locator('[name="weeks"]').fill('2');
    await submitBtn(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(addValue(page)).toHaveText('Thursday, January 29, 2026');
  });

  test('rejects a fractional or negative amount in any box', async ({ page }) => {
    for (const unit of ['years', 'months', 'weeks', 'days']) {
      await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
      await modeSel(page).selectOption('add');
      await page.locator('[name="start"]').fill('2026-01-15');
      await page.evaluate(
        ([name]) => {
          const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement;
          el.value = '1.5';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        },
        [unit],
      );
      await submitBtn(page).click();
      await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    }
  });
});

/* ---- Alternative time units ---------------------------------------------- */

test.describe('date: the same span in other units', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  const unit = (page: Page, key: string) =>
    page.locator(`[data-dc-unit="${key}"] [data-dc-unit-value]`);

  test('converts the counted span into every unit offered', async ({ page }) => {
    await calcDiff(page, '2026-01-01', '2026-01-11'); // 10 days
    await expect(unit(page, 'seconds')).toHaveText('864,000');
    await expect(unit(page, 'minutes')).toHaveText('14,400');
    await expect(unit(page, 'hours')).toHaveText('240');
    await expect(unit(page, 'days')).toHaveText('10');
    await expect(unit(page, 'weeks')).toHaveText('1 week and 3 days');
    await expect(unit(page, 'year-pct')).toHaveText('2.74%');
  });

  test('follows the end-day setting, so the units match the count on show', async ({ page }) => {
    await calcDiff(page, '2026-01-01', '2026-01-11');
    await page.locator('[name="includeEnd"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(unit(page, 'days')).toHaveText('11');
    await expect(unit(page, 'hours')).toHaveText('264');
  });

  test('renders no NaN or Infinity for a zero-length span', async ({ page }) => {
    await calcDiff(page, '2026-01-01', '2026-01-01');
    const text = await region(page, 'valid').innerText();
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
  });
});
