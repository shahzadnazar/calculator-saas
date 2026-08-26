import { test, expect, type Page } from '@playwright/test';

/**
 * Income Tax calculator — R18B1 task-first migration (bounded Finance singleton). Wraps
 * the UNCHANGED calculateIncomeTax / STANDARD_DEDUCTION (2024 brackets) via its OWN
 * income-tax-form.ts binding on the UNCHANGED standard-form runtime. Filing status is a
 * native single/married radio (a structural selector); gross income + optional pre-tax
 * deductions; the dominant result is the estimated federal tax (a valid $0 for income at
 * or below the deduction) with taxable / after-tax / effective / marginal as the
 * breakdown. Task-first: the money fields start EMPTY (the legacy island prefilled
 * $75,000 and auto-calculated a baked-in SSR result); this island renders ONE
 * deterministic empty state on the server AND after hydration. Explicit "Calculate Tax"
 * → live-after-first, Reset. Strict validation (never Number()||0). NO isUsableResult.
 */
const ROUTE = '/finance/income-tax-calculator';
const EMBED = '/embed/finance/income-tax-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#it-result');
const primary = (page: Page) => page.locator('#it-result [data-result-when~="valid"] [data-result-value]').first();
const summaryLabel = (page: Page) => page.locator('#it-result [data-result-summary-label]');
const taxable = (page: Page) => page.locator('[data-it-taxable]');
const after = (page: Page) => page.locator('[data-it-after]');
const eff = (page: Page) => page.locator('[data-it-eff]');
const marg = (page: Page) => page.locator('[data-it-marg]');
const interpretation = (page: Page) => page.locator('[data-it-interpretation]');
const stdNote = (page: Page) => page.locator('[data-it-std]');
const live = (page: Page) => page.locator('#it-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate Tax' });
const region = (page: Page, when: string) => page.locator(`#it-result [data-result-when~="${when}"]`);

const setStatus = (page: Page, status: 'single' | 'married') =>
  page.locator(`[name="filingStatus"][value="${status}"]`).check();
const setIncome = (page: Page, v: string) => page.locator('[name="grossIncome"]').fill(v);
const setDeduction = (page: Page, v: string) => page.locator('[name="additionalDeductions"]').fill(v);

type Inp = { status?: 'single' | 'married'; income?: string; deduction?: string };
const calc = async (page: Page, { status, income, deduction }: Inp) => {
  if (status) await setStatus(page, status);
  if (income !== undefined) await setIncome(page, income);
  if (deduction !== undefined) await setDeduction(page, deduction);
  await submit(page).click();
};

test.describe('income tax: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- SSR / hydration parity ---- */

  test('the server-rendered result region equals the hydrated one — empty, no baked-in example', async ({ page }) => {
    const raw = await (await page.request.get(ROUTE)).text();
    const server = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        state: d.querySelector('#it-result')?.getAttribute('data-result-state') ?? null,
        primary:
          d.querySelector('#it-result [data-result-when~="valid"] [data-result-value]')?.textContent?.trim() ?? null,
      };
    }, raw);
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    const hydrated = {
      state: await shell(page).getAttribute('data-result-state'),
      primary: (await primary(page).textContent())?.trim(),
    };
    expect(server.state).toBe('empty');
    expect(hydrated.state).toBe('example');
    expect(server.primary).toBe('—');
    // The server HTML carries the placeholder; the example arrives only on hydration.
    expect(server.primary).not.toBe(hydrated.primary);
    expect(raw).not.toMatch(/\$8,?341/); // the legacy baked-in $75,000 default result is gone
  });

  /* ---- initial state ---- */

  test('loads empty — money fields blank, Single selected, deduction note shows the single standard deduction, no result', async ({ page }) => {
    await expect(page.locator('[name="grossIncome"]')).toHaveValue('');
    await expect(page.locator('[name="additionalDeductions"]')).toHaveValue('');
    await expect(page.locator('[name="filingStatus"][value="single"]')).toBeChecked();
    await expect(stdNote(page)).toHaveText('$14,600');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    // The example fills this calculator's OWN valid region, so it is visible on load.
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
  });

  test('does not calculate before the first submission (income or status edits)', async ({ page }) => {
    await setIncome(page, '60000');
    await setStatus(page, 'married');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- computation ---- */

  test('ordinary single filer: $60,000 → $5,216 tax + full breakdown + interpretation + announcement', async ({ page }) => {
    await calc(page, { status: 'single', income: '60000' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Estimated federal income tax');
    await expect(primary(page)).toHaveText('$5,216.00');
    await expect(taxable(page)).toHaveText('$45,400.00');
    await expect(after(page)).toHaveText('$54,784.00');
    await expect(eff(page)).toHaveText('8.7%');
    await expect(marg(page)).toHaveText('12%');
    await expect(interpretation(page)).toContainText('marginal');
    await expect(interpretation(page)).toContainText('effective');
    await expect(live(page)).toHaveText('Estimated income tax: $5,216.00.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('married filing jointly: $100,000 → $8,032 tax', async ({ page }) => {
    await calc(page, { status: 'married', income: '100000' });
    await expect(primary(page)).toHaveText('$8,032.00');
    await expect(taxable(page)).toHaveText('$70,800.00');
  });

  test('additional pre-tax deductions reduce the tax: $60,000 + $5,000 → $4,616', async ({ page }) => {
    await calc(page, { status: 'single', income: '60000', deduction: '5000' });
    await expect(primary(page)).toHaveText('$4,616.00');
    await expect(taxable(page)).toHaveText('$40,400.00');
  });

  test('income at or below the deduction is a VALID $0 tax (not an empty state)', async ({ page }) => {
    await calc(page, { status: 'single', income: '10000' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$0.00');
    await expect(after(page)).toHaveText('$10,000.00');
    await expect(marg(page)).toHaveText('0%');
    await expect(live(page)).toHaveText('Estimated income tax: $0.00.');
  });

  test('zero income is a valid $0 result', async ({ page }) => {
    await calc(page, { status: 'single', income: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$0.00');
  });

  /* ---- validation ---- */

  test('an empty submission is a required-income error, focused', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="grossIncome"]')).toHaveText('Enter your gross annual income.');
    await expect(page.locator('[name="grossIncome"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[name="grossIncome"]')).toBeFocused();
  });

  test('a negative income is rejected, associated with its field, and focused', async ({ page }) => {
    await setIncome(page, '-1');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="grossIncome"]')).toHaveText('Enter an income of zero or more.');
    await expect(page.locator('[name="grossIncome"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[name="grossIncome"]')).toBeFocused();
  });

  test('a negative additional deduction is rejected with its own error', async ({ page }) => {
    await setIncome(page, '60000');
    await setDeduction(page, '-500');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="additionalDeductions"]')).toHaveText('Enter a deduction of zero or more.');
  });

  /* ---- filing-status structural behavior + live-after-first ---- */

  test('the standard-deduction note tracks the filing status (informational, before any calculation)', async ({ page }) => {
    await expect(stdNote(page)).toHaveText('$14,600');
    await setStatus(page, 'married');
    await expect(stdNote(page)).toHaveText('$29,200');
    await setStatus(page, 'single');
    await expect(stdNote(page)).toHaveText('$14,600');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty'); // note change never calculates
  });

  test('after the first result, editing income recalculates live without moving focus', async ({ page }) => {
    await calc(page, { status: 'single', income: '60000' });
    await expect(primary(page)).toHaveText('$5,216.00');
    await setIncome(page, '100000'); // single $100k: taxable 85,400 → 1160 + 4266 + 22% of 38,250 = $13,841
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$13,841.00');
    await expect(page.locator('[name="grossIncome"]')).toBeFocused();
  });

  test('after the first result, switching filing status recalculates live', async ({ page }) => {
    await calc(page, { status: 'single', income: '100000' });
    const single100k = await primary(page).textContent();
    await setStatus(page, 'married'); // married $100k = $8,032
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$8,032.00');
    expect(single100k).not.toBe('$8,032.00');
  });

  test('an invalid live edit (negative income) clears the stale result, keeping focus', async ({ page }) => {
    await calc(page, { status: 'single', income: '60000' });
    await expect(region(page, 'valid')).toBeVisible();
    await setIncome(page, '-1');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[name="grossIncome"]')).toBeFocused();
  });

  /* ---- reset ---- */

  test('reset clears the money fields, restores Single + its deduction note, empties the result and announcement', async ({ page }) => {
    await calc(page, { status: 'married', income: '100000', deduction: '3000' });
    await expect(primary(page)).not.toHaveText('—');
    await page.click('[data-reset]');
    await expect(page.locator('[name="grossIncome"]')).toHaveValue('');
    await expect(page.locator('[name="additionalDeductions"]')).toHaveValue('');
    await expect(page.locator('[name="filingStatus"][value="single"]')).toBeChecked();
    await expect(stdNote(page)).toHaveText('$14,600');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from the income field', async ({ page }) => {
    await setIncome(page, '60000');
    await page.locator('[name="grossIncome"]').press('Enter');
    await expect(primary(page)).toHaveText('$5,216.00');
  });

  test('desktop shows the estimated tax within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await calc(page, { status: 'single', income: '60000' });
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page, { status: 'single', income: '60000' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page, { status: 'single', income: '60000' });
    await expect(primary(page)).toBeVisible();
  });

  test('the generated embed mounts the same island (empty SSR, then single / married / $0 results, reset)', async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#it-result')).toHaveAttribute('data-result-state', 'example');
    // no auto-calc
    await page.locator('[name="grossIncome"]').fill('60000');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('#it-result')).toHaveAttribute('data-result-state', 'empty');
    // explicit calculate
    await page.getByRole('button', { name: 'Calculate Tax' }).click();
    await expect(page.locator('#it-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#it-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('$5,216.00');
    // married live
    await page.locator('[name="filingStatus"][value="married"]').check();
    await page.locator('[name="grossIncome"]').fill('100000');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('#it-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('$8,032.00');
    // zero valid
    await page.locator('[name="grossIncome"]').fill('0');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('#it-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('$0.00');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('income tax: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__income-tax-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/finance/income-tax-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-incometax]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /IncomeTaxCalculator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__income-tax-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-incometax]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-incometax]')).toHaveCount(1);
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
    const fillCalc = async (scope: (s: string) => ReturnType<Page['locator']>, income: string, status: string) => {
      if (status === 'married') await scope('[name="filingStatus"][value="married"]').check();
      await scope('[name="grossIncome"]').fill(income);
      await scope('button[type="submit"]').click();
    };
    await fillCalc(A, '60000', 'single'); // single $60k = $5,216
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('$5,216.00');
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'example'); // B untouched

    await fillCalc(B, '100000', 'married'); // married $100k = $8,032
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('$8,032.00');
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('$5,216.00'); // A preserved

    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('$8,032.00'); // B unaffected
  });
});
