import { test, expect, type Page } from '@playwright/test';

/**
 * Compound Interest calculator — R21A1 task-first migration (finance; the FINAL legacy migration). One
 * form on the UNCHANGED standard-form runtime via its OWN compound-interest-form.ts binding, wrapping
 * the UNCHANGED calculateCompoundInterest (frozen by compound-interest.test.ts; the SHARED engine).
 * Task-first: principal/rate/years start EMPTY, frequency defaults Monthly, contribution optional, the
 * result is EMPTY on the server AND after hydration (the legacy island seeded a $10,000/7%/20y/$200
 * result live). FUTURE VALUE dominant + proportion bar + breakdown + Balance-by-year table. Expected
 * values are INDEPENDENT hard-coded fixtures (formatCurrency 2dp / formatCurrencyRounded 0dp).
 */

const ROUTE = '/finance/compound-interest-calculator';
const EMBED = '/embed/finance/compound-interest-calculator';
const GUIDE = '/guides/understanding-compound-interest';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#compound-result');
const dominant = (page: Page) => page.locator('#compound-result [data-result-when~="valid"] [data-result-value]').first();
const principal = (page: Page) => page.locator('[data-ci-principal]');
const contrib = (page: Page) => page.locator('[data-ci-contrib]');
const interest = (page: Page) => page.locator('[data-ci-interest]');
const live = (page: Page) => page.locator('#compound-live');
const submit = (page: Page) => page.locator('[data-compound] button[type="submit"]');
const rows = (page: Page) => page.locator('[data-ci-rows] tr');
const region = (page: Page, when: string) => page.locator(`#compound-result [data-result-when~="${when}"]`);

type Inp = Partial<{ principal: string; rate: string; years: string; freq: string; contribution: string }>;
const doCalc = async (page: Page, i: Inp) => {
  if (i.principal !== undefined) await page.locator('[name="principal"]').fill(i.principal);
  if (i.rate !== undefined) await page.locator('[name="annualRatePct"]').fill(i.rate);
  if (i.years !== undefined) await page.locator('[name="years"]').fill(i.years);
  if (i.freq !== undefined) await page.locator('[name="compoundsPerYear"]').selectOption(i.freq);
  if (i.contribution !== undefined) await page.locator('[name="contribution"]').fill(i.contribution);
  await submit(page).click();
};
const DEFAULT: Inp = { principal: '10000', rate: '7', years: '20', contribution: '200' };

test.describe('compound-interest: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- SSR / hydration parity ---- */

  test('server-rendered result equals the hydrated one — empty, no baked $10,000 sample', async ({ page }) => {
    const raw = await (await page.request.get(ROUTE)).text();
    const server = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        state: d.querySelector('#compound-result')?.getAttribute('data-result-state') ?? null,
        dominant: d.querySelector('#compound-result [data-result-when~="valid"] [data-result-value]')?.textContent?.trim() ?? null,
        principal: d.querySelector<HTMLInputElement>('[name="principal"]')?.getAttribute('value') ?? '',
        freq: d.querySelector<HTMLSelectElement>('[name="compoundsPerYear"]')?.value ?? null,
        rowCount: d.querySelectorAll('[data-ci-rows] tr').length,
      };
    }, raw);
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    expect(server.state).toBe('empty');
    expect(server.dominant).toBe('—');
    expect(server.principal).toBe('');
    expect(server.freq).toBe('12');
    expect(server.rowCount).toBe(0); // no baked series
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- initial state ---- */

  test('loads empty — inputs blank, frequency Monthly, no result', async ({ page }) => {
    await expect(page.locator('[name="principal"]')).toHaveValue('');
    await expect(page.locator('[name="annualRatePct"]')).toHaveValue('');
    await expect(page.locator('[name="years"]')).toHaveValue('');
    await expect(page.locator('[name="compoundsPerYear"]')).toHaveValue('12');
    await expect(page.locator('[name="contribution"]')).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(live(page)).toHaveText('');
  });

  test('does not calculate before the first Calculate', async ({ page }) => {
    await page.locator('[name="principal"]').fill('10000');
    await page.locator('[name="annualRatePct"]').fill('7');
    await page.locator('[name="years"]').fill('20');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- the legacy default sample (independent fixtures) ---- */

  test('10000 / 7% / 20y / monthly / $200 → future value + breakdown + announcement', async ({ page }) => {
    await doCalc(page, DEFAULT);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('$144,572.72'); // future value (dominant)
    await expect(principal(page)).toHaveText('$10,000');
    await expect(contrib(page)).toHaveText('$48,000');
    await expect(interest(page)).toHaveText('$86,573'); // rounded
    await expect(live(page)).toHaveText('Future value after 20 years: $144,572.72, including $86,572.72 in interest earned.');
  });

  test('the proportion bar segments get non-zero widths that reflect the split', async ({ page }) => {
    await doCalc(page, DEFAULT);
    const widths = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#compound-result [data-ci-seg]')].map((el) => el.style.width),
    );
    // three segments, each a non-empty percentage, none 0% for this positive result
    expect(widths).toHaveLength(3);
    for (const w of widths) expect(w).toMatch(/^\d+(\.\d+)?%$/);
    for (const w of widths) expect(parseFloat(w)).toBeGreaterThan(0);
  });

  /* ---- yearly series table ---- */

  test('the Balance-by-year table has 21 rows with the exact year-0 and final rows', async ({ page }) => {
    await doCalc(page, DEFAULT);
    await expect(rows(page)).toHaveCount(21); // year 0..20
    const first = rows(page).nth(0);
    await expect(first.locator('th')).toHaveText('0');
    await expect(first.locator('td').nth(2)).toHaveText('$10,000'); // year-0 balance = principal
    const last = rows(page).nth(20);
    await expect(last.locator('th')).toHaveText('20');
    await expect(last.locator('td').nth(0)).toHaveText('$48,000'); // cumulative contributions
    await expect(last.locator('td').nth(1)).toHaveText('$86,573'); // cumulative interest
    await expect(last.locator('td').nth(2)).toHaveText('$144,573'); // final balance
  });

  /* ---- frequency options ---- */

  test('each compounding frequency recomputes (Semi-annually is a distinct option)', async ({ page }) => {
    await doCalc(page, { ...DEFAULT, freq: '1' }); // annually
    await expect(dominant(page)).toHaveText('$46,895.94');
    await page.locator('[name="compoundsPerYear"]').selectOption('2'); // semi-annually (live-after-first)
    await expect(dominant(page)).toHaveText('$56,502.65');
    await page.locator('[name="compoundsPerYear"]').selectOption('12'); // monthly
    await expect(dominant(page)).toHaveText('$144,572.72');
  });

  /* ---- contribution + zero cases ---- */

  test('a blank contribution is treated as 0', async ({ page }) => {
    await doCalc(page, { principal: '10000', rate: '7', years: '20', contribution: '' });
    await expect(dominant(page)).toHaveText('$40,387.39');
    await expect(contrib(page)).toHaveText('$0');
  });

  test('a zero rate is a VALID result: only the deposits accumulate, interest $0', async ({ page }) => {
    await doCalc(page, { principal: '5000', rate: '0', years: '10', contribution: '100' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('$17,000.00');
    await expect(contrib(page)).toHaveText('$12,000');
    await expect(interest(page)).toHaveText('$0');
  });

  /* ---- validation ---- */

  test('an empty principal on Calculate is invalid and focuses the principal field', async ({ page }) => {
    await doCalc(page, { rate: '7', years: '20' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[name="principal"]')).toBeFocused();
  });

  test('a fractional or out-of-range years is rejected', async ({ page }) => {
    await doCalc(page, { ...DEFAULT, years: '1.5' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await page.locator('[name="years"]').fill('101');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('negative principal / rate / contribution are rejected', async ({ page }) => {
    await doCalc(page, { ...DEFAULT, principal: '-1000' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await page.locator('[name="principal"]').fill('10000');
    await page.locator('[name="contribution"]').fill('-50');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  /* ---- live-after-first + stale clearing ---- */

  test('after the first result, editing the principal recalculates live', async ({ page }) => {
    await doCalc(page, DEFAULT);
    await expect(dominant(page)).toHaveText('$144,572.72');
    await page.locator('[name="principal"]').fill('20000');
    await page.locator('[name="principal"]').blur();
    await expect(dominant(page)).not.toHaveText('$144,572.72');
  });

  test('an invalid live edit clears the stale result AND the series table', async ({ page }) => {
    await doCalc(page, DEFAULT);
    await expect(rows(page)).toHaveCount(21);
    await page.locator('[name="principal"]').fill('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(dominant(page)).toHaveText('—');
    await expect(rows(page)).toHaveCount(0); // series cleared
  });

  /* ---- reset ---- */

  test('reset clears the inputs, restores Monthly, empties the result + series', async ({ page }) => {
    await doCalc(page, { ...DEFAULT, freq: '365' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await page.locator('[data-reset]').click();
    await expect(page.locator('[name="principal"]')).toHaveValue('');
    await expect(page.locator('[name="annualRatePct"]')).toHaveValue('');
    await expect(page.locator('[name="years"]')).toHaveValue('');
    await expect(page.locator('[name="compoundsPerYear"]')).toHaveValue('12');
    await expect(page.locator('[name="contribution"]')).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(rows(page)).toHaveCount(0);
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / no-scroll-jump / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from the years field', async ({ page }) => {
    await page.locator('[name="principal"]').fill('10000');
    await page.locator('[name="annualRatePct"]').fill('7');
    await page.locator('[name="years"]').fill('20');
    await page.locator('[name="years"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('calculating does not jump the scroll position', async ({ page }) => {
    const before = await page.evaluate(() => window.scrollY);
    await doCalc(page, DEFAULT);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test('desktop shows the future value within the first viewport; no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await doCalc(page, DEFAULT);
    const box = await dominant(page).boundingBox();
    expect(box!.y).toBeLessThan(768);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await doCalc(page, DEFAULT);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await doCalc(page, DEFAULT);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('no NaN / Infinity / undefined renders for an ordinary result', async ({ page }) => {
    await doCalc(page, { principal: '50000', rate: '6.5', years: '30', contribution: '500' });
    const text = await shell(page).innerText();
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the generated embed mounts the same island (empty SSR, then a result)', async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await doCalc(page, DEFAULT);
    await expect(dominant(page)).toHaveText('$144,572.72');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    const html = await page.content();
    expect(html).not.toMatch(/adsbygoogle|data-ad-client|googlesyndication/);
  });
});

/* -------------------- guide-embed regression -------------------- */

test.describe('compound-interest: understanding-compound-interest guide embed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
  });

  test('the island mounts inside the guide, empty-first, and calculates + renders the table', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await expect(page.locator('[data-compound]')).toHaveCount(1);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await doCalc(page, DEFAULT);
    await expect(dominant(page)).toHaveText('$144,572.72');
    await expect(rows(page)).toHaveCount(21);
    expect(errors).toEqual([]); // no hydration/runtime errors
  });
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('compound-interest: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__compound-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/finance/compound-interest-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-compound]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /CompoundInterestCalculator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__compound-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-compound]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-compound]')).toHaveCount(1);
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
    const calcA = async () => {
      await A('[name="principal"]').fill('10000');
      await A('[name="annualRatePct"]').fill('7');
      await A('[name="years"]').fill('20');
      await A('[name="contribution"]').fill('200');
      await A('button[type="submit"]').click();
    };
    await calcA();
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('$144,572.72');
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty'); // B untouched
    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
  });
});
