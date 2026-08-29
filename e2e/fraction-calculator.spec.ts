import { test, expect, type Page } from '@playwright/test';

/**
 * Fraction calculators — the reference's SIX, each on its own, on the live page.
 *
 * Every reference figure asserted here was verified against the reference's own printed output:
 * 2/7 + 3/8 = 37/56 at 0.66071428571429, −2 3/4 + 3 5/7 = 27/28, 2 21/98 = 31/14 = 2 3/14,
 * 1.375 = 11/8 = 1 3/8, 2/7 = 0.28571428571429, and the thirty-one-digit big-number sum.
 */
const ROUTE = '/math/fraction-calculator';

type Key = 'fraction' | 'mixed' | 'simplify' | 'decimal2fraction' | 'fraction2decimal' | 'bignumber';
const KEYS: Key[] = ['fraction', 'mixed', 'simplify', 'decimal2fraction', 'fraction2decimal', 'bignumber'];

const section = (page: Page, key: Key) => page.locator(`[data-fr-key="${key}"]`);
const shell = (page: Page, key: Key) => page.locator(`#fr-${key}-result`);
const calculate = (page: Page, key: Key) => section(page, key).locator('button[type="submit"]');
const live = (page: Page, key: Key) => page.locator(`#fr-${key}-live`);

/** A rendered line flattened to text — a stacked fraction reads back as "n/d". */
const LINE_TEXT = `(line) => Array.from(line.children).map((c) => {
  if (c.classList.contains('fx-lead') || c.classList.contains('fx-text')) return c.textContent;
  const stack = c.querySelector('.fx-frac');
  const whole = c.querySelector('.fx-whole');
  const f = stack ? stack.querySelector('.fx-num').textContent + '/' + stack.querySelector('.fx-den').textContent : '';
  return whole ? whole.textContent + ' ' + f : f;
}).filter(Boolean).join(' ').trim()`;

const equationOf = (page: Page, key: Key) =>
  page.evaluate(
    ([k, fn]) => {
      const line = document.querySelector(`[data-fr-key="${k}"] [data-fr-equation] .fx-line`);
      return line ? (new Function('line', `return (${fn})(line)`) as (l: Element) => string)(line) : '';
    },
    [key, LINE_TEXT] as const,
  );

const stepsOf = (page: Page, key: Key) =>
  page.evaluate(
    ([k, fn]) => {
      const read = new Function('line', `return (${fn})(line)`) as (l: Element) => string;
      return Array.from(document.querySelectorAll(`[data-fr-key="${k}"] [data-fr-steps] .fx-line`)).map(read);
    },
    [key, LINE_TEXT] as const,
  );

async function solve(page: Page, key: Key, values: Record<string, string>, op?: string) {
  const root = section(page, key);
  if (op) await root.locator('[name="op"]').selectOption(op);
  for (const [name, value] of Object.entries(values)) await root.locator(`[name="${name}"]`).fill(value);
  await calculate(page, key).click();
  await expect(shell(page, key)).toHaveAttribute('data-result-state', 'valid');
}

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- The six are six ----------------------------------------------------- */

test('offers the reference six calculators, each with its own form, button and result', async ({ page }) => {
  await expect(page.locator('[data-fr-key]')).toHaveCount(6);
  for (const key of KEYS) {
    await expect(section(page, key).locator('form[data-form]')).toHaveCount(1);
    await expect(calculate(page, key)).toHaveText('Calculate');
    await expect(section(page, key).locator('[data-reset]')).toHaveText('Clear');
    await expect(shell(page, key)).toHaveCount(1);
  }
});

test('every calculator loads with empty fields behind a labelled example', async ({ page }) => {
  for (const key of KEYS) {
    await expect(shell(page, key)).toHaveAttribute('data-result-state', 'example');
    const values = await section(page, key).locator('input').evaluateAll((els) =>
      (els as HTMLInputElement[]).map((e) => e.value),
    );
    expect(values.every((v) => v === ''), key).toBe(true);
    await expect(live(page, key)).toHaveText('');
  }
});

test('calculating in one calculator leaves the other five untouched', async ({ page }) => {
  await solve(page, 'fraction', { an: '2', ad: '7', bn: '3', bd: '8' }, 'add');
  for (const key of KEYS.filter((k) => k !== 'fraction')) {
    await expect(shell(page, key)).toHaveAttribute('data-result-state', 'example');
  }
});

/* ---- The reference results ---------------------------------------------- */

test('Fraction Calculator reproduces the reference result for 2/7 + 3/8', async ({ page }) => {
  await solve(page, 'fraction', { an: '2', ad: '7', bn: '3', bd: '8' }, 'add');
  expect(await equationOf(page, 'fraction')).toBe('2/7 + 3/8 = 37/56');
  await expect(shell(page, 'fraction').locator('[data-fr-decimal]')).toHaveText('0.66071428571429');
  expect(await stepsOf(page, 'fraction')).toEqual([
    '2/7 + 3/8',
    '= 2 × 8/7 × 8 + 3 × 7/8 × 7',
    '= 16/56 + 21/56',
    '= 16+21/56',
    '= 37/56',
  ]);
  // The equation is also illustrated: one pie group per term.
  await expect(shell(page, 'fraction').locator('[data-fr-pies] .fx-pie')).toHaveCount(3);
});

test('Mixed Numbers Calculator reproduces the reference result for -2 3/4 + 3 5/7', async ({ page }) => {
  await solve(page, 'mixed', { a: '-2 3/4', b: '3 5/7' }, 'add');
  expect(await equationOf(page, 'mixed')).toBe('-2 3/4 + 3 5/7 = 27/28');
  await expect(shell(page, 'mixed').locator('[data-fr-decimal]')).toHaveText('0.96428571428571');
  expect(await stepsOf(page, 'mixed')).toEqual([
    '-2 3/4 + 3 5/7',
    '= -11/4 + 26/7',
    '= -11 × 7/4 × 7 + 26 × 4/7 × 4',
    '= -77/28 + 104/28',
    '= -77+104/28',
    '= 27/28',
  ]);
});

test('Simplify Fractions Calculator reproduces the reference result for 2 21/98', async ({ page }) => {
  await solve(page, 'simplify', { whole: '2', num: '21', den: '98' });
  expect(await equationOf(page, 'simplify')).toBe('2 21/98 = 31/14 = 2 3/14');
  await expect(shell(page, 'simplify').locator('[data-fr-decimal]')).toHaveText('2.2142857142857');
  expect(await stepsOf(page, 'simplify')).toEqual([
    '2 21/98',
    '= 217/98',
    '= 217 ÷ 7/98 ÷ 7',
    '= 31/14',
    '= 2 3/14',
  ]);
});

test('Decimal to Fraction Calculator reproduces the reference result for 1.375', async ({ page }) => {
  await solve(page, 'decimal2fraction', { value: '1.375' });
  expect(await equationOf(page, 'decimal2fraction')).toBe('1.375 = 11/8 = 1 3/8');
  expect(await stepsOf(page, 'decimal2fraction')).toEqual([
    '1.375',
    '= 1.375 × 1000/1 × 1000',
    '= 1375/1000',
    '= 1375 ÷ 125/1000 ÷ 125',
    '= 11/8',
    '= 1 3/8',
  ]);
  // The decimal it was handed is not repeated back as a "result in decimals".
  await expect(shell(page, 'decimal2fraction').locator('[data-fr-decimal-row]')).toBeHidden();
});

test('Fraction to Decimal Calculator reproduces the reference result for 2/7', async ({ page }) => {
  await solve(page, 'fraction2decimal', { num: '2', den: '7' });
  expect(await equationOf(page, 'fraction2decimal')).toBe('2/7 = 0.28571428571429');
  await expect(shell(page, 'fraction2decimal').locator('[data-fr-steps-row]')).toBeHidden();
});

test('Big Number Fraction Calculator is exact past what a float can hold', async ({ page }) => {
  await solve(
    page,
    'bignumber',
    { an: '1234', ad: '748892928829', bn: '33434421132232234333', bd: '8877277388288288288' },
    'add',
  );
  expect(await stepsOf(page, 'bignumber')).toEqual([
    '1234/748892928829 + 33434421132232234333/8877277388288288288',
    '= 3 5094410786346152324392512269193/6648130263342672078999418254752',
  ]);
});

test('the same big numbers are refused by the plain calculator, which says where to go', async ({ page }) => {
  const root = section(page, 'fraction');
  await root.locator('[name="an"]').fill('33434421132232234333');
  await root.locator('[name="ad"]').fill('2');
  await root.locator('[name="bn"]').fill('1');
  await root.locator('[name="bd"]').fill('3');
  await calculate(page, 'fraction').click();
  await expect(shell(page, 'fraction')).toHaveAttribute('data-result-state', 'invalid');
  await expect(root.locator('[data-error-for="an"]')).toContainText('Big Number Fraction Calculator');
});

/* ---- The four operations ------------------------------------------------ */

test('all four operations work and update live after the first calculation', async ({ page }) => {
  await solve(page, 'fraction', { an: '2', ad: '7', bn: '3', bd: '8' }, 'add');
  await expect(section(page, 'fraction').locator('[data-live-note]')).toBeVisible();

  for (const [op, expected] of [
    ['subtract', '2/7 − 3/8 = -5/56'],
    ['multiply', '2/7 × 3/8 = 3/28'],
    ['divide', '2/7 ÷ 3/8 = 16/21'],
  ] as const) {
    await section(page, 'fraction').locator('[name="op"]').selectOption(op);
    await expect(async () => expect(await equationOf(page, 'fraction')).toBe(expected)).toPass();
  }
});

test('an improper answer is also read as a mixed number', async ({ page }) => {
  await solve(page, 'fraction', { an: '3', ad: '4', bn: '2', bd: '3' }, 'divide');
  expect(await equationOf(page, 'fraction')).toBe('3/4 ÷ 2/3 = 9/8 = 1 1/8');
});

/* ---- Validation --------------------------------------------------------- */

test('a zero denominator is refused on the denominator itself', async ({ page }) => {
  const root = section(page, 'fraction');
  await root.locator('[name="an"]').fill('1');
  await root.locator('[name="ad"]').fill('0');
  await root.locator('[name="bn"]').fill('1');
  await root.locator('[name="bd"]').fill('3');
  await calculate(page, 'fraction').click();
  await expect(shell(page, 'fraction')).toHaveAttribute('data-result-state', 'invalid');
  await expect(root.locator('[data-error-for="ad"]')).toHaveText('The denominator cannot be zero.');
  await expect(root.locator('[name="ad"]')).toBeFocused();
});

test('dividing by a fraction that equals zero is refused, but a zero numerator is fine otherwise', async ({ page }) => {
  const root = section(page, 'fraction');
  await root.locator('[name="op"]').selectOption('divide');
  await root.locator('[name="an"]').fill('1');
  await root.locator('[name="ad"]').fill('2');
  await root.locator('[name="bn"]').fill('0');
  await root.locator('[name="bd"]').fill('3');
  await calculate(page, 'fraction').click();
  await expect(root.locator('[data-error-for="bn"]')).toHaveText('Cannot divide by a fraction that equals zero.');

  await root.locator('[name="op"]').selectOption('add');
  await calculate(page, 'fraction').click();
  await expect(shell(page, 'fraction')).toHaveAttribute('data-result-state', 'valid');
  expect(await equationOf(page, 'fraction')).toBe('1/2 + 0/3 = 1/2');
});

test('a malformed mixed number is explained rather than just refused', async ({ page }) => {
  const root = section(page, 'mixed');
  await root.locator('[name="a"]').fill('two and a half');
  await root.locator('[name="b"]').fill('1/2');
  await calculate(page, 'mixed').click();
  await expect(shell(page, 'mixed')).toHaveAttribute('data-result-state', 'invalid');
  await expect(root.locator('[data-error-for="a"]')).toContainText('2 3/4');
});

test('no result ever shows NaN, Infinity or a raw error', async ({ page }) => {
  for (const key of KEYS) {
    await calculate(page, key).click(); // submit empty
    await expect(shell(page, key)).toHaveAttribute('data-result-state', 'invalid');
    await expect(shell(page, key)).not.toContainText(/NaN|Infinity|undefined/);
  }
});

/* ---- Reset -------------------------------------------------------------- */

test('Clear empties the fields and returns the result to empty', async ({ page }) => {
  await solve(page, 'fraction', { an: '2', ad: '7', bn: '3', bd: '8' }, 'divide');
  await section(page, 'fraction').locator('[data-reset]').click();
  await expect(shell(page, 'fraction')).toHaveAttribute('data-result-state', 'empty');
  const values = await section(page, 'fraction').locator('input').evaluateAll((els) =>
    (els as HTMLInputElement[]).map((e) => e.value),
  );
  expect(values).toEqual(['', '', '', '']);
  await expect(section(page, 'fraction').locator('[name="op"]')).toHaveValue('add');
  await expect(live(page, 'fraction')).toHaveText('');
});

/* ---- Announcement ------------------------------------------------------- */

test('a completed result is announced once, without formula internals', async ({ page }) => {
  await solve(page, 'fraction', { an: '2', ad: '7', bn: '3', bd: '8' }, 'add');
  await expect(live(page, 'fraction')).toHaveText('Fraction Calculator: 2/7 + 3/8 = 37/56');
  await expect(page.locator('[aria-live]')).toHaveCount(6); // one per calculator, never more
});

/* ---- Workspace / responsive / theme ------------------------------------- */

test('desktop first viewport shows the first calculator, its action and its result slot', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(calculate(page, 'fraction')).toBeInViewport();
  expect((await shell(page, 'fraction').boundingBox())!.y).toBeLessThan(768);
});

test('mobile stacks inputs, Calculate then result, with no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const inputY = (await section(page, 'fraction').locator('[name="an"]').boundingBox())!.y;
  const buttonY = (await calculate(page, 'fraction').boundingBox())!.y;
  const resultY = (await shell(page, 'fraction').boundingBox())!.y;
  expect(buttonY).toBeGreaterThan(inputY);
  expect(resultY).toBeGreaterThan(buttonY);
  await solve(page, 'fraction', { an: '2', ad: '7', bn: '3', bd: '8' }, 'add');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await solve(page, 'fraction', { an: '2', ad: '7', bn: '3', bd: '8' }, 'add');
  await expect(shell(page, 'fraction').locator('[data-fr-decimal]')).toHaveText('0.66071428571429');
});

/* ---- Same-document instance isolation ----------------------------------- */

test.describe('fraction: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__fraction-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/math/fraction-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-frpage]');
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
    await page.route('**/__fraction-two-instance-fixture', (r) =>
      r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }),
    );
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-frpage]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-frpage]')).toHaveCount(1);
  }

  test('two instances have no duplicate ids and every reference resolves in its own instance', async ({ page }) => {
    await mountTwo(page);
    const duplicates = await page.evaluate(() => {
      const counts: Record<string, number> = {};
      for (const el of document.querySelectorAll('[id]')) counts[el.id] = (counts[el.id] || 0) + 1;
      return Object.entries(counts)
        .filter(([, n]) => n > 1)
        .map(([id]) => id);
    });
    expect(duplicates).toEqual([]);

    const ok = await page.evaluate(() => {
      for (const scope of ['#inst-a', '#inst-b']) {
        const root = document.querySelector(scope)!;
        for (const el of root.querySelectorAll('label[for], [aria-describedby]')) {
          const refs = (el.getAttribute('for') || el.getAttribute('aria-describedby') || '')
            .split(/\s+/)
            .filter(Boolean);
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

  test('calculating in one instance leaves the other alone', async ({ page }) => {
    await mountTwo(page);
    const a = page.locator('#inst-a [data-fr-key="fraction"]');
    const b = page.locator('#inst-b [data-fr-key="fraction"]');
    for (const [name, value] of Object.entries({ an: '2', ad: '7', bn: '3', bd: '8' })) {
      await a.locator(`[name="${name}"]`).fill(value);
    }
    await a.locator('button[type="submit"]').click();
    await expect(a.locator('[data-result-shell]')).toHaveAttribute('data-result-state', 'valid');
    await expect(b.locator('[data-result-shell]')).toHaveAttribute('data-result-state', 'example');
  });
});
