import { test, expect, type Page } from '@playwright/test';

/**
 * Fraction calculator — R17B1 task-first migration (bounded Math singleton). Wraps the UNCHANGED
 * computeFraction / simplify via its OWN fraction-form.ts binding on the UNCHANGED standard-form
 * runtime. Two fractions + an operation <select> (add/subtract/multiply/divide); the dominant result
 * is the simplified fraction, with a mixed number (only when it differs) and the decimal as
 * secondaries. Task-first: fields start EMPTY, explicit "Calculate Fraction" → live-after-first,
 * Reset. Strict integer fields; a zero denominator and division by a zero-valued fraction are
 * rejected. NO isUsableResult — the complete-result guard is a NaN sentinel; a valid 0 renders.
 */
const ROUTE = '/math/fraction-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#fr-result');
const primary = (page: Page) => page.locator('#fr-result [data-result-when~="valid"] [data-result-value]').first();
const summaryLabel = (page: Page) => page.locator('#fr-result [data-result-summary-label]');
const mixed = (page: Page) => page.locator('[data-fr-mixed]');
const mixedRow = (page: Page) => page.locator('[data-fr-mixed-row]');
const decimal = (page: Page) => page.locator('[data-fr-decimal]');
const interpretation = (page: Page) => page.locator('[data-fr-interpretation]');
const live = (page: Page) => page.locator('#fr-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate Fraction' });
const region = (page: Page, when: string) => page.locator(`#fr-result [data-result-when~="${when}"]`);

const setFields = async (page: Page, an: string, ad: string, bn: string, bd: string) => {
  await page.locator('[name="an"]').fill(an);
  await page.locator('[name="ad"]').fill(ad);
  await page.locator('[name="bn"]').fill(bn);
  await page.locator('[name="bd"]').fill(bd);
};
const calc = async (page: Page, an: string, ad: string, op: string, bn: string, bd: string) => {
  await setFields(page, an, ad, bn, bd);
  await page.locator('[name="op"]').selectOption(op);
  await submit(page).click();
};

test.describe('fraction: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- initial state ---- */

  test('loads empty with the neutral (add) operation, no result, no announcement', async ({ page }) => {
    for (const n of ['an', 'ad', 'bn', 'bd']) await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
    await expect(page.locator('[name="op"]')).toHaveValue('add');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(live(page)).toHaveText('');
  });

  test('does not calculate before the first submission (fields or operation edits)', async ({ page }) => {
    await setFields(page, '1', '2', '1', '3');
    await page.locator('[name="op"]').selectOption('multiply');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- the four operations ---- */

  test('addition: 1/2 + 1/3 = 5/6 (proper → mixed row hidden) + decimal + announcement', async ({ page }) => {
    await calc(page, '1', '2', 'add', '1', '3');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Simplified fraction');
    await expect(primary(page)).toHaveText('5/6');
    await expect(mixedRow(page)).toBeHidden();
    await expect(decimal(page)).toHaveText('0.8333');
    await expect(interpretation(page)).toHaveText('This is 1/2 + 1/3, reduced to lowest terms.');
    await expect(live(page)).toHaveText('Result: 5/6.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('subtraction to a negative fraction: 1/2 − 3/4 = −1/4', async ({ page }) => {
    await calc(page, '1', '2', 'subtract', '3', '4');
    await expect(primary(page)).toHaveText('-1/4');
    await expect(mixedRow(page)).toBeHidden();
    await expect(decimal(page)).toHaveText('-0.25');
  });

  test('multiplication reduces: 2/3 × 3/4 = 1/2', async ({ page }) => {
    await calc(page, '2', '3', 'multiply', '3', '4');
    await expect(primary(page)).toHaveText('1/2');
    await expect(decimal(page)).toHaveText('0.5');
  });

  test('division to a whole number: 1/2 ÷ 1/4 = 2/1, mixed "2", announced "Result: 2."', async ({ page }) => {
    await calc(page, '1', '2', 'divide', '1', '4');
    await expect(primary(page)).toHaveText('2/1');
    await expect(mixedRow(page)).toBeVisible();
    await expect(mixed(page)).toHaveText('2');
    await expect(live(page)).toHaveText('Result: 2.');
  });

  test('a zero result renders 0/1', async ({ page }) => {
    await calc(page, '-1', '2', 'add', '1', '2');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0/1');
    await expect(live(page)).toHaveText('Result: 0.');
  });

  test('an improper result shows a distinct mixed number: 7/2 + 0/1 → 7/2 (3 1/2)', async ({ page }) => {
    await calc(page, '7', '2', 'add', '0', '1');
    await expect(primary(page)).toHaveText('7/2');
    await expect(mixedRow(page)).toBeVisible();
    await expect(mixed(page)).toHaveText('3 1/2');
    await expect(decimal(page)).toHaveText('3.5');
  });

  /* ---- validation ---- */

  test('an all-empty submission reports required errors and focuses the first numerator', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="an"]')).toHaveText('Enter a numerator.');
    await expect(page.locator('[data-error-for="ad"]')).toHaveText('Enter a denominator.');
    await expect(page.locator('[name="an"]')).toBeFocused();
  });

  test('a zero denominator is a denominator error', async ({ page }) => {
    await calc(page, '1', '0', 'add', '1', '3');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="ad"]')).toHaveText('The denominator cannot be zero.');
    await expect(page.locator('[name="ad"]')).toBeFocused();
  });

  test('division by a fraction equal to zero is rejected on the second numerator', async ({ page }) => {
    await calc(page, '1', '2', 'divide', '0', '5');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="bn"]')).toHaveText('Cannot divide by a fraction that equals zero.');
  });

  test('a non-integer numerator is a whole-number error', async ({ page }) => {
    // type=number keeps a decimal string in .value; the binding rejects it strictly.
    await page.locator('[name="an"]').fill('1.5');
    await page.locator('[name="ad"]').fill('2');
    await page.locator('[name="bn"]').fill('1');
    await page.locator('[name="bd"]').fill('3');
    await submit(page).click();
    await expect(page.locator('[data-error-for="an"]')).toHaveText('Enter a whole number.');
  });

  /* ---- live update / invalidate / reset ---- */

  test('after the first result, changing the operation recalculates live', async ({ page }) => {
    await calc(page, '1', '2', 'add', '1', '4');
    await expect(primary(page)).toHaveText('3/4'); // 1/2 + 1/4
    await page.locator('[name="op"]').selectOption('subtract');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('1/4'); // 1/2 − 1/4
  });

  test('after the first result, editing a field recalculates live without moving focus', async ({ page }) => {
    await calc(page, '1', '2', 'add', '1', '3');
    await expect(primary(page)).toHaveText('5/6');
    await page.locator('[name="bd"]').fill('6'); // 1/2 + 1/6 = 2/3
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('2/3');
    await expect(page.locator('[name="bd"]')).toBeFocused();
  });

  test('an invalid live edit clears the stale result, keeping focus', async ({ page }) => {
    await calc(page, '1', '2', 'add', '1', '3');
    await expect(region(page, 'valid')).toBeVisible();
    await page.locator('[name="ad"]').fill('0'); // now a zero denominator
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[name="ad"]')).toBeFocused();
  });

  test('reset clears the four fields, restores add, empties the result + announcement', async ({ page }) => {
    await calc(page, '1', '2', 'divide', '1', '4');
    await expect(primary(page)).not.toHaveText('—');
    await page.click('[data-reset]');
    for (const n of ['an', 'ad', 'bn', 'bd']) await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
    await expect(page.locator('[name="op"]')).toHaveValue('add');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from a field', async ({ page }) => {
    await setFields(page, '2', '3', '3', '4');
    await page.locator('[name="op"]').selectOption('multiply');
    await page.locator('[name="bd"]').press('Enter');
    await expect(primary(page)).toHaveText('1/2');
  });

  test('desktop shows the simplified fraction within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await calc(page, '1', '2', 'add', '1', '3');
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page, '7', '2', 'add', '0', '1');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page, '1', '2', 'add', '1', '3');
    await expect(primary(page)).toBeVisible();
  });

  test('the generated embed mounts the same island and computes', async ({ page }) => {
    await page.goto('/embed/math/fraction-calculator', { waitUntil: 'domcontentloaded' });
    await page.locator('[name="an"]').fill('1');
    await page.locator('[name="ad"]').fill('2');
    await page.locator('[name="bn"]').fill('1');
    await page.locator('[name="bd"]').fill('3');
    await page.getByRole('button', { name: 'Calculate Fraction' }).click();
    await expect(page.locator('#fr-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#fr-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('5/6');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});

/* -------------------- guide embed regression -------------------- */

test('the guide that embeds the island renders the migrated task-first tool', async ({ page }) => {
  await page.goto('/guides/how-to-work-with-fractions', { waitUntil: 'domcontentloaded' });
  // Exactly one H1 (the guide's); the embedded island injects no page H1 or breadcrumb.
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('[data-fraction] h1')).toHaveCount(0);
  await expect(page.locator('[data-fraction] nav')).toHaveCount(0);
  // Empty (not the legacy prefill), then an explicit calc works inside the guide.
  await expect(page.locator('#fr-result')).toHaveAttribute('data-result-state', 'empty');
  await page.locator('[name="an"]').fill('1');
  await page.locator('[name="ad"]').fill('2');
  await page.locator('[name="bn"]').fill('1');
  await page.locator('[name="bd"]').fill('3');
  await page.getByRole('button', { name: 'Calculate Fraction' }).click();
  await expect(page.locator('#fr-result')).toHaveAttribute('data-result-state', 'valid');
  await expect(page.locator('#fr-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('5/6');
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('fraction: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__fraction-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/math/fraction-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-fraction]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /FractionCalculator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__fraction-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-fraction]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-fraction]')).toHaveCount(1);
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
        for (const el of root.querySelectorAll('label[for], [aria-describedby]')) {
          const refs = (el.getAttribute('for') || el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
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
    const fillCalc = async (scope: (s: string) => ReturnType<Page['locator']>, an: string, ad: string, bn: string, bd: string) => {
      await scope('[name="an"]').fill(an);
      await scope('[name="ad"]').fill(ad);
      await scope('[name="bn"]').fill(bn);
      await scope('[name="bd"]').fill(bd);
      await scope('button[type="submit"]').click();
    };
    await fillCalc(A, '1', '2', '1', '3');
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('5/6');
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty'); // B untouched

    await fillCalc(B, '2', '3', '3', '4'); // add → 17/12
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('17/12');
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('5/6'); // A preserved

    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('17/12'); // B unaffected by A's reset
  });
});
