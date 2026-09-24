import { test, expect, type Page } from '@playwright/test';

/**
 * Random numbers — the reference's TWO generators: a simple one returning a single integer of any
 * size, and the Comprehensive Version returning one or many integers or decimals to a chosen
 * precision. Each keeps its own settings, button and output, and each puts its output in the same
 * row as its settings.
 *
 * Beyond the usual doctrine checks this suite is security-minded, as the password generator is:
 * the draw happens in the browser, and nothing generated reaches storage, the URL, the network,
 * the console or the live region.
 */
const ROUTE = '/math/random-number-generator';

const simple = (page: Page) => page.locator('[data-rng-simple]');
const full = (page: Page) => page.locator('[data-rng-full]');
const simpleShell = (page: Page) => page.locator('#rng-simple-result');
const fullShell = (page: Page) => page.locator('#rng-full-result');
const simpleOut = (page: Page) => simple(page).locator('[data-generator-output]');
const fullOut = (page: Page) => full(page).locator('[data-generator-output]');
const simpleGo = (page: Page) => page.locator('[data-rng-simple-submit]');
const fullGo = (page: Page) => page.locator('[data-rng-full-submit]');

const readSimple = (page: Page) => simpleOut(page).inputValue();
const readFull = async (page: Page) => (await fullOut(page).inputValue()).split('\n');

async function setFull(page: Page, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    if (name === 'type') await full(page).locator(`input[name="type"][value="${value}"]`).check();
    else await full(page).locator(`[name="${name}"]`).fill(value);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Two separate generators -------------------------------------------- */

test('offers both generators, each with its own settings, button and output', async ({ page }) => {
  await expect(simple(page)).toHaveCount(1);
  await expect(full(page)).toHaveCount(1);
  await expect(page.locator('#rng-simple-heading')).toHaveText('Random Number Generator');
  await expect(page.locator('#rng-full-heading')).toHaveText('Comprehensive Version');
  await expect(simpleGo(page)).toHaveText('Generate');
  await expect(fullGo(page)).toHaveText('Generate');
});

test('loads with the reference defaults and no output generated', async ({ page }) => {
  await expect(simple(page).locator('[name="lower"]')).toHaveValue('1');
  await expect(simple(page).locator('[name="upper"]')).toHaveValue('100');
  await expect(full(page).locator('[name="lower"]')).toHaveValue('0.2');
  await expect(full(page).locator('[name="upper"]')).toHaveValue('112.5');
  await expect(full(page).locator('[name="count"]')).toHaveValue('1');
  await expect(full(page).locator('[name="precision"]')).toHaveValue('50');
  await expect(full(page).locator('input[name="type"][value="decimal"]')).toBeChecked();

  // A labelled worked example, drawn in the browser — never the visitor's own draw.
  await expect(simpleShell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(fullShell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(page.locator('[data-result-when~="example"]').first()).toContainText(/not your calculation/i);
  await page.waitForTimeout(300);
  await expect(simpleShell(page)).toHaveAttribute('data-result-state', 'example'); // nothing auto-generated for them
  await expect(page.locator('#rng-simple-live')).toHaveText(''); // and never announced
});

test('generating in one leaves the other untouched', async ({ page }) => {
  await simpleGo(page).click();
  await expect(simpleShell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(fullShell(page)).toHaveAttribute('data-result-state', 'example');
});

test('each output sits in the same row as its own settings on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await simpleGo(page).click();
  const form = (await simple(page).locator('form').boundingBox())!;
  const result = (await simpleShell(page).boundingBox())!;
  expect(result.x).toBeGreaterThan(form.x + form.width - 2);
});

/* ---- The simple generator ------------------------------------------------ */

test('draws one integer inside the inclusive range', async ({ page }) => {
  await simpleGo(page).click();
  await expect(simpleShell(page)).toHaveAttribute('data-result-state', 'valid');
  const value = await readSimple(page);
  expect(value).toMatch(/^\d+$/);
  expect(Number(value)).toBeGreaterThanOrEqual(1);
  expect(Number(value)).toBeLessThanOrEqual(100);
});

test('reaches both ends of a two-value range over repeated draws', async ({ page }) => {
  await simple(page).locator('[name="lower"]').fill('0');
  await simple(page).locator('[name="upper"]').fill('1');
  const seen = new Set<string>();
  for (let i = 0; i < 40 && seen.size < 2; i += 1) {
    await simpleGo(page).click();
    seen.add(await readSimple(page));
  }
  expect([...seen].sort()).toEqual(['0', '1']);
});

test('handles an integer far past what ordinary arithmetic can hold', async ({ page }) => {
  await simple(page).locator('[name="lower"]').fill('1' + '0'.repeat(200));
  await simple(page).locator('[name="upper"]').fill('9'.repeat(201));
  await simpleGo(page).click();
  const value = await readSimple(page);
  expect(value).toMatch(/^\d+$/);
  expect(value.length).toBe(201);
  expect(BigInt(value)).toBeGreaterThanOrEqual(BigInt('1' + '0'.repeat(200)));
});

test('refuses a decimal limit, because this version draws an integer', async ({ page }) => {
  await simple(page).locator('[name="lower"]').fill('1.5');
  await simpleGo(page).click();
  await expect(simpleShell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(simple(page).locator('[data-error-for="lower"]')).toHaveText('Enter a whole number.');
});

/* ---- Copy and Regenerate ------------------------------------------------- */

test('Regenerate draws again from the same settings, without touching them', async ({ page }) => {
  await simple(page).locator('[name="lower"]').fill('1');
  await simple(page).locator('[name="upper"]').fill('1000000');
  await simpleGo(page).click();
  const first = await readSimple(page);
  await simple(page).locator('[data-regenerate]').click();
  await expect(simpleShell(page)).toHaveAttribute('data-result-state', 'valid');
  const second = await readSimple(page);
  expect(second).toMatch(/^\d+$/);
  expect(second).not.toBe(first); // a million values makes a repeat vanishingly unlikely
  await expect(simple(page).locator('[name="upper"]')).toHaveValue('1000000');
});

test('Copy puts exactly what is on screen on the clipboard, and confirms it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await simpleGo(page).click();
  const shown = await readSimple(page);
  await simple(page).locator('[data-copy]').click();
  await expect(simple(page).locator('[data-copy-confirm]')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shown);
});

test('a settings change marks the output out of date and disables Copy, keeping it visible', async ({ page }) => {
  await simpleGo(page).click();
  const shown = await readSimple(page);
  await simple(page).locator('[name="upper"]').fill('50');
  await expect(simple(page).locator('[data-stale-note]')).toBeVisible();
  await expect(simple(page).locator('[data-copy]')).toBeDisabled();
  await expect(simpleOut(page)).toHaveValue(shown); // not cleared
  await expect(simpleShell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('both outputs carry Copy and Regenerate', async ({ page }) => {
  for (const scope of [simple, full]) {
    await expect(scope(page).locator('[data-copy]')).toHaveCount(1);
    await expect(scope(page).locator('[data-regenerate]')).toHaveCount(1);
  }
});

/* ---- The comprehensive generator ----------------------------------------- */

test('draws a decimal with exactly the requested precision, inside the range', async ({ page }) => {
  await fullGo(page).click();
  await expect(fullShell(page)).toHaveAttribute('data-result-state', 'valid');
  const [value] = await readFull(page);
  expect(value.split('.')[1]).toHaveLength(50);
  expect(Number(value)).toBeGreaterThanOrEqual(0.2);
  expect(Number(value)).toBeLessThanOrEqual(112.5);
  await expect(full(page).locator('[data-rng-count]')).toHaveText('1 number, 50 decimal places');
});

test('the precision field is only asked for when drawing decimals', async ({ page }) => {
  await expect(full(page).locator('[data-rng-precision]')).toBeVisible();
  await full(page).locator('input[name="type"][value="integer"]').check();
  await expect(full(page).locator('[data-rng-precision]')).toBeHidden();
  await full(page).locator('input[name="type"][value="decimal"]').check();
  await expect(full(page).locator('[data-rng-precision]')).toBeVisible();
});

test('draws many distinct sorted integers — a lottery pick', async ({ page }) => {
  await setFull(page, { type: 'integer', lower: '1', upper: '49', count: '6' });
  await full(page).locator('[name="allowDuplicates"]').uncheck();
  await full(page).locator('[name="sort"]').check();
  await fullGo(page).click();
  const values = await readFull(page);
  expect(values).toHaveLength(6);
  expect(new Set(values).size).toBe(6);
  const numbers = values.map(Number);
  expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
  for (const n of numbers) {
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(49);
  }
});

test('refuses to draw more distinct values than the range holds', async ({ page }) => {
  await setFull(page, { type: 'integer', lower: '1', upper: '5', count: '20' });
  await full(page).locator('[name="allowDuplicates"]').uncheck();
  await fullGo(page).click();
  await expect(fullShell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(full(page).locator('[data-error-for="count"]')).toContainText('distinct');

  // With duplicates allowed the same request is fine.
  await full(page).locator('[name="allowDuplicates"]').check();
  await fullGo(page).click();
  await expect(fullShell(page)).toHaveAttribute('data-result-state', 'valid');
  expect(await readFull(page)).toHaveLength(20);
});

test('holds the count and the precision to what the page promises', async ({ page }) => {
  await setFull(page, { count: '0' });
  await fullGo(page).click();
  await expect(full(page).locator('[data-error-for="count"]')).toBeVisible();

  await setFull(page, { count: '1', precision: '1000' });
  await fullGo(page).click();
  await expect(full(page).locator('[data-error-for="precision"]')).toHaveText('Enter between 0 and 999 digits.');
});

test('never renders NaN, Infinity or a raw error', async ({ page }) => {
  await setFull(page, { type: 'integer', lower: '-10', upper: '10', count: '20' });
  await fullGo(page).click();
  await expect(fullShell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(fullShell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

test('Clear restores the defaults and empties the output', async ({ page }) => {
  await setFull(page, { type: 'integer', lower: '5', upper: '9', count: '3' });
  await fullGo(page).click();
  await full(page).locator('[data-reset]').click();
  await expect(fullShell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(fullOut(page)).toHaveValue('');
  await expect(full(page).locator('[name="lower"]')).toHaveValue('0.2');
  await expect(full(page).locator('[name="count"]')).toHaveValue('1');
  await expect(full(page).locator('input[name="type"][value="decimal"]')).toBeChecked();
});

/* ---- Security: the draw stays in the browser ----------------------------- */

test('the announcement says numbers were generated, never what they are', async ({ page }) => {
  await setFull(page, { type: 'integer', lower: '100000', upper: '999999', count: '5' });
  await fullGo(page).click();
  const live = page.locator('#rng-full-live');
  await expect(live).toHaveText('5 numbers generated.');
  for (const value of await readFull(page)) {
    expect(await live.textContent()).not.toContain(value);
  }
});

test('nothing generated reaches storage, the URL, the network or the console', async ({ page }) => {
  const requests: string[] = [];
  const logs: string[] = [];
  page.on('request', (r) => requests.push(`${r.url()} ${r.postData() ?? ''}`));
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(ROUTE, { waitUntil: 'networkidle' });

  await simple(page).locator('[name="lower"]').fill('1000000000');
  await simple(page).locator('[name="upper"]').fill('9999999999');
  await simpleGo(page).click();
  const value = await readSimple(page);
  expect(value.length).toBeGreaterThan(0);

  const storage = await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
  expect(storage).not.toContain(value);
  expect(page.url()).not.toContain(value);
  expect(requests.some((r) => r.includes(value))).toBe(false);
  expect(logs.some((l) => l.includes(value))).toBe(false);
});

test('the server never bakes a number into the page', async ({ page }) => {
  const html = await (await page.request.get(ROUTE)).text();
  const outputs = [...html.matchAll(/data-generator-output[^>]*>([\s\S]*?)<\/textarea>/g)];
  expect(outputs.length).toBe(2); // both generators are present in the server HTML
  for (const [, contents] of outputs) expect(contents.trim()).toBe('');
});

/* ---- Workspace / responsive ---------------------------------------------- */

test('desktop first viewport shows H1, the settings and the action', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(simpleGo(page)).toBeInViewport();
});

test('mobile stacks settings then output, with no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const settingsY = (await simple(page).locator('[name="lower"]').boundingBox())!.y;
  const buttonY = (await simpleGo(page).boundingBox())!.y;
  const outputY = (await simpleShell(page).boundingBox())!.y;
  expect(buttonY).toBeGreaterThan(settingsY);
  expect(outputY).toBeGreaterThan(buttonY);
  await fullGo(page).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('each generator has exactly one live region', async ({ page }) => {
  // Scoped to the tool column, as triangle and statistics already do: the side
  // rail's search combobox has its own status region, which is that widget's,
  // not a calculator's.
  await expect(page.locator('.tool-shell__core [aria-live]')).toHaveCount(2);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
