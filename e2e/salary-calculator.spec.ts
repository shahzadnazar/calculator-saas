import { test, expect, type Page } from '@playwright/test';

/**
 * Salary calculator — R19A1 task-first migration (finance; a pay-period converter). One form on the
 * UNCHANGED standard-form runtime via its OWN salary-form.ts binding, wrapping the UNCHANGED
 * convertSalary (frozen by salary.test.ts; self-contained, no shared engine). Task-first: the pay
 * AMOUNT starts EMPTY, the unit defaults to hourly, the schedule assumptions keep 40/5/52, the result
 * is EMPTY on the server AND after hydration (the legacy island auto-calculated a $25/hr example live).
 * The ANNUAL salary is dominant; monthly/biweekly/weekly/daily/hourly are supporting. Expected values
 * are INDEPENDENT hard-coded fixtures (formatCurrency, 2dp), never derived from the page's convertSalary.
 */

const ROUTE = '/finance/salary-calculator';
const EMBED = '/embed/finance/salary-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#salary-result');
const dominant = (page: Page) => page.locator('#salary-result [data-result-when~="valid"] [data-result-value]').first();
const monthly = (page: Page) => page.locator('[data-sal-monthly]');
const biweekly = (page: Page) => page.locator('[data-sal-biweekly]');
const weekly = (page: Page) => page.locator('[data-sal-weekly]');
const daily = (page: Page) => page.locator('[data-sal-daily]');
const hourly = (page: Page) => page.locator('[data-sal-hourly]');
const live = (page: Page) => page.locator('#salary-live');
const submit = (page: Page) => page.locator('[data-salary] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#salary-result [data-result-when~="${when}"]`);

type Inp = Partial<{ amount: string; unit: string; hpw: string; dpw: string; wpy: string }>;
const doConvert = async (page: Page, i: Inp) => {
  if (i.unit) await page.locator('[name="unit"]').selectOption(i.unit);
  if (i.amount !== undefined) await page.locator('[name="amount"]').fill(i.amount);
  if (i.hpw !== undefined) await page.locator('[name="hoursPerWeek"]').fill(i.hpw);
  if (i.dpw !== undefined) await page.locator('[name="daysPerWeek"]').fill(i.dpw);
  if (i.wpy !== undefined) await page.locator('[name="weeksPerYear"]').fill(i.wpy);
  await submit(page).click();
};

test.describe('salary: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- SSR / hydration parity ---- */

  test('server-rendered result equals the hydrated one — empty, no baked salary', async ({ page }) => {
    const raw = await (await page.request.get(ROUTE)).text();
    const server = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        state: d.querySelector('#salary-result')?.getAttribute('data-result-state') ?? null,
        dominant: d.querySelector('#salary-result [data-result-when~="valid"] [data-result-value]')?.textContent?.trim() ?? null,
        amount: d.querySelector<HTMLInputElement>('[name="amount"]')?.getAttribute('value') ?? '',
        unit: d.querySelector<HTMLSelectElement>('[name="unit"]')?.value ?? null,
      };
    }, raw);
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    expect(server.state).toBe('empty');
    expect(server.dominant).toBe('—'); // no baked salary
    expect(server.amount).toBe(''); // amount empty
    expect(server.unit).toBe('hourly');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- initial state ---- */

  test('loads empty — amount blank, unit hourly, 40/5/52 assumptions, no result', async ({ page }) => {
    await expect(page.locator('[name="amount"]')).toHaveValue('');
    await expect(page.locator('[name="unit"]')).toHaveValue('hourly');
    await expect(page.locator('[name="hoursPerWeek"]')).toHaveValue('40');
    await expect(page.locator('[name="daysPerWeek"]')).toHaveValue('5');
    await expect(page.locator('[name="weeksPerYear"]')).toHaveValue('52');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(live(page)).toHaveText('');
  });

  test('does not convert before the first Convert', async ({ page }) => {
    await page.locator('[name="amount"]').fill('25');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- conversions (independent fixtures) ---- */

  test('hourly 25 → annual $52,000.00 dominant + every equivalent + announcement', async ({ page }) => {
    await doConvert(page, { amount: '25', unit: 'hourly' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('$52,000.00');
    await expect(monthly(page)).toHaveText('$4,333.33');
    await expect(biweekly(page)).toHaveText('$2,000.00');
    await expect(weekly(page)).toHaveText('$1,000.00');
    await expect(daily(page)).toHaveText('$200.00');
    await expect(hourly(page)).toHaveText('$25.00');
    await expect(live(page)).toHaveText('Annual salary: $52,000.00.');
  });

  test('annual 60000 → hourly $28.85, monthly $5,000.00', async ({ page }) => {
    await doConvert(page, { amount: '60000', unit: 'annual' });
    await expect(dominant(page)).toHaveText('$60,000.00');
    await expect(hourly(page)).toHaveText('$28.85');
    await expect(monthly(page)).toHaveText('$5,000.00');
  });

  test('a zero pay amount is a VALID $0 result (not empty or invalid)', async ({ page }) => {
    await doConvert(page, { amount: '0', unit: 'hourly' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('$0.00');
    await expect(hourly(page)).toHaveText('$0.00');
  });

  test('custom hours/week (30) scales the annual to $39,000.00', async ({ page }) => {
    await doConvert(page, { amount: '25', unit: 'hourly', hpw: '30' });
    await expect(dominant(page)).toHaveText('$39,000.00');
  });

  /* ---- validation ---- */

  test('an empty amount on Convert is invalid and focuses the amount field', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[name="amount"]')).toBeFocused();
  });

  test('a negative amount is rejected as invalid', async ({ page }) => {
    await doConvert(page, { amount: '-5', unit: 'hourly' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('a zero schedule assumption is rejected as invalid', async ({ page }) => {
    await doConvert(page, { amount: '25', unit: 'hourly', hpw: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  /* ---- live-after-first + stale clearing ---- */

  test('after the first result, editing the amount recalculates live', async ({ page }) => {
    await doConvert(page, { amount: '25', unit: 'hourly' });
    await expect(dominant(page)).toHaveText('$52,000.00');
    await page.locator('[name="amount"]').fill('50');
    await page.locator('[name="amount"]').blur();
    await expect(dominant(page)).toHaveText('$104,000.00');
  });

  test('after the first result, changing the pay unit recalculates live', async ({ page }) => {
    await doConvert(page, { amount: '2000', unit: 'hourly' });
    await page.locator('[name="unit"]').selectOption('annual'); // 2000/yr now
    await expect(dominant(page)).toHaveText('$2,000.00');
  });

  test('an invalid live edit (clearing the amount) clears the stale result', async ({ page }) => {
    await doConvert(page, { amount: '25', unit: 'hourly' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await page.locator('[name="amount"]').fill('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(dominant(page)).toHaveText('—');
  });

  /* ---- reset ---- */

  test('reset clears the amount, restores hourly + 40/5/52, empties the result', async ({ page }) => {
    await doConvert(page, { amount: '60000', unit: 'annual', hpw: '35', dpw: '4', wpy: '48' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await page.locator('[data-reset]').click();
    await expect(page.locator('[name="amount"]')).toHaveValue('');
    await expect(page.locator('[name="unit"]')).toHaveValue('hourly');
    await expect(page.locator('[name="hoursPerWeek"]')).toHaveValue('40');
    await expect(page.locator('[name="daysPerWeek"]')).toHaveValue('5');
    await expect(page.locator('[name="weeksPerYear"]')).toHaveValue('52');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from the amount field', async ({ page }) => {
    await page.locator('[name="amount"]').fill('25');
    await page.locator('[name="amount"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('desktop shows the annual salary within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await doConvert(page, { amount: '25', unit: 'hourly' });
    const box = await dominant(page).boundingBox();
    expect(box!.y).toBeLessThan(768);
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await doConvert(page, { amount: '25', unit: 'hourly' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await doConvert(page, { amount: '25', unit: 'hourly' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('no NaN / Infinity / undefined renders for an ordinary result', async ({ page }) => {
    await doConvert(page, { amount: '75000', unit: 'annual' });
    const text = await shell(page).innerText();
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the generated embed mounts the same island (empty SSR, then a salary)', async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await doConvert(page, { amount: '25', unit: 'hourly' });
    await expect(dominant(page)).toHaveText('$52,000.00');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    const html = await page.content();
    expect(html).not.toMatch(/adsbygoogle|data-ad-client|googlesyndication/);
  });
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('salary: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__salary-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/finance/salary-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-salary]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /SalaryCalculator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__salary-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-salary]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-salary]')).toHaveCount(1);
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

  test('converting and resetting one instance never touches the other', async ({ page }) => {
    await mountTwo(page);
    const A = (sel: string) => page.locator(`#inst-a ${sel}`);
    const B = (sel: string) => page.locator(`#inst-b ${sel}`);
    const convertA = async () => {
      await A('[name="amount"]').fill('25');
      await A('[name="unit"]').selectOption('hourly');
      await A('button[type="submit"]').click();
    };
    await convertA();
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('$52,000.00');
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty'); // B untouched

    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
  });
});
