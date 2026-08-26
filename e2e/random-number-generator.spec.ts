import { test, expect, type Page } from '@playwright/test';

/**
 * Random Number Generator — R18B2 task-first migration (bounded Math singleton, the last
 * Math legacy). Wraps the UNCHANGED randomIntegers (crypto-strength, inclusive integer
 * range, optional unique) via its OWN random-number-form.ts binding on the UNCHANGED
 * generator runtime (the Password Generator lane). Task-first: settings are prefilled
 * (1/100/5/repeats-allowed) but the OUTPUT starts EMPTY on the server AND after hydration
 * (the legacy island auto-generated on load). Explicit "Generate Numbers"; a settings
 * change marks the output STALE (kept visible) — NO live regeneration. Reset returns to
 * empty. No Copy. Randomness is asserted by PROPERTIES (count / range / integer /
 * uniqueness), never exact values, and never "the next generation must differ".
 */
const ROUTE = '/math/random-number-generator';
const EMBED = '/embed/math/random-number-generator';

const shell = (page: Page) => page.locator('#rng-result');
const list = (page: Page) => page.locator('#rng-result [data-rng-list]');
const chips = (page: Page) => page.locator('#rng-result [data-rng-list] .rng-chip');
const meta = (page: Page) => page.locator('#rng-result [data-rng-meta]');
const capped = (page: Page) => page.locator('#rng-result [data-rng-capped]');
const staleNote = (page: Page) => page.locator('#rng-result [data-stale-note]');
const live = (page: Page) => page.locator('#rng-live');
const generate = (page: Page) => page.locator('[data-form] button[type="submit"]'); // label relabels after first gen
const region = (page: Page, when: string) => page.locator(`#rng-result [data-result-when~="${when}"]`);

const setMin = (page: Page, v: string) => page.locator('[name="min"]').fill(v);
const setMax = (page: Page, v: string) => page.locator('[name="max"]').fill(v);
const setCount = (page: Page, v: string) => page.locator('[name="count"]').fill(v);
const setUnique = (page: Page, on: boolean) =>
  on ? page.locator('[name="unique"]').check() : page.locator('[name="unique"]').uncheck();

type Cfg = { min?: string; max?: string; count?: string; unique?: boolean };
const gen = async (page: Page, c: Cfg = {}) => {
  if (c.min !== undefined) await setMin(page, c.min);
  if (c.max !== undefined) await setMax(page, c.max);
  if (c.count !== undefined) await setCount(page, c.count);
  if (c.unique !== undefined) await setUnique(page, c.unique);
  await generate(page).click();
};
const numbers = async (page: Page): Promise<number[]> =>
  (await chips(page).allTextContents()).map(Number);

test.describe('rng: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- SSR / hydration parity ---- */

  test('the server-rendered output is empty and the hydrated output is still empty — no numbers before Generate', async ({ page }) => {
    const raw = await (await page.request.get(ROUTE)).text();
    const server = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        state: d.querySelector('#rng-result')?.getAttribute('data-result-state') ?? null,
        chips: d.querySelectorAll('#rng-result [data-rng-list] .rng-chip').length,
      };
    }, raw);
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    expect(server.state).toBe('empty');
    expect(server.chips).toBe(0);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(chips(page)).not.toHaveCount(0); // the labelled example shows sample numbers
  });

  /* ---- initial state ---- */

  test('loads with prefilled settings, no output, no announcement', async ({ page }) => {
    await expect(page.locator('[name="min"]')).toHaveValue('1');
    await expect(page.locator('[name="max"]')).toHaveValue('100');
    await expect(page.locator('[name="count"]')).toHaveValue('5');
    await expect(page.locator('[name="unique"]')).not.toBeChecked();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
  });

  test('changing a setting does not generate (no output before Generate)', async ({ page }) => {
    await setMin(page, '5');
    await setCount(page, '9');
    await setUnique(page, true);
    await page.waitForTimeout(150);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(chips(page)).not.toHaveCount(0); // the labelled example shows sample numbers
  });

  /* ---- generation (property assertions, never exact values) ---- */

  test('Generate produces the requested count of in-range integers + metadata + announcement', async ({ page }) => {
    await gen(page, { min: '1', max: '100', count: '5' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(chips(page)).toHaveCount(5);
    const ns = await numbers(page);
    expect(ns.every((n) => Number.isInteger(n) && n >= 1 && n <= 100)).toBe(true);
    await expect(meta(page)).toHaveText('5 numbers from 1 to 100 · repeats allowed');
    await expect(live(page)).toHaveText('Generated 5 random numbers.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('a single number uses singular grammar', async ({ page }) => {
    await gen(page, { count: '1' });
    await expect(chips(page)).toHaveCount(1);
    await expect(live(page)).toHaveText('Generated 1 random number.');
  });

  test('a negative range yields negative integers', async ({ page }) => {
    await gen(page, { min: '-10', max: '-1', count: '8' });
    const ns = await numbers(page);
    expect(ns.length).toBe(8);
    expect(ns.every((n) => n >= -10 && n <= -1)).toBe(true);
  });

  test('a range crossing zero spans both signs', async ({ page }) => {
    await gen(page, { min: '-5', max: '5', count: '40' });
    const ns = await numbers(page);
    expect(ns.every((n) => n >= -5 && n <= 5)).toBe(true);
  });

  test('min == max is a fixed value', async ({ page }) => {
    await gen(page, { min: '7', max: '7', count: '3' });
    expect(await numbers(page)).toEqual([7, 7, 7]);
  });

  test('unique mode yields distinct values', async ({ page }) => {
    await gen(page, { min: '1', max: '30', count: '15', unique: true });
    const ns = await numbers(page);
    expect(ns.length).toBe(15);
    expect(new Set(ns).size).toBe(15);
  });

  test('unique exhaustion preserves the source cap and explains the shortfall', async ({ page }) => {
    await gen(page, { min: '1', max: '5', count: '20', unique: true });
    const ns = await numbers(page);
    expect(ns.length).toBe(5); // capped at the range size
    expect(new Set(ns).size).toBe(5);
    await expect(capped(page)).toBeVisible();
    await expect(capped(page)).toContainText('Only 5 unique whole numbers');
    await expect(live(page)).toHaveText('Generated 5 random numbers.');
  });

  test('a second generation stays valid (no inequality asserted)', async ({ page }) => {
    await gen(page, { min: '1', max: '100', count: '6' });
    await expect(chips(page)).toHaveCount(6);
    await generate(page).click(); // "Generate New Numbers"
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(chips(page)).toHaveCount(6);
    const ns = await numbers(page);
    expect(ns.every((n) => Number.isInteger(n) && n >= 1 && n <= 100)).toBe(true);
  });

  /* ---- validation ---- */

  test('min greater than max is rejected with a form-level error (no silent swap)', async ({ page }) => {
    await gen(page, { min: '100', max: '1' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('#rng-result [data-result-invalid-message]')).toContainText('minimum must be less than or equal to the maximum');
  });

  test('an empty minimum is rejected, associated with its field, and focused', async ({ page }) => {
    await setMin(page, '');
    await generate(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="min"]')).toHaveText('Enter a minimum.');
    await expect(page.locator('[name="min"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[name="min"]')).toBeFocused();
  });

  test('a decimal bound is rejected (integer-only)', async ({ page }) => {
    await gen(page, { min: '1.5' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="min"]')).toHaveText('Enter the minimum as a whole number.');
  });

  test('a count outside 1–1000 is rejected', async ({ page }) => {
    await gen(page, { count: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="count"]')).toContainText('between 1 and 1000');
  });

  /* ---- stale on settings change (no live regeneration) ---- */

  test('changing a setting after generating marks the output stale (kept visible, not regenerated)', async ({ page }) => {
    await gen(page, { min: '1', max: '100', count: '5' });
    await expect(chips(page)).toHaveCount(5);
    await setCount(page, '10'); // settings change → stale, NOT a regeneration
    await expect(shell(page)).toHaveAttribute('data-stale', 'true');
    await expect(staleNote(page)).toBeVisible();
    await expect(chips(page)).toHaveCount(5); // still the old output
    await generate(page).click(); // now apply
    await expect(shell(page)).toHaveAttribute('data-stale', 'false');
    await expect(chips(page)).toHaveCount(10);
  });

  /* ---- reset ---- */

  test('reset clears the output, restores defaults, and empties the announcement', async ({ page }) => {
    await gen(page, { min: '5', max: '50', count: '8', unique: true });
    await expect(chips(page)).toHaveCount(8);
    await page.click('[data-reset]');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[name="min"]')).toHaveValue('1');
    await expect(page.locator('[name="max"]')).toHaveValue('100');
    await expect(page.locator('[name="count"]')).toHaveValue('5');
    await expect(page.locator('[name="unique"]')).not.toBeChecked();
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from the count field', async ({ page }) => {
    await setCount(page, '4');
    await page.locator('[name="count"]').press('Enter');
    await expect(chips(page)).toHaveCount(4);
  });

  test('desktop shows the generated numbers within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gen(page, { count: '5' });
    await expect(list(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await gen(page, { min: '1', max: '1000', count: '30' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await gen(page, { count: '5' });
    await expect(list(page)).toBeVisible();
  });

  test('the generated embed mounts the same island (empty SSR, no auto-gen, then a valid generation)', async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#rng-result')).toHaveAttribute('data-result-state', 'example');
    await expect(page.locator('#rng-result [data-rng-list] .rng-chip')).not.toHaveCount(0); // example numbers
    await page.locator('[name="count"]').fill('7');
    await page.waitForTimeout(150);
    await expect(page.locator('#rng-result')).toHaveAttribute('data-result-state', 'empty'); // no auto-gen
    await page.locator('[data-form] button[type="submit"]').click();
    await expect(page.locator('#rng-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#rng-result [data-rng-list] .rng-chip')).toHaveCount(7);
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('rng: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__rng-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/math/random-number-generator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-rng]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /RandomNumberGenerator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__rng-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-rng]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-rng]')).toHaveCount(1);
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

  test('generating and resetting one instance never touches the other', async ({ page }) => {
    await mountTwo(page);
    const A = (sel: string) => page.locator(`#inst-a ${sel}`);
    const B = (sel: string) => page.locator(`#inst-b ${sel}`);
    await A('[name="count"]').fill('4');
    await A('[data-form] button[type="submit"]').click();
    await expect(A('[data-rng-list] .rng-chip')).toHaveCount(4);
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'example'); // B untouched

    await B('[name="count"]').fill('9');
    await B('[data-form] button[type="submit"]').click();
    await expect(B('[data-rng-list] .rng-chip')).toHaveCount(9);
    await expect(A('[data-rng-list] .rng-chip')).toHaveCount(4); // A preserved

    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
    await expect(B('[data-rng-list] .rng-chip')).toHaveCount(9); // B unaffected by A's reset
  });
});
