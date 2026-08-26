import { test, expect, type Page } from '@playwright/test';

/**
 * R16B2.1 — Grade same-document instance-isolation proof.
 *
 * Mounts TWO independent, REAL Grade calculator instances in ONE document and proves they do not leak
 * into each other. The harness is test-only: it fetches the actual built grade page's server HTML,
 * takes the pristine `[data-grade]` island root + the real stylesheet links + the REAL built island
 * script, and serves a synthetic two-root document via `page.route(...).fulfill` on the preview origin.
 * At load the real island module runs `document.querySelectorAll('[data-grade]').forEach(...)` and mounts
 * BOTH roots — so this exercises the genuine island behaviour (not a mock), with no `src/pages` route and
 * no change to the production page count.
 *
 * The weighted rows already carry per-instance-unique ids (module-global `uid`). The island additionally
 * namespaces its server-STATIC ids (final-mode fields, result shell, live region) + repoints their in-root
 * references WHEN — and only when — more than one Grade shares the document, so the two instances have no
 * duplicate ids and every association stays instance-local. A lone instance keeps its server ids untouched.
 */
const REAL = 'http://localhost:4399/everyday/grade-calculator';
const FIXTURE = 'http://localhost:4399/__grade-two-instance-fixture';
const DEBOUNCE = 300;

/** Build the two-instance document once (built assets don't change during a run) and cache it. */
let cachedDoc: string | null = null;
async function twoInstanceDoc(page: Page): Promise<string> {
  if (cachedDoc) return cachedDoc;
  const raw = await (await page.request.get(REAL)).text();
  const parts = await page.evaluate((html) => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const root = d.querySelector('[data-grade]');
    const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
    const script = [...d.querySelectorAll('script[type="module"][src]')]
      .map((s) => s.getAttribute('src'))
      .find((src) => /GradeCalculator/.test(src ?? ''));
    return { rootHTML: root?.outerHTML ?? '', links, script };
  }, raw);
  cachedDoc =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
    `</head><body>` +
    `<div id="inst-a">${parts.rootHTML}</div>` +
    `<div id="inst-b">${parts.rootHTML}</div>` +
    `<script type="module" src="${parts.script}"></script>` +
    `</body></html>`;
  return cachedDoc;
}

async function mountTwo(page: Page): Promise<void> {
  const doc = await twoInstanceDoc(page);
  await page.route('**/__grade-two-instance-fixture', (r) =>
    r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }),
  );
  await page.goto(FIXTURE, { waitUntil: 'networkidle' });
  await expect(page.locator('#inst-a [data-grade-row]')).toHaveCount(1);
  await expect(page.locator('#inst-b [data-grade-row]')).toHaveCount(1);
}

/** Instance-scoped locators — everything targeted by `[data-*]` / `[name]`, never by the (namespaced) id. */
const inst = (page: Page, id: 'inst-a' | 'inst-b') => ({
  rows: page.locator(`#${id} [data-grade-row]`),
  row: (i: number) => page.locator(`#${id} [data-grade-row]`).nth(i),
  add: page.locator(`#${id} [data-grade-add]`),
  submit: page.locator(`#${id} [data-grade-submit]`),
  reset: page.locator(`#${id} [data-reset]`),
  avgPanel: page.locator(`#${id} [data-grade-average]`),
  finalPanel: page.locator(`#${id} [data-grade-final]`),
  shell: page.locator(`#${id} [data-result-shell]`),
  primary: page.locator(`#${id} [data-result-when~="valid"] [data-result-value]`).first(),
  summaryLabel: page.locator(`#${id} [data-result-summary-label]`),
  interpretation: page.locator(`#${id} [data-grade-interpretation]`),
  live: page.locator(`#${id} [data-result-live]`),
  validRegion: page.locator(`#${id} [data-result-when~="valid"]`),
  invalidMsg: page.locator(`#${id} [data-result-invalid-message]`),
  mode: (v: 'average' | 'final') => page.locator(`#${id} [name="gmode"][value="${v}"]`),
  current: page.locator(`#${id} [name="current"]`),
  finalWeight: page.locator(`#${id} [name="finalWeight"]`),
  target: page.locator(`#${id} [name="target"]`),
});
type Inst = ReturnType<typeof inst>;

const setRow = async (a: Inst, i: number, score: string, weight: string) => {
  await a.row(i).locator('[data-grade-score]').fill(score);
  await a.row(i).locator('[data-grade-weight]').fill(weight);
};
const state = (a: Inst) => a.shell.getAttribute('data-result-state');

test.describe('grade: same-document instance isolation', () => {
  test.beforeEach(async ({ page }) => {
    await mountTwo(page);
  });

  /* -------------------- initial state -------------------- */

  test('both instances start in Weighted mode, one blank row, no result, no announcement', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    for (const x of [a, b]) {
      await expect(x.mode('average')).toBeChecked();
      await expect(x.mode('final')).not.toBeChecked();
      await expect(x.avgPanel).toBeVisible();
      await expect(x.finalPanel).toBeHidden();
      await expect(x.rows).toHaveCount(1);
      await expect(x.row(0).locator('[data-grade-score]')).toHaveValue('');
      await expect(x.row(0).locator('[data-grade-weight]')).toHaveValue('');
      await expect(x.shell).toHaveAttribute('data-result-state', 'example');
      await expect(x.validRegion).toBeVisible();
      await expect(x.live).toHaveText('');
      await expect(x.row(0).locator('[data-grade-remove]')).toBeDisabled();
    }
  });

  test('generated field ids are unique and no duplicate id attributes exist across the document', async ({ page }) => {
    const rowIds = await page.locator('[data-grade-row]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.rowId));
    expect(new Set(rowIds).size).toBe(rowIds.length); // every row id document-unique
    const duplicates = await page.evaluate(() => {
      const counts: Record<string, number> = {};
      for (const el of document.querySelectorAll('[id]')) counts[el.id] = (counts[el.id] || 0) + 1;
      return Object.entries(counts)
        .filter(([, n]) => n > 1)
        .map(([id]) => id);
    });
    expect(duplicates).toEqual([]);
  });

  test('every label[for] and aria-describedby reference resolves inside its own instance', async ({ page }) => {
    const ok = await page.evaluate(() => {
      for (const scope of ['#inst-a', '#inst-b']) {
        const root = document.querySelector(scope)!;
        const resolvesInScope = (id: string) => {
          const t = document.getElementById(id);
          return !!t && !!t.closest(scope);
        };
        for (const label of root.querySelectorAll('label[for]')) {
          if (!resolvesInScope(label.getAttribute('for')!)) return { ok: false, scope, why: `for=${label.getAttribute('for')}` };
        }
        for (const el of root.querySelectorAll('[aria-describedby]')) {
          for (const ref of el.getAttribute('aria-describedby')!.split(/\s+/)) {
            if (ref && !resolvesInScope(ref)) return { ok: false, scope, why: `aria-describedby=${ref}` };
          }
        }
      }
      return { ok: true };
    });
    expect(ok).toEqual({ ok: true });
  });

  /* -------------------- mode isolation -------------------- */

  test('switching one instance to Final leaves the other in Weighted; a later switch is independent', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await a.mode('final').check();
    await expect(a.finalPanel).toBeVisible();
    await expect(a.submit).toHaveText('Calculate Final Grade Needed');
    // B untouched
    await expect(b.mode('average')).toBeChecked();
    await expect(b.avgPanel).toBeVisible();
    await expect(b.finalPanel).toBeHidden();
    await expect(b.submit).toHaveText('Calculate Weighted Grade');
    // now switch B; A stays final
    await b.mode('final').check();
    await expect(b.finalPanel).toBeVisible();
    await expect(a.finalPanel).toBeVisible();
    await expect(a.mode('final')).toBeChecked();
  });

  test('each instance preserves its own weighted and final values across its own mode switches', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await setRow(a, 0, '90', '50');
    await setRow(b, 0, '70', '30');
    await a.mode('final').check();
    await a.current.fill('80');
    await a.finalWeight.fill('40');
    await a.target.fill('85');
    await a.mode('average').check(); // back to A weighted — its row survives
    await expect(a.row(0).locator('[data-grade-score]')).toHaveValue('90');
    await expect(a.row(0).locator('[data-grade-weight]')).toHaveValue('50');
    await a.mode('final').check(); // A final values survive
    await expect(a.current).toHaveValue('80');
    await expect(a.finalWeight).toHaveValue('40');
    await expect(a.target).toHaveValue('85');
    // B never touched its weighted row through all of A's switching
    await expect(b.row(0).locator('[data-grade-score]')).toHaveValue('70');
    await expect(b.row(0).locator('[data-grade-weight]')).toHaveValue('30');
  });

  /* -------------------- row isolation -------------------- */

  test('adding/removing rows in one instance never changes the other', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await setRow(b, 0, '88', '100'); // B keeps a value we can check survives
    await a.add.click();
    await a.add.click();
    await expect(a.rows).toHaveCount(3);
    await expect(b.rows).toHaveCount(1); // B unchanged
    await expect(a.row(0).locator('[data-grade-remove]')).toBeEnabled(); // A now removable
    await expect(b.row(0).locator('[data-grade-remove]')).toBeDisabled(); // B still at min (independent)
    await a.row(2).locator('[data-grade-remove]').click();
    await expect(a.rows).toHaveCount(2);
    await expect(b.rows).toHaveCount(1);
    await expect(b.row(0).locator('[data-grade-score]')).toHaveValue('88'); // B value intact
  });

  test('a row validation error in one instance does not appear in the other', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await a.row(0).locator('[data-grade-score]').fill('90'); // partial → weight error on submit
    await a.submit.click();
    await expect(a.row(0).locator('[data-error-for^="weight-"]')).toHaveText('Enter a weight for this item.');
    await expect(await state(a)).toBe('invalid');
    // B is untouched: empty, no error, no state change
    await expect(await state(b)).toBe('example');
    await expect(b.row(0).locator('[data-error-for^="weight-"]')).toHaveText('');
  });

  /* -------------------- calculation isolation -------------------- */

  test('a weighted result in one instance leaves the other empty; a second result preserves the first', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await setRow(a, 0, '90', '20');
    await a.submit.click();
    await expect(a.primary).toHaveText('90%');
    await expect(await state(b)).toBe('example');
    await expect(b.validRegion).toBeVisible();
    // now calculate a DIFFERENT weighted result in B; A's result must remain
    await setRow(b, 0, '80', '20');
    await b.submit.click();
    await expect(b.primary).toHaveText('80%');
    await expect(a.primary).toHaveText('90%'); // A preserved
    await expect(a.summaryLabel).toHaveText('Weighted grade');
  });

  test('a final-needed result in one instance does not change the other instance mode, result or announcement', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    // seed B with a weighted result first
    await setRow(b, 0, '75', '40');
    await b.submit.click();
    await expect(b.primary).toHaveText('75%');
    const bLive = await b.live.textContent();
    // A computes a final-needed result
    await a.mode('final').check();
    await a.current.fill('80');
    await a.finalWeight.fill('40');
    await a.target.fill('85');
    await a.submit.click();
    await expect(a.primary).toHaveText('92.5%');
    await expect(a.summaryLabel).toHaveText('Required final score');
    // B unchanged: still weighted mode, still 75%, same announcement
    await expect(b.mode('average')).toBeChecked();
    await expect(b.primary).toHaveText('75%');
    await expect(b.summaryLabel).toHaveText('Weighted grade');
    await expect(b.live).toHaveText(bLive ?? '');
  });

  test('live-after-first edits stay scoped to the instance that was edited', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await setRow(a, 0, '90', '50');
    await a.submit.click();
    await setRow(b, 0, '60', '50');
    await b.submit.click();
    await expect(a.primary).toHaveText('90%');
    await expect(b.primary).toHaveText('60%');
    // live edit A only (add a second item) → only A recomputes
    await a.add.click();
    await setRow(a, 1, '70', '50');
    await page.waitForTimeout(DEBOUNCE);
    await expect(a.primary).toHaveText('80%'); // (90·50 + 70·50)/100
    await expect(b.primary).toHaveText('60%'); // B untouched by A's live edit
  });

  test('the announcement text stays instance-local', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await setRow(a, 0, '90', '20');
    await a.submit.click();
    await expect(a.live).toHaveText('Weighted grade: 90 percent.');
    await expect(b.live).toHaveText(''); // B's live region never received A's text
  });

  test('a field error in one instance targets only that instance controls', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await a.mode('final').check();
    await a.finalWeight.fill('30'); // current + target blank → field errors in A
    await a.submit.click();
    await expect(page.locator('#inst-a [data-error-for="current"]')).toHaveText('Enter your current grade.');
    await expect(page.locator('#inst-a [data-error-for="target"]')).toHaveText('Enter your target grade.');
    // B's final error slots (present but hidden) never received text
    await expect(page.locator('#inst-b [data-error-for="current"]')).toHaveText('');
    await expect(page.locator('#inst-b [data-error-for="target"]')).toHaveText('');
    await expect(await state(b)).toBe('example');
  });

  /* -------------------- reset isolation -------------------- */

  test('resetting one instance restores only that instance', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    // A: final result. B: weighted result with two rows.
    await a.mode('final').check();
    await a.current.fill('80');
    await a.finalWeight.fill('40');
    await a.target.fill('85');
    await a.submit.click();
    await expect(a.primary).toHaveText('92.5%');
    await b.add.click();
    await setRow(b, 0, '90', '50');
    await setRow(b, 1, '70', '50');
    await b.submit.click();
    await expect(b.primary).toHaveText('80%');
    const bLive = await b.live.textContent();

    await a.reset.click();
    // A fully restored
    await expect(a.mode('average')).toBeChecked();
    await expect(a.avgPanel).toBeVisible();
    await expect(a.finalPanel).toBeHidden();
    await expect(a.rows).toHaveCount(1);
    await expect(a.row(0).locator('[data-grade-score]')).toHaveValue('');
    await expect(await state(a)).toBe('empty');
    await expect(a.live).toHaveText('');
    await a.mode('final').check();
    await expect(a.current).toHaveValue(''); // A final fields cleared
    await expect(a.target).toHaveValue('');
    // B entirely unaffected
    await expect(b.mode('average')).toBeChecked();
    await expect(b.rows).toHaveCount(2);
    await expect(b.row(0).locator('[data-grade-score]')).toHaveValue('90');
    await expect(b.row(1).locator('[data-grade-score]')).toHaveValue('70');
    await expect(b.primary).toHaveText('80%');
    await expect(b.interpretation).not.toHaveText('—');
    await expect(b.live).toHaveText(bLive ?? '');
  });
});
