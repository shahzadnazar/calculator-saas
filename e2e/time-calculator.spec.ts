import { test, expect, type Page } from '@playwright/test';

/**
 * Time calculator — R17B3 task-first migration (bounded Everyday singleton). Wraps the UNCHANGED
 * toSeconds / combineDurations / breakdownDuration via its OWN time-form.ts binding on the UNCHANGED
 * standard-form runtime. Two duration operands (A / B) in days/hours/minutes/seconds + a native
 * Add/Subtract radio group; the dominant result is the SIGNED normalized duration (a subtraction may be
 * negative — shown with "−"; equal operands are a valid 0) with total seconds as the secondary.
 * Task-first: fields start EMPTY (the legacy island prefilled 2:30:00 / 1:45:00 and auto-calculated a
 * baked-in SSR result that also DIVERGED from the hydrated total formatting — 15300 vs 15,300); this
 * island renders ONE deterministic empty state on the server AND after hydration. Explicit
 * "Calculate Time" → live-after-first, Reset. Whole non-negative components. NO isUsableResult.
 */
const ROUTE = '/everyday/time-calculator';
const EMBED = '/embed/everyday/time-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#tc-result');
const primary = (page: Page) => page.locator('#tc-result [data-result-when~="valid"] [data-result-value]').first();
const summaryLabel = (page: Page) => page.locator('#tc-result [data-result-summary-label]');
const total = (page: Page) => page.locator('[data-tc-total]');
const interpretation = (page: Page) => page.locator('[data-tc-interpretation]');
const rounded = (page: Page) => page.locator('#tc-result [data-tc-rounded]');
const live = (page: Page) => page.locator('#tc-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate Time' });
const region = (page: Page, when: string) => page.locator(`#tc-result [data-result-when~="${when}"]`);

type Dur = { days?: number; hours?: number; minutes?: number; seconds?: number };
const setDur = async (page: Page, side: 'a' | 'b', d: Dur) => {
  for (const u of ['days', 'hours', 'minutes', 'seconds'] as const) {
    if (d[u] !== undefined) await page.locator(`[name="${side}_${u}"]`).fill(String(d[u]));
  }
};
const setOp = async (page: Page, op: 'add' | 'subtract') => {
  await page.locator(`[name="tc_op"][value="${op}"]`).check();
};
const calc = async (page: Page, op: 'add' | 'subtract', a: Dur, b: Dur) => {
  await setDur(page, 'a', a);
  await setDur(page, 'b', b);
  if (op === 'subtract') await setOp(page, 'subtract');
  await submit(page).click();
};

test.describe('time: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- SSR / hydration parity (the divergence fix) ---- */

  test('the server-rendered result region equals the hydrated one — empty, no baked-in example, no flash', async ({ page }) => {
    const raw = await (await page.request.get(ROUTE)).text();
    const server = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        state: d.querySelector('#tc-result')?.getAttribute('data-result-state') ?? null,
        total: d.querySelector('[data-tc-total]')?.textContent?.trim() ?? null,
        primary: d.querySelector('#tc-result [data-result-when~="valid"] [data-result-value]')?.textContent?.trim() ?? null,
      };
    }, raw);
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    const hydrated = {
      state: await shell(page).getAttribute('data-result-state'),
      total: (await total(page).textContent())?.trim(),
      primary: (await primary(page).textContent())?.trim(),
    };
    expect(server.state).toBe('empty');
    expect(hydrated.state).toBe('example');
    expect(server.total).toBe('—');
    // The hydrated panel shows the labelled example; the SSR'd HTML still carries the placeholder.
    expect(hydrated.total).not.toBe('—');
    expect(server.primary).not.toBe(hydrated.primary); // the example arrives only on hydration
    expect(server.total).not.toMatch(/15,?300/); // the legacy baked-in example is gone
  });

  /* ---- initial state ---- */

  test('loads empty — all eight components blank, Add selected, no result, no announcement', async ({ page }) => {
    for (const side of ['a', 'b']) for (const u of ['days', 'hours', 'minutes', 'seconds']) {
      await expect(page.locator(`[name="${side}_${u}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="tc_op"][value="add"]')).toBeChecked();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    // The example fills this calculator's OWN valid region, so it is visible on load.
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
  });

  test('does not calculate before the first submission (component or operation edits)', async ({ page }) => {
    await setDur(page, 'a', { hours: 2, minutes: 30 });
    await setOp(page, 'subtract');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- computation ---- */

  test('ordinary Add: 2h30m + 1h45m → 4h 15m 0s + total + interpretation + announcement', async ({ page }) => {
    await calc(page, 'add', { hours: 2, minutes: 30 }, { hours: 1, minutes: 45 });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Calculated time');
    await expect(primary(page)).toHaveText('4h 15m 0s');
    await expect(total(page)).toHaveText('15,300');
    await expect(interpretation(page)).toHaveText('The two durations were added together.');
    await expect(live(page)).toHaveText('Calculated time: 4 hours, 15 minutes.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('ordinary Subtract to a positive difference: 2h30m − 1h45m → 45m 0s', async ({ page }) => {
    await calc(page, 'subtract', { hours: 2, minutes: 30 }, { hours: 1, minutes: 45 });
    await expect(primary(page)).toHaveText('45m 0s');
    await expect(total(page)).toHaveText('2,700');
    await expect(interpretation(page)).toHaveText('The second duration was subtracted from the first.');
  });

  test('a NEGATIVE subtraction is shown signed: 1m − 2m30s → −1m 30s, −90', async ({ page }) => {
    await calc(page, 'subtract', { minutes: 1 }, { minutes: 2, seconds: 30 });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('−1m 30s');
    await expect(total(page)).toHaveText('−90');
    await expect(interpretation(page)).toContainText('negative');
    await expect(live(page)).toHaveText('Calculated time: minus 1 minute, 30 seconds.');
  });

  test('equal operands subtract to a valid zero that explains itself', async ({ page }) => {
    await calc(page, 'subtract', { hours: 1 }, { hours: 1 });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0s');
    await expect(total(page)).toHaveText('0');
    await expect(interpretation(page)).toContainText('equal');
    await expect(live(page)).toHaveText('Calculated time: 0 seconds.');
  });

  test('carries oversized components: 90m + 90m → 3h 0m 0s', async ({ page }) => {
    await calc(page, 'add', { minutes: 90 }, { minutes: 90 });
    await expect(primary(page)).toHaveText('3h 0m 0s');
    await expect(total(page)).toHaveText('10,800');
  });

  test('borrows across units: 1d − 1s → 23h 59m 59s', async ({ page }) => {
    await calc(page, 'subtract', { days: 1 }, { seconds: 1 });
    await expect(primary(page)).toHaveText('23h 59m 59s');
    await expect(total(page)).toHaveText('86,399');
  });

  /* ---- validation ---- */

  test('an all-empty submission is a form-level "enter a duration" error', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('#tc-result [data-result-invalid-message]')).toContainText('at least one duration value');
  });

  test('a negative component is rejected, associated with its field, and focused (the sign is the operation)', async ({ page }) => {
    // A negative is the reachable invalid input through a native type=number field (a decimal like "1.5"
    // is now VALID; unparseable junk is blanked by the browser — malformed rejection is unit-tested).
    await page.locator('[name="b_minutes"]').fill('-30');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="b_minutes"]')).toHaveText('Time values cannot be negative.');
    await expect(page.locator('[name="b_minutes"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[name="b_minutes"]')).toBeFocused();
  });

  /* ---- decimal components (R17B3.1 — the source accepts them) ---- */

  test('a decimal that lands on whole seconds is EXACT: 1.5h → 1h 30m 0s, total 5,400, no rounding note', async ({ page }) => {
    await calc(page, 'add', { hours: 1.5 }, {});
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('1h 30m 0s');
    await expect(total(page)).toHaveText('5,400');
    await expect(rounded(page)).toBeHidden();
  });

  test('decimal minutes are exact: 1.5m → 1m 30s, total 90', async ({ page }) => {
    await calc(page, 'add', { minutes: 1.5 }, {});
    await expect(primary(page)).toHaveText('1m 30s');
    await expect(total(page)).toHaveText('90');
    await expect(rounded(page)).toBeHidden();
  });

  test('a FRACTIONAL total rounds the primary but keeps the EXACT total + a rounding note: 1.5s → 2s / 1.5', async ({ page }) => {
    await calc(page, 'add', { seconds: 1.5 }, {});
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('2s');
    await expect(total(page)).toHaveText('1.5');
    await expect(rounded(page)).toBeVisible();
    await expect(rounded(page)).toContainText('rounded to the nearest whole second');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('a −0.5s subtraction never shows "−0s": primary "0s", exact total −0.5, still VALID', async ({ page }) => {
    await calc(page, 'subtract', {}, { seconds: 0.5 });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0s');
    await expect(primary(page)).not.toHaveText('−0s');
    await expect(total(page)).toHaveText('−0.5');
    await expect(rounded(page)).toBeVisible();
  });

  /* ---- live update / operation change / invalidate / reset ---- */

  test('after the first result, editing a component recalculates live without moving focus', async ({ page }) => {
    await calc(page, 'add', { hours: 2, minutes: 30 }, { hours: 1, minutes: 45 });
    await expect(primary(page)).toHaveText('4h 15m 0s');
    await page.locator('[name="b_minutes"]').fill('15'); // 2h30m + 1h15m = 3h45m
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('3h 45m 0s');
    await expect(page.locator('[name="b_minutes"]')).toBeFocused();
  });

  test('after the first result, switching the operation recalculates live (add → subtract goes negative)', async ({ page }) => {
    await calc(page, 'add', { hours: 1 }, { hours: 2 });
    await expect(primary(page)).toHaveText('3h 0m 0s');
    await setOp(page, 'subtract'); // 1h − 2h = −1h
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('−1h 0m 0s');
    await expect(total(page)).toHaveText('−3,600');
  });

  test('after the first result, a decimal edit recomputes live (edit a to 1.5h → 1h 30m 0s)', async ({ page }) => {
    await calc(page, 'add', { hours: 1 }, {});
    await expect(primary(page)).toHaveText('1h 0m 0s');
    await page.locator('[name="a_hours"]').fill('1.5');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('1h 30m 0s');
    await expect(total(page)).toHaveText('5,400');
    await expect(page.locator('[name="a_hours"]')).toBeFocused();
  });

  test('an invalid live edit (negative component) clears the stale result, keeping focus', async ({ page }) => {
    await calc(page, 'add', { hours: 2, minutes: 30 }, { hours: 1, minutes: 45 });
    await expect(region(page, 'valid')).toBeVisible();
    await page.locator('[name="a_hours"]').fill('-1'); // now a negative component
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[name="a_hours"]')).toBeFocused();
  });

  test('reset clears every component, restores Add, empties the result and announcement', async ({ page }) => {
    await calc(page, 'subtract', { hours: 2, minutes: 30 }, { hours: 1, minutes: 45 });
    await expect(primary(page)).not.toHaveText('—');
    await page.click('[data-reset]');
    for (const side of ['a', 'b']) for (const u of ['days', 'hours', 'minutes', 'seconds']) {
      await expect(page.locator(`[name="${side}_${u}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="tc_op"][value="add"]')).toBeChecked();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from a component field', async ({ page }) => {
    await setDur(page, 'a', { hours: 2, minutes: 30 });
    await setDur(page, 'b', { hours: 1, minutes: 45 });
    await page.locator('[name="b_seconds"]').press('Enter');
    await expect(primary(page)).toHaveText('4h 15m 0s');
  });

  test('desktop shows the calculated time within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await calc(page, 'add', { hours: 2, minutes: 30 }, { hours: 1, minutes: 45 });
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page, 'subtract', { minutes: 1 }, { minutes: 2, seconds: 30 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page, 'add', { hours: 2, minutes: 30 }, { hours: 1, minutes: 45 });
    await expect(primary(page)).toBeVisible();
  });

  test('the generated embed mounts the same island and computes (empty SSR, then a signed result)', async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tc-result')).toHaveAttribute('data-result-state', 'example');
    await page.locator('[name="a_minutes"]').fill('1');
    await page.locator('[name="b_minutes"]').fill('2');
    await page.locator('[name="b_seconds"]').fill('30');
    await page.locator('[name="tc_op"][value="subtract"]').check();
    await page.getByRole('button', { name: 'Calculate Time' }).click();
    await expect(page.locator('#tc-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#tc-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('−1m 30s');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('time: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__time-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/everyday/time-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-timecalc]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /TimeCalculator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__time-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-timecalc]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-timecalc]')).toHaveCount(1);
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
    const fillCalc = async (scope: (s: string) => ReturnType<Page['locator']>, aMin: string, bMin: string, op: string) => {
      await scope('[name="a_minutes"]').fill(aMin);
      await scope('[name="b_minutes"]').fill(bMin);
      if (op === 'subtract') await scope('[name="tc_op"][value="subtract"]').check();
      await scope('button[type="submit"]').click();
    };
    await fillCalc(A, '2', '30', 'add'); // 2m + 30m = 32m
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('32m 0s');
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'example'); // B untouched

    await fillCalc(B, '5', '3', 'subtract'); // 5m − 3m = 2m
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('2m 0s');
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('32m 0s'); // A preserved

    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('2m 0s'); // B unaffected by A's reset
  });
});
