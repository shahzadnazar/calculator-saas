import { test, expect, type Page } from '@playwright/test';

/**
 * Hours calculator — R17B2 task-first migration (bounded Everyday singleton). Wraps the UNCHANGED
 * parseTimeToMinutes / calculateHours via its OWN hours-form.ts binding on the UNCHANGED standard-form
 * runtime. Two native `type="time"` fields (start / end) + a break in MINUTES; the dominant result is
 * the total time (hours + minutes) with decimal hours as the secondary. Task-first: fields start EMPTY,
 * explicit "Calculate Hours" → live-after-first, Reset. Overnight is supported (end earlier than start
 * = next day); a valid zero duration (equal times or a break ≥ the interval) renders as a finite 0. NO
 * isUsableResult — the complete-result guard is a NaN sentinel.
 *
 * Malformed / out-of-range times are unreachable through a native `type="time"` field (the browser
 * normalises or blanks them), so those cases live in the binding unit tests; here the number break
 * field carries the invalid-input UI (non-integer, negative), and the two time fields carry the
 * required-field path (left empty).
 */
const ROUTE = '/everyday/hours-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#hr-result');
const primary = (page: Page) => page.locator('#hr-result [data-result-when~="valid"] [data-result-value]').first();
const summaryLabel = (page: Page) => page.locator('#hr-result [data-result-summary-label]');
const decimal = (page: Page) => page.locator('[data-hr-decimal]');
const interpretation = (page: Page) => page.locator('[data-hr-interpretation]');
const live = (page: Page) => page.locator('#hr-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate Hours' });
const region = (page: Page, when: string) => page.locator(`#hr-result [data-result-when~="${when}"]`);

const setFields = async (page: Page, start: string, end: string, breakMin: string) => {
  await page.locator('[name="start"]').fill(start);
  await page.locator('[name="end"]').fill(end);
  await page.locator('[name="breakMin"]').fill(breakMin);
};
const calc = async (page: Page, start: string, end: string, breakMin: string) => {
  await setFields(page, start, end, breakMin);
  await submit(page).click();
};

test.describe('hours: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- initial state ---- */

  test('loads empty — no prefill, no result, no announcement', async ({ page }) => {
    for (const n of ['start', 'end', 'breakMin']) await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    // The example fills this calculator's OWN valid region, so it is visible on load.
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await setFields(page, '09:00', '17:30', '30');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- computation ---- */

  test('an ordinary same-day shift minus a break: 09:00–17:30, 30m → 8h 0m + decimal + interpretation + announcement', async ({ page }) => {
    await calc(page, '09:00', '17:30', '30');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Total time');
    await expect(primary(page)).toHaveText('8h 0m');
    await expect(decimal(page)).toHaveText('8');
    await expect(interpretation(page)).toHaveText('09:00 to 17:30, minus a 30-minute break.');
    await expect(live(page)).toHaveText('Total time: 8 hours.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('an overnight shift is handled: 22:00–06:00 → 8h 0m, crossing midnight', async ({ page }) => {
    await calc(page, '22:00', '06:00', '0');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('8h 0m');
    await expect(interpretation(page)).toHaveText('22:00 to 06:00, crossing midnight.');
  });

  test('a break is subtracted: 09:00–17:00, 60m → 7h 0m (decimal 7)', async ({ page }) => {
    await calc(page, '09:00', '17:00', '60');
    await expect(primary(page)).toHaveText('7h 0m');
    await expect(decimal(page)).toHaveText('7');
  });

  test('equal start and end is a valid ZERO duration that explains itself', async ({ page }) => {
    await calc(page, '09:00', '09:00', '');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0h 0m');
    await expect(interpretation(page)).toContainText('same');
    await expect(live(page)).toHaveText('Total time: 0 hours.');
  });

  test('a break at least as long as the interval clamps to a valid zero', async ({ page }) => {
    await calc(page, '09:00', '17:00', '480');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0h 0m');
    await expect(interpretation(page)).toContainText('at least as long');
  });

  test('a fractional result reports minutes and decimal hours: 09:00–17:15 → 8h 15m, 8.25', async ({ page }) => {
    await calc(page, '09:00', '17:15', '0');
    await expect(primary(page)).toHaveText('8h 15m');
    await expect(decimal(page)).toHaveText('8.25');
    await expect(live(page)).toHaveText('Total time: 8 hours 15 minutes.');
  });

  /* ---- validation ---- */

  test('an all-empty submission requires start and end, and focuses the start field', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="start"]')).toHaveText('Enter a start time.');
    await expect(page.locator('[data-error-for="end"]')).toHaveText('Enter an end time.');
    await expect(page.locator('[name="start"]')).toBeFocused();
  });

  test('start and end are independently required', async ({ page }) => {
    await page.locator('[name="start"]').fill('09:00');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="end"]')).toHaveText('Enter an end time.');
    await expect(page.locator('[name="end"]')).toBeFocused();
  });

  test('a DECIMAL break is honoured (source contract): 09:00–17:00 minus 30.5m → 7h 29.5m, 7.49', async ({ page }) => {
    await calc(page, '09:00', '17:00', '30.5');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('7h 29.5m');
    await expect(decimal(page)).toHaveText('7.49');
    await expect(interpretation(page)).toHaveText('09:00 to 17:00, minus a 30.5-minute break.');
    await expect(live(page)).toHaveText('Total time: 7 hours 29.5 minutes.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('a negative break is rejected (not silently clamped)', async ({ page }) => {
    await setFields(page, '09:00', '17:00', '-10');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="breakMin"]')).toHaveText('The break cannot be negative.');
  });

  /* ---- live update / invalidate / reset ---- */

  test('after the first result, editing the break recalculates live without moving focus', async ({ page }) => {
    await calc(page, '09:00', '17:00', '0');
    await expect(primary(page)).toHaveText('8h 0m');
    await page.locator('[name="breakMin"]').fill('30'); // 8h − 30m = 7h 30m
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('7h 30m');
    await expect(decimal(page)).toHaveText('7.5');
    await expect(page.locator('[name="breakMin"]')).toBeFocused();
  });

  test('after the first result, editing a time recalculates live', async ({ page }) => {
    await calc(page, '09:00', '17:00', '0');
    await expect(primary(page)).toHaveText('8h 0m');
    await page.locator('[name="end"]').fill('18:00'); // 9h now
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('9h 0m');
  });

  test('after the first result, editing to a decimal break recomputes live', async ({ page }) => {
    await calc(page, '09:00', '17:00', '30');
    await expect(primary(page)).toHaveText('7h 30m');
    await page.locator('[name="breakMin"]').fill('30.5'); // 8h − 30.5m = 7h 29.5m
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('7h 29.5m');
    await expect(decimal(page)).toHaveText('7.49');
    await expect(page.locator('[name="breakMin"]')).toBeFocused();
  });

  test('an invalid live edit (negative decimal) clears the stale result, keeping focus', async ({ page }) => {
    await calc(page, '09:00', '17:00', '0');
    await expect(region(page, 'valid')).toBeVisible();
    await page.locator('[name="breakMin"]').fill('-0.5'); // now a negative break
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[name="breakMin"]')).toBeFocused();
  });

  test('reset clears the fields, empties the result and the announcement', async ({ page }) => {
    await calc(page, '09:00', '17:30', '30');
    await expect(primary(page)).not.toHaveText('—');
    await page.click('[data-reset]');
    for (const n of ['start', 'end', 'breakMin']) await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from a field', async ({ page }) => {
    await setFields(page, '09:00', '17:30', '30');
    await page.locator('[name="breakMin"]').press('Enter');
    await expect(primary(page)).toHaveText('8h 0m');
  });

  test('desktop shows the total time within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await calc(page, '09:00', '17:30', '30');
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page, '22:00', '06:00', '30');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page, '09:00', '17:30', '30');
    await expect(primary(page)).toBeVisible();
  });

  test('the generated embed mounts the same island and computes', async ({ page }) => {
    await page.goto('/embed/everyday/hours-calculator', { waitUntil: 'domcontentloaded' });
    await page.locator('[name="start"]').fill('09:00');
    await page.locator('[name="end"]').fill('17:30');
    await page.locator('[name="breakMin"]').fill('30');
    await page.getByRole('button', { name: 'Calculate Hours' }).click();
    await expect(page.locator('#hr-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#hr-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('8h 0m');
  });

  test('the generated embed honours a decimal break too (30.5m → 7h 29.5m)', async ({ page }) => {
    await page.goto('/embed/everyday/hours-calculator', { waitUntil: 'domcontentloaded' });
    await page.locator('[name="start"]').fill('09:00');
    await page.locator('[name="end"]').fill('17:00');
    await page.locator('[name="breakMin"]').fill('30.5');
    await page.getByRole('button', { name: 'Calculate Hours' }).click();
    await expect(page.locator('#hr-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#hr-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('7h 29.5m');
    await expect(page.locator('[data-hr-decimal]')).toHaveText('7.49');
    expect(await page.locator('#hr-result [data-result-when~="valid"]').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});

/* -------------------- guide embed regression -------------------- */

test('the guide that embeds the island renders the migrated task-first tool', async ({ page }) => {
  await page.goto('/guides/how-to-calculate-hours-worked', { waitUntil: 'domcontentloaded' });
  // Exactly one H1 (the guide's); the embedded island injects no page H1 or breadcrumb.
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('[data-hours] h1')).toHaveCount(0);
  await expect(page.locator('[data-hours] nav')).toHaveCount(0);
  // Empty (not a legacy prefill), then an explicit calc works inside the guide.
  await expect(page.locator('#hr-result')).toHaveAttribute('data-result-state', 'example');
  await page.locator('[name="start"]').fill('09:00');
  await page.locator('[name="end"]').fill('17:30');
  await page.locator('[name="breakMin"]').fill('30');
  await page.getByRole('button', { name: 'Calculate Hours' }).click();
  await expect(page.locator('#hr-result')).toHaveAttribute('data-result-state', 'valid');
  await expect(page.locator('#hr-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('8h 0m');
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('hours: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__hours-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/everyday/hours-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-hours]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /HoursCalculator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__hours-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-hours]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-hours]')).toHaveCount(1);
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
    const fillCalc = async (scope: (s: string) => ReturnType<Page['locator']>, start: string, end: string, breakMin: string) => {
      await scope('[name="start"]').fill(start);
      await scope('[name="end"]').fill(end);
      await scope('[name="breakMin"]').fill(breakMin);
      await scope('button[type="submit"]').click();
    };
    await fillCalc(A, '09:00', '17:30', '30'); // → 8h 0m
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('8h 0m');
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'example'); // B untouched

    await fillCalc(B, '09:00', '12:00', '0'); // → 3h 0m
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('3h 0m');
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('8h 0m'); // A preserved

    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('3h 0m'); // B unaffected by A's reset
  });
});
