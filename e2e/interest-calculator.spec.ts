import { test, expect, type Page } from '@playwright/test';

/**
 * Interest calculator — R20A1 task-first migration (finance; a simple-vs-compound COMPARISON). One form
 * on the UNCHANGED standard-form runtime via its OWN interest-form.ts binding, which COMPOSES two FROZEN
 * engines — calculateSimpleInterest + calculateCompoundInterest (frozen by interest.test.ts /
 * simple-interest.test.ts / compound-interest.test.ts). Task-first: principal/rate/years start EMPTY,
 * the compounding frequency defaults to Monthly, the result is EMPTY on the server AND after hydration
 * (the legacy island SSR-seeded a $10,000/5%/10y result live). The COMPOUND interest earned is dominant
 * (+ final balance); simple interest, simple final and the compounding advantage are supporting.
 * Expected values are INDEPENDENT hard-coded fixtures (formatCurrency, 2dp), never derived from the
 * page's own composition.
 */

const ROUTE = '/finance/interest-calculator';
const EMBED = '/embed/finance/interest-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#interest-result');
const dominant = (page: Page) => page.locator('#interest-result [data-result-when~="valid"] [data-result-value]').first();
const finalBal = (page: Page) => page.locator('[data-int-final]');
const simpleInt = (page: Page) => page.locator('[data-int-simple]');
const simpleFinal = (page: Page) => page.locator('[data-int-simple-final]');
const advantage = (page: Page) => page.locator('[data-int-advantage]');
const live = (page: Page) => page.locator('#interest-live');
const submit = (page: Page) => page.locator('[data-interest] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#interest-result [data-result-when~="${when}"]`);

type Inp = Partial<{ principal: string; rate: string; years: string; freq: string }>;
const doCalc = async (page: Page, i: Inp) => {
  if (i.principal !== undefined) await page.locator('[name="principal"]').fill(i.principal);
  if (i.rate !== undefined) await page.locator('[name="annualRatePct"]').fill(i.rate);
  if (i.years !== undefined) await page.locator('[name="years"]').fill(i.years);
  if (i.freq !== undefined) await page.locator('[name="compoundsPerYear"]').selectOption(i.freq);
  await submit(page).click();
};

test.describe('interest: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- SSR / hydration parity ---- */

  test('server-rendered result equals the hydrated one — empty, no baked $10,000 sample', async ({ page }) => {
    const raw = await (await page.request.get(ROUTE)).text();
    const server = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        state: d.querySelector('#interest-result')?.getAttribute('data-result-state') ?? null,
        dominant: d.querySelector('#interest-result [data-result-when~="valid"] [data-result-value]')?.textContent?.trim() ?? null,
        principal: d.querySelector<HTMLInputElement>('[name="principal"]')?.getAttribute('value') ?? '',
        freq: d.querySelector<HTMLSelectElement>('[name="compoundsPerYear"]')?.value ?? null,
      };
    }, raw);
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    expect(server.state).toBe('empty');
    expect(server.dominant).toBe('—'); // no baked result
    expect(server.principal).toBe(''); // principal empty
    expect(server.freq).toBe('12'); // Monthly default
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  });

  /* ---- initial state ---- */

  test('loads empty — inputs blank, frequency Monthly, no result', async ({ page }) => {
    await expect(page.locator('[name="principal"]')).toHaveValue('');
    await expect(page.locator('[name="annualRatePct"]')).toHaveValue('');
    await expect(page.locator('[name="years"]')).toHaveValue('');
    await expect(page.locator('[name="compoundsPerYear"]')).toHaveValue('12');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    // The example fills this calculator's OWN valid region, so it is visible on load.
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
  });

  test('does not calculate before the first Calculate', async ({ page }) => {
    await page.locator('[name="principal"]').fill('10000');
    await page.locator('[name="annualRatePct"]').fill('5');
    await page.locator('[name="years"]').fill('10');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- the legacy default sample (independent fixtures) ---- */

  test('10000 / 5% / 10y / monthly → the full comparison + announcement', async ({ page }) => {
    await doCalc(page, { principal: '10000', rate: '5', years: '10' }); // freq stays Monthly
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('$6,470.09'); // compound interest earned (dominant)
    await expect(finalBal(page)).toHaveText('$16,470.09'); // final balance
    await expect(simpleInt(page)).toHaveText('$5,000.00'); // simple interest earned
    await expect(simpleFinal(page)).toHaveText('$15,000.00'); // simple final balance
    await expect(advantage(page)).toHaveText('$1,470.09'); // compounding advantage
    await expect(live(page)).toHaveText('Compound interest earned: $6,470.09; final balance $16,470.09.');
  });

  /* ---- frequency options + simple-side independence ---- */

  test('each compounding frequency changes only the compound side; simple stays $5,000.00', async ({ page }) => {
    await doCalc(page, { principal: '10000', rate: '5', years: '10', freq: '1' }); // annually
    await expect(dominant(page)).toHaveText('$6,288.95');
    await expect(simpleInt(page)).toHaveText('$5,000.00');

    await page.locator('[name="compoundsPerYear"]').selectOption('4'); // quarterly (live-after-first)
    await expect(dominant(page)).toHaveText('$6,436.19');
    await expect(simpleInt(page)).toHaveText('$5,000.00');

    await page.locator('[name="compoundsPerYear"]').selectOption('12'); // monthly
    await expect(dominant(page)).toHaveText('$6,470.09');
    await expect(simpleInt(page)).toHaveText('$5,000.00');

    await page.locator('[name="compoundsPerYear"]').selectOption('365'); // daily
    await expect(dominant(page)).toHaveText('$6,486.65');
    await expect(simpleInt(page)).toHaveText('$5,000.00');
  });

  /* ---- zero result ---- */

  test('a zero rate is a VALID $0 result (final balance = the principal)', async ({ page }) => {
    await doCalc(page, { principal: '10000', rate: '0', years: '10' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('$0.00');
    await expect(finalBal(page)).toHaveText('$10,000.00');
    await expect(advantage(page)).toHaveText('$0.00');
  });

  test('a zero principal is a VALID all-$0 result', async ({ page }) => {
    await doCalc(page, { principal: '0', rate: '5', years: '10' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('$0.00');
    await expect(finalBal(page)).toHaveText('$0.00');
  });

  /* ---- validation ---- */

  test('an empty principal on Calculate is invalid and focuses the principal field', async ({ page }) => {
    await doCalc(page, { rate: '5', years: '10' }); // principal left empty
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[name="principal"]')).toBeFocused();
  });

  test('a negative principal is rejected as invalid', async ({ page }) => {
    await doCalc(page, { principal: '-1000', rate: '5', years: '10' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('a negative rate is rejected as invalid', async ({ page }) => {
    await doCalc(page, { principal: '10000', rate: '-2', years: '10' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  /* ---- live-after-first + stale clearing ---- */

  test('after the first result, editing the principal recalculates live', async ({ page }) => {
    await doCalc(page, { principal: '10000', rate: '5', years: '10' });
    await expect(dominant(page)).toHaveText('$6,470.09');
    await page.locator('[name="principal"]').fill('20000');
    await page.locator('[name="principal"]').blur();
    await expect(dominant(page)).toHaveText('$12,940.19'); // doubles with the principal
  });

  test('an invalid live edit (clearing the principal) clears the stale result', async ({ page }) => {
    await doCalc(page, { principal: '10000', rate: '5', years: '10' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await page.locator('[name="principal"]').fill('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(dominant(page)).toHaveText('—');
    await expect(simpleInt(page)).toHaveText('—');
  });

  /* ---- reset ---- */

  test('reset clears the inputs, restores Monthly, empties the result', async ({ page }) => {
    await doCalc(page, { principal: '25000', rate: '7', years: '20', freq: '365' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await page.locator('[data-reset]').click();
    await expect(page.locator('[name="principal"]')).toHaveValue('');
    await expect(page.locator('[name="annualRatePct"]')).toHaveValue('');
    await expect(page.locator('[name="years"]')).toHaveValue('');
    await expect(page.locator('[name="compoundsPerYear"]')).toHaveValue('12');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / no-scroll-jump / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from the years field', async ({ page }) => {
    await page.locator('[name="principal"]').fill('10000');
    await page.locator('[name="annualRatePct"]').fill('5');
    await page.locator('[name="years"]').fill('10');
    await page.locator('[name="years"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('calculating does not jump the scroll position', async ({ page }) => {
    const before = await page.evaluate(() => window.scrollY);
    await doCalc(page, { principal: '10000', rate: '5', years: '10' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBe(before);
  });

  test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await doCalc(page, { principal: '10000', rate: '5', years: '10' });
    const box = await dominant(page).boundingBox();
    expect(box!.y).toBeLessThan(768);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await doCalc(page, { principal: '10000', rate: '5', years: '10' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await doCalc(page, { principal: '10000', rate: '5', years: '10' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('no NaN / Infinity / undefined renders for an ordinary result', async ({ page }) => {
    await doCalc(page, { principal: '50000', rate: '6.5', years: '30' });
    const text = await shell(page).innerText();
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the generated embed mounts the same island (empty SSR, then a result)', async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await doCalc(page, { principal: '10000', rate: '5', years: '10' });
    await expect(dominant(page)).toHaveText('$6,470.09');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    const html = await page.content();
    expect(html).not.toMatch(/adsbygoogle|data-ad-client|googlesyndication/);
  });
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('interest: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__interest-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/finance/interest-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-interest]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /InterestCalculator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__interest-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-interest]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-interest]')).toHaveCount(1);
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
      await A('[name="annualRatePct"]').fill('5');
      await A('[name="years"]').fill('10');
      await A('button[type="submit"]').click();
    };
    await calcA();
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('$6,470.09');
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'example'); // B untouched

    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
  });
});
