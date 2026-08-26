import { test, expect, type Page } from '@playwright/test';

/**
 * Conversion calculator — R18C3 task-first migration (everyday; the final Everyday legacy calculator).
 * ONE unit-converter form on the UNCHANGED standard-form runtime via its OWN conversion-form.ts
 * binding, wrapping the UNCHANGED convert / CATEGORIES (frozen by conversion.test.ts). Task-first: the
 * value starts at the neutral 1, From/To default to each category's first two distinct units
 * (units[0] → units[1]), the result is EMPTY on the server AND after hydration (the legacy island
 * auto-calculated a 1 km → mi example), and the visitor presses Convert for the first result
 * (live-after-first). Expected values are INDEPENDENT hard-coded fixtures (formatNumber(x, 6)), never
 * derived from the page's own convert().
 */

const ROUTE = '/everyday/conversion-calculator';
const EMBED = '/embed/everyday/conversion-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#cv-result');
const dominant = (page: Page) => page.locator('#cv-result [data-result-when~="valid"] [data-result-value]').first();
const unit = (page: Page) => page.locator('[data-cv-unit]');
const equation = (page: Page) => page.locator('[data-cv-equation]');
const live = (page: Page) => page.locator('#cv-live');
const submit = (page: Page) => page.locator('[data-convert] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#cv-result [data-result-when~="${when}"]`);

type Conv = Partial<{ category: string; value: string; from: string; to: string }>;
const doConvert = async (page: Page, c: Conv) => {
  if (c.category) await page.locator('[name="category"]').selectOption(c.category);
  if (c.value !== undefined) await page.locator('[name="value"]').fill(c.value);
  if (c.from) await page.locator('[name="from"]').selectOption(c.from);
  if (c.to) await page.locator('[name="to"]').selectOption(c.to);
  await submit(page).click();
};

test.describe('conversion: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- SSR / hydration parity ---- */

  test('server-rendered result equals the hydrated one — empty, no baked conversion', async ({ page }) => {
    const raw = await (await page.request.get(ROUTE)).text();
    const server = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        state: d.querySelector('#cv-result')?.getAttribute('data-result-state') ?? null,
        dominant: d.querySelector('#cv-result [data-result-when~="valid"] [data-result-value]')?.textContent?.trim() ?? null,
        category: d.querySelector<HTMLSelectElement>('[name="category"]')?.value ?? null,
        value: d.querySelector<HTMLInputElement>('[name="value"]')?.getAttribute('value') ?? '',
      };
    }, raw);
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    expect(server.state).toBe('empty');
    expect(server.dominant).toBe('—'); // no baked-in conversion
    expect(server.category).toBe('length');
    expect(server.value).toBe('1'); // the neutral converter value
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  });

  /* ---- initial state ---- */

  test('loads with value 1, default units, empty result and no announcement', async ({ page }) => {
    await expect(page.locator('[name="category"]')).toHaveValue('length');
    await expect(page.locator('[name="value"]')).toHaveValue('1');
    await expect(page.locator('[name="from"]')).toHaveValue('mm');
    await expect(page.locator('[name="to"]')).toHaveValue('cm');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    // The example fills this calculator's OWN valid region, so it is visible on load.
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
  });

  test('does not convert before the first Convert (no auto-calc from structural changes)', async ({ page }) => {
    await page.locator('[name="from"]').selectOption('km');
    await page.locator('[name="to"]').selectOption('mi');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- structural: dependent units ---- */

  test('changing category rebuilds the From/To unit options', async ({ page }) => {
    await page.locator('[name="category"]').selectOption('mass');
    await expect(page.locator('[name="from"]')).toHaveValue('mg'); // deterministic default units[0]
    await expect(page.locator('[name="to"]')).toHaveValue('g'); // units[1]
    const fromOpts = await page.locator('[name="from"] option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(fromOpts).toEqual(['mg', 'g', 'kg', 't', 'oz', 'lb', 'st']); // only mass units
  });

  /* ---- conversions (independent fixtures) ---- */

  test('length: 1 km → mi (dominant value, unit caption, equation, announcement)', async ({ page }) => {
    await doConvert(page, { value: '1', from: 'km', to: 'mi' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('0.621371');
    await expect(unit(page)).toHaveText('Miles');
    await expect(equation(page)).toHaveText('1 Kilometres = 0.621371 Miles');
    await expect(live(page)).toHaveText('Converted value: 0.621371 Miles.');
  });

  test('mass: 1 kg → lb', async ({ page }) => {
    await doConvert(page, { category: 'mass', value: '1', from: 'kg', to: 'lb' });
    await expect(dominant(page)).toHaveText('2.204624');
    await expect(unit(page)).toHaveText('Pounds');
  });

  test('a same-unit conversion is a valid identity', async ({ page }) => {
    await doConvert(page, { value: '7', from: 'm', to: 'm' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('7');
  });

  test('a zero value is a valid conversion (0 km → 0 mi)', async ({ page }) => {
    await doConvert(page, { value: '0', from: 'km', to: 'mi' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('0');
  });

  test('a positive decimal converts proportionally (2.5 kg → lb)', async ({ page }) => {
    await doConvert(page, { category: 'mass', value: '2.5', from: 'kg', to: 'lb' });
    await expect(dominant(page)).toHaveText('5.511561');
  });

  /* ---- special affine category: temperature ---- */

  test('temperature: 0 °C → 32 °F, 100 °C → 212 °F, −40 °C → −40 °F', async ({ page }) => {
    await doConvert(page, { category: 'temperature', value: '0', from: 'C', to: 'F' });
    await expect(dominant(page)).toHaveText('32');
    await page.locator('[name="value"]').fill('100');
    await page.locator('[name="value"]').blur();
    await expect(dominant(page)).toHaveText('212'); // live-after-first
    await page.locator('[name="value"]').fill('-40');
    await page.locator('[name="value"]').blur();
    await expect(dominant(page)).toHaveText('-40'); // negatives are valid for temperature
  });

  /* ---- invalid + stale clearing ---- */

  test('an empty value on Convert is invalid and focuses the value field', async ({ page }) => {
    await page.locator('[name="value"]').fill('');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[name="value"]')).toBeFocused();
  });

  test('clearing the value after a result clears the stale conversion', async ({ page }) => {
    await doConvert(page, { value: '1', from: 'km', to: 'mi' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await page.locator('[name="value"]').fill('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(dominant(page)).toHaveText('—');
  });

  /* ---- live-after-first: unit + category ---- */

  test('after the first result, changing the To unit recomputes live (1 km → m = 1,000)', async ({ page }) => {
    await doConvert(page, { value: '1', from: 'km', to: 'mi' });
    await page.locator('[name="to"]').selectOption('m');
    await expect(dominant(page)).toHaveText('1,000');
  });

  test('after the first result, changing category recomputes with the preserved value (1 mg → g = 0.001)', async ({ page }) => {
    await doConvert(page, { value: '1', from: 'km', to: 'mi' });
    await page.locator('[name="category"]').selectOption('mass'); // fillUnits → mg → g; value 1 preserved
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(dominant(page)).toHaveText('0.001');
    await expect(unit(page)).toHaveText('Grams');
  });

  /* ---- reset ---- */

  test('reset restores category length, value 1, default units, empties the result', async ({ page }) => {
    await doConvert(page, { category: 'temperature', value: '25', from: 'C', to: 'F' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await page.locator('[data-reset]').click();
    await expect(page.locator('[name="category"]')).toHaveValue('length');
    await expect(page.locator('[name="value"]')).toHaveValue('1');
    await expect(page.locator('[name="from"]')).toHaveValue('mm');
    await expect(page.locator('[name="to"]')).toHaveValue('cm');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from the value field', async ({ page }) => {
    await page.locator('[name="from"]').selectOption('km');
    await page.locator('[name="to"]').selectOption('mi');
    await page.locator('[name="value"]').fill('2');
    await page.locator('[name="value"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('desktop shows the converted value within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await doConvert(page, { value: '1', from: 'km', to: 'mi' });
    const box = await dominant(page).boundingBox();
    expect(box!.y).toBeLessThan(768);
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await doConvert(page, { value: '1', from: 'km', to: 'mi' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await doConvert(page, { value: '1', from: 'km', to: 'mi' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('no NaN / Infinity / undefined renders for an ordinary result', async ({ page }) => {
    await doConvert(page, { category: 'data', value: '5', from: 'TB', to: 'B' });
    const text = await shell(page).innerText();
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the generated embed mounts the same island (empty SSR, then a conversion)', async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await doConvert(page, { value: '1', from: 'km', to: 'mi' });
    await expect(dominant(page)).toHaveText('0.621371');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    const html = await page.content();
    expect(html).not.toMatch(/adsbygoogle|data-ad-client|googlesyndication/);
  });
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('conversion: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__conversion-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/everyday/conversion-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-convert]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /ConversionCalculator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__conversion-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-convert]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-convert]')).toHaveCount(1);
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
      await A('[name="value"]').fill('1');
      await A('[name="from"]').selectOption('km');
      await A('[name="to"]').selectOption('mi');
      await A('button[type="submit"]').click();
    };
    await convertA();
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('0.621371');
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'example'); // B untouched

    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
  });
});
