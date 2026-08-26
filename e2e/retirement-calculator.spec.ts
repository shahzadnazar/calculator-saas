import { test, expect, type Page } from '@playwright/test';

/**
 * Retirement calculator — R18B3 task-first migration (finance complex-form; SHARED compound
 * engine frozen). Wraps the UNCHANGED calculateRetirement (delegating to calculateCompoundInterest)
 * via its OWN retirement-form.ts binding on the UNCHANGED standard-form runtime. Task-first,
 * summary-only: personal fields start EMPTY (withdrawal rate prefilled 4%), the result is empty
 * on the server AND after hydration (the legacy island prefilled a $25k/$500/6% scenario and
 * auto-calculated). The dominant result is the projected nest egg; estimated income + contributions
 * + growth are supporting; the latent yearly series is NOT rendered. Ages are whole years with
 * retirement > current; savings + contribution collectively fund the projection. Compound values
 * are asserted by PROPERTIES; only zero-growth cases are pinned exactly. NO isUsableResult.
 */
const ROUTE = '/finance/retirement-calculator';
const EMBED = '/embed/finance/retirement-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#ret-result');
const primary = (page: Page) => page.locator('#ret-result [data-result-when~="valid"] [data-result-value]').first();
const summaryLabel = (page: Page) => page.locator('#ret-result [data-result-summary-label]');
const years = (page: Page) => page.locator('[data-ret-years]');
const monthlyIncome = (page: Page) => page.locator('[data-ret-monthly-income]');
const annualIncome = (page: Page) => page.locator('[data-ret-annual-income]');
const contrib = (page: Page) => page.locator('[data-ret-contrib]');
const earn = (page: Page) => page.locator('[data-ret-earn]');
const interpretation = (page: Page) => page.locator('[data-ret-interpretation]');
const live = (page: Page) => page.locator('#ret-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate Retirement' });
const region = (page: Page, when: string) => page.locator(`#ret-result [data-result-when~="${when}"]`);
const invalidMsg = (page: Page) => page.locator('#ret-result [data-result-invalid-message]');

type Inp = Partial<{ currentAge: string; retirementAge: string; currentSavings: string; monthlyContribution: string; annualReturnPct: string; withdrawalRatePct: string }>;
const fillAll = async (page: Page, i: Inp) => {
  for (const [name, v] of Object.entries(i)) await page.locator(`[name="${name}"]`).fill(v as string);
};
const calc = async (page: Page, i: Inp) => {
  await fillAll(page, i);
  await submit(page).click();
};
const ORD: Inp = { currentAge: '30', retirementAge: '65', currentSavings: '25000', monthlyContribution: '500', annualReturnPct: '6' };

test.describe('retirement: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- SSR / hydration parity ---- */

  test('the server-rendered result region equals the hydrated one — empty, no baked-in projection', async ({ page }) => {
    const raw = await (await page.request.get(ROUTE)).text();
    const server = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        state: d.querySelector('#ret-result')?.getAttribute('data-result-state') ?? null,
        primary: d.querySelector('#ret-result [data-result-when~="valid"] [data-result-value]')?.textContent?.trim() ?? null,
      };
    }, raw);
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    expect(server.state).toBe('empty');
    expect(server.primary).toBe('—');
    // The example is rendered on hydration, never baked into the HTML — so the two DIFFER.
    expect(server.primary).not.toBe((await primary(page).textContent())?.trim());
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  });

  /* ---- initial state ---- */

  test('loads empty — personal fields blank, withdrawal rate prefilled 4, no result', async ({ page }) => {
    for (const n of ['currentAge', 'retirementAge', 'currentSavings', 'monthlyContribution', 'annualReturnPct']) {
      await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="withdrawalRatePct"]')).toHaveValue('4');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    // The example fills this calculator's OWN valid region, so it is visible on load.
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await fillAll(page, ORD);
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- computation ---- */

  test('ordinary projection: nest egg, horizon, income, breakdown, interpretation, announcement', async ({ page }) => {
    await calc(page, ORD);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Projected retirement balance');
    await expect(primary(page)).toHaveText(/^\$[\d,]+\.\d{2}$/); // a real currency figure
    await expect(years(page)).toHaveText('35');
    await expect(monthlyIncome(page)).toHaveText(/^\$[\d,]+\.\d{2}$/);
    await expect(annualIncome(page)).toHaveText(/^\$[\d,]+$/);
    await expect(contrib(page)).toHaveText('$210,000'); // 500 × 12 × 35 (contributions are exact)
    await expect(interpretation(page)).toContainText('withdrawal rate');
    await expect(live(page)).toHaveText(/^Projected retirement balance: \$[\d,]+\.\d{2}\.$/);
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('a zero-growth projection is exact: $100k, 0% return, 0 contribution → $100,000 nest egg, $4,000/yr income', async ({ page }) => {
    await calc(page, { currentAge: '40', retirementAge: '60', currentSavings: '100000', monthlyContribution: '0', annualReturnPct: '0', withdrawalRatePct: '4' });
    await expect(primary(page)).toHaveText('$100,000.00');
    await expect(annualIncome(page)).toHaveText('$4,000');
    await expect(monthlyIncome(page)).toHaveText('$333.33');
    await expect(earn(page)).toHaveText('$0'); // no growth
  });

  test('zero return with contributions: growth is $0 and the nest egg is savings + contributions', async ({ page }) => {
    await calc(page, { currentAge: '30', retirementAge: '40', currentSavings: '50000', monthlyContribution: '200', annualReturnPct: '0' });
    await expect(primary(page)).toHaveText('$74,000.00'); // 50000 + 10×12×200
    await expect(contrib(page)).toHaveText('$24,000');
    await expect(earn(page)).toHaveText('$0');
  });

  test('zero current savings is funded by contributions alone', async ({ page }) => {
    await calc(page, { currentAge: '30', retirementAge: '40', currentSavings: '0', monthlyContribution: '300', annualReturnPct: '5' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText(/^\$[\d,]+\.\d{2}$/);
    await expect(contrib(page)).toHaveText('$36,000'); // 300 × 12 × 10
  });

  test('zero contribution grows only the current savings', async ({ page }) => {
    await calc(page, { currentAge: '30', retirementAge: '40', currentSavings: '50000', monthlyContribution: '0', annualReturnPct: '5' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(contrib(page)).toHaveText('$0');
  });

  /* ---- validation ---- */

  test('an empty submission focuses the first required field', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="currentAge"]')).toHaveText('Enter your current age.');
    await expect(page.locator('[name="currentAge"]')).toBeFocused();
  });

  test('retirement age not greater than current age is a cross-field form error', async ({ page }) => {
    await calc(page, { currentAge: '65', retirementAge: '60', currentSavings: '50000', annualReturnPct: '5' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(invalidMsg(page)).toContainText('Retirement age must be greater than your current age');
    // equal ages too
    await page.locator('[name="retirementAge"]').fill('65');
    await submit(page).click();
    await expect(invalidMsg(page)).toContainText('Retirement age must be greater than your current age');
  });

  test('a zero-funded projection (0 savings, 0 contribution) is a VALID all-zero result, not a funding error', async ({ page }) => {
    await calc(page, { currentAge: '30', retirementAge: '65', currentSavings: '0', monthlyContribution: '0', annualReturnPct: '6', withdrawalRatePct: '4' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$0.00');
    await expect(years(page)).toHaveText('35'); // horizon still valid
    await expect(monthlyIncome(page)).toHaveText('$0.00');
    await expect(annualIncome(page)).toHaveText('$0');
    await expect(contrib(page)).toHaveText('$0');
    await expect(earn(page)).toHaveText('$0');
    await expect(live(page)).toHaveText('Projected retirement balance: $0.00.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('empty savings and empty contribution also produce the valid $0.00 projection', async ({ page }) => {
    await page.locator('[name="currentAge"]').fill('40');
    await page.locator('[name="retirementAge"]').fill('60');
    await page.locator('[name="annualReturnPct"]').fill('5'); // savings + contribution left empty → 0
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$0.00');
    await expect(earn(page)).toHaveText('$0');
  });

  test('an age above 120 is accepted — no invented upper cap', async ({ page }) => {
    await calc(page, { currentAge: '125', retirementAge: '130', currentSavings: '5000', monthlyContribution: '50', annualReturnPct: '4' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(years(page)).toHaveText('5');
    await expect(primary(page)).toHaveText(/^\$[\d,]+\.\d{2}$/);
  });

  test('a negative return is rejected with its field error', async ({ page }) => {
    await calc(page, { currentAge: '30', retirementAge: '65', currentSavings: '25000', annualReturnPct: '-5' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="annualReturnPct"]')).toHaveText('Enter an annual return of zero or more.');
    await expect(page.locator('[name="annualReturnPct"]')).toBeFocused();
  });

  /* ---- live-after-first / invalidate / reset ---- */

  test('after the first result, editing recalculates live without moving focus', async ({ page }) => {
    await calc(page, ORD);
    const before = await primary(page).textContent();
    await page.locator('[name="monthlyContribution"]').fill('1000'); // higher contribution → bigger nest egg
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).not.toHaveText(before ?? '');
    await expect(contrib(page)).toHaveText('$420,000'); // 1000 × 12 × 35
    await expect(page.locator('[name="monthlyContribution"]')).toBeFocused();
  });

  test('live-after-first works starting FROM a zero result: adding savings updates it live', async ({ page }) => {
    await calc(page, { currentAge: '30', retirementAge: '40', currentSavings: '0', monthlyContribution: '0', annualReturnPct: '0', withdrawalRatePct: '4' });
    await expect(primary(page)).toHaveText('$0.00');
    await page.locator('[name="currentSavings"]').fill('10000');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$10,000.00'); // 0% return, no contribution → savings unchanged over 10 yrs
    await expect(page.locator('[name="currentSavings"]')).toBeFocused();
  });

  test('an invalid live edit clears the stale result, keeping focus', async ({ page }) => {
    await calc(page, ORD);
    await expect(region(page, 'valid')).toBeVisible();
    await page.locator('[name="retirementAge"]').fill('20'); // now retirement < current
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[name="retirementAge"]')).toBeFocused();
  });

  test('reset clears the personal fields, restores the 4% withdrawal rate, empties the result', async ({ page }) => {
    await calc(page, ORD);
    await expect(primary(page)).not.toHaveText('—');
    await page.click('[data-reset]');
    for (const n of ['currentAge', 'retirementAge', 'currentSavings', 'monthlyContribution', 'annualReturnPct']) {
      await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="withdrawalRatePct"]')).toHaveValue('4');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from a field', async ({ page }) => {
    await fillAll(page, ORD);
    await page.locator('[name="annualReturnPct"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('desktop shows the projected balance within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await calc(page, ORD);
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page, ORD);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page, ORD);
    await expect(primary(page)).toBeVisible();
  });

  test('the generated embed mounts the same island (empty SSR, no auto-calc, then a projection)', async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#ret-result')).toHaveAttribute('data-result-state', 'example');
    await page.locator('[name="currentAge"]').fill('30');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('#ret-result')).toHaveAttribute('data-result-state', 'empty'); // no auto-calc
    await page.locator('[name="retirementAge"]').fill('60');
    await page.locator('[name="currentSavings"]').fill('100000');
    await page.locator('[name="monthlyContribution"]').fill('0');
    await page.locator('[name="annualReturnPct"]').fill('0');
    await page.getByRole('button', { name: 'Calculate Retirement' }).click();
    await expect(page.locator('#ret-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#ret-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('$100,000.00');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('retirement: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__retirement-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/finance/retirement-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-retirement]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /RetirementCalculator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__retirement-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-retirement]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-retirement]')).toHaveCount(1);
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
      await scope('[name="currentAge"]').fill('40');
      await scope('[name="retirementAge"]').fill('60');
      await scope('[name="currentSavings"]').fill('100000');
      await scope('[name="monthlyContribution"]').fill('0');
      await scope('[name="annualReturnPct"]').fill('0');
      await scope('button[type="submit"]').click();
    };
    await fill(A);
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('$100,000.00');
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'example'); // B untouched

    await fill(B);
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('$100,000.00');

    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('$100,000.00'); // B unaffected
  });
});
