import { test, expect, type Page } from '@playwright/test';

/**
 * Calculator search component — isolated on the /dev/search demo route.
 * #search-a (full, interaction), #search-b (compact, interaction),
 * #search-c (full, eager) all share ONE fingerprinted index URL.
 */
const ROUTE = '/dev/search';
const RECENT_KEY = 'ac:recent-calculators';

const input = (p: Page) => p.locator('#search-a-input');
const options = (p: Page) => p.locator('#search-a-listbox [data-result]');
const group = (p: Page) => p.locator('#search-a [data-calc-search-group]');
const live = (p: Page) => p.locator('#search-a [data-calc-search-live]');
const foot = (p: Page) => p.locator('#search-a [data-calc-search-foot]');
const titleAt = (p: Page, i: number) => options(p).nth(i).locator('.calc-search__result-title');

async function ready(p: Page) {
  await input(p).click();
  await p.locator('#search-a[data-state="ready"]').waitFor({ timeout: 8000 });
}
async function search(p: Page, q: string) {
  await input(p).fill(q);
  await p.waitForTimeout(140);
}

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- ranking / filtering --------------------------------------- */

test('exact title filtering', async ({ page }) => {
  await ready(page);
  await search(page, 'Mortgage Calculator');
  expect((await titleAt(page, 0).textContent())?.trim()).toBe('Mortgage Calculator');
});

test('alias matching', async ({ page }) => {
  await ready(page);
  await search(page, 'heloc');
  expect((await titleAt(page, 0).textContent())?.trim()).toBe('Home Equity Loan Calculator');
});

test('natural-language phrase matching', async ({ page }) => {
  await ready(page);
  await search(page, 'how old am i');
  expect((await titleAt(page, 0).textContent())?.trim()).toBe('Age Calculator');
});

test('typo tolerance surfaces the right calculator', async ({ page }) => {
  await ready(page);
  await search(page, 'scientfic');
  expect((await titleAt(page, 0).textContent())?.trim()).toBe('Scientific Calculator');
});

test('multi-token ranking (car loan payment → Auto Loan)', async ({ page }) => {
  await ready(page);
  await search(page, 'car loan payment');
  expect((await titleAt(page, 0).textContent())?.trim()).toBe('Auto Loan Calculator');
});

test('caps visible rows at 10 and preserves the full count in "View all"', async ({ page }) => {
  await ready(page);
  await search(page, 'finance'); // category match → many results
  expect(await options(page).count()).toBe(10);
  const viewAll = foot(page).locator('.calc-search__viewall');
  await expect(viewAll).toBeVisible();
  const text = (await viewAll.textContent()) || '';
  const total = Number(text.match(/View all (\d+)/)?.[1]);
  expect(total).toBeGreaterThan(10);
  await expect(viewAll).toHaveAttribute('href', '/calculators?q=finance');
});

test('"View all" encodes the query', async ({ page }) => {
  await ready(page);
  await search(page, 'finance calc'); // still many finance matches
  const viewAll = foot(page).locator('.calc-search__viewall');
  if (await viewAll.count()) {
    await expect(viewAll).toHaveAttribute('href', '/calculators?q=finance%20calc');
  }
});

/* ---- empty state ------------------------------------------------ */

test('empty query shows recent calculators when present', async ({ page }) => {
  await page.addInitScript(
    (k) => localStorage.setItem(k, JSON.stringify(['finance/mortgage-calculator', 'health/bmi-calculator'])),
    RECENT_KEY,
  );
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await input(page).fill('');
  await page.waitForTimeout(120);
  await expect(group(page)).toHaveText('Recent calculators');
  expect((await titleAt(page, 0).textContent())?.trim()).toBe('Mortgage Calculator');
});

test('empty query falls back to popular calculators', async ({ page }) => {
  await ready(page);
  await input(page).fill('');
  await page.waitForTimeout(120);
  await expect(group(page)).toHaveText('Popular calculators');
  expect(await options(page).count()).toBeGreaterThan(0);
});

test('corrupt localStorage recovers to popular', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem(k, '{not valid json'), RECENT_KEY);
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await input(page).fill('');
  await page.waitForTimeout(120);
  await expect(group(page)).toHaveText('Popular calculators');
  expect(await options(page).count()).toBeGreaterThan(0);
});

/* ---- no results ------------------------------------------------- */

test('no results shows a message and fallback links', async ({ page }) => {
  await ready(page);
  await search(page, 'zzzqqq');
  await expect(foot(page).locator('.calc-search__empty')).toContainText('No calculator found for');
  await expect(foot(page).locator('.calc-search__fallback-links a')).toHaveAttribute('href', '/calculators');
  await expect(live(page)).toHaveText('0 calculators found.');
});

/* ---- keyboard / a11y ------------------------------------------- */

test('ArrowDown / ArrowUp move the active option', async ({ page }) => {
  await ready(page);
  await search(page, 'loan');
  await input(page).press('ArrowDown');
  await expect(input(page)).toHaveAttribute('aria-activedescendant', 'search-a-listbox-o0');
  await input(page).press('ArrowDown');
  await expect(input(page)).toHaveAttribute('aria-activedescendant', 'search-a-listbox-o1');
  await input(page).press('ArrowUp');
  await expect(input(page)).toHaveAttribute('aria-activedescendant', 'search-a-listbox-o0');
});

test('Home / End jump to first / last option', async ({ page }) => {
  await ready(page);
  await search(page, 'loan');
  const last = (await options(page).count()) - 1;
  await input(page).press('End');
  await expect(input(page)).toHaveAttribute('aria-activedescendant', `search-a-listbox-o${last}`);
  await input(page).press('Home');
  await expect(input(page)).toHaveAttribute('aria-activedescendant', 'search-a-listbox-o0');
});

test('Enter on an active option navigates to it', async ({ page }) => {
  await ready(page);
  await search(page, 'mortgage');
  await input(page).press('ArrowDown');
  await input(page).press('Enter');
  await page.waitForURL('**/finance/mortgage-calculator');
  expect(page.url()).toContain('/finance/mortgage-calculator');
});

test('Escape closes the list without clearing the query', async ({ page }) => {
  await ready(page);
  await search(page, 'mortgage');
  await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
  await input(page).press('Escape');
  await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(input(page)).toHaveValue('mortgage'); // query preserved
});

test('combobox ARIA wiring', async ({ page }) => {
  await expect(input(page)).toHaveAttribute('role', 'combobox');
  await expect(input(page)).toHaveAttribute('aria-autocomplete', 'list');
  await expect(input(page)).toHaveAttribute('aria-controls', 'search-a-listbox');
  await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#search-a-listbox')).toHaveAttribute('role', 'listbox');
  await ready(page);
  await search(page, 'mortgage');
  await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(options(page).first()).toHaveAttribute('role', 'option');
});

test('result-count live region announces totals', async ({ page }) => {
  await ready(page);
  await search(page, 'mortgage');
  await expect(live(page)).toHaveText('1 calculator found.');
  await search(page, 'loan');
  await expect(live(page)).toHaveText(/\d+ calculators found\./);
});

test('every result is a genuine anchor with a real href', async ({ page }) => {
  await ready(page);
  await search(page, 'loan');
  const n = await options(page).count();
  for (let i = 0; i < n; i++) {
    const href = await options(page).nth(i).getAttribute('href');
    expect(href).toMatch(/^\/[a-z]+\/[a-z0-9-]+$/);
  }
});

/* ---- form fallback / failure ----------------------------------- */

test('submitting with no active option opens /calculators?q=', async ({ page }) => {
  await ready(page);
  await search(page, 'mortgage');
  await input(page).press('Enter'); // no active option → GET form submits
  await page.waitForURL('**/calculators?q=mortgage');
  expect(page.url()).toContain('/calculators?q=mortgage');
});

test('failed index keeps the GET form working', async ({ page }) => {
  await page.route('**/search-index/**', (r) => r.abort());
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await input(page).click();
  await page.locator('#search-a[data-state="failed"]').waitFor({ timeout: 8000 });
  await search(page, 'mortgage');
  await expect(foot(page).locator('.calc-search__empty')).toContainText('unavailable');
  await input(page).press('Enter'); // still submits
  await page.waitForURL('**/calculators?q=mortgage');
});

/* ---- security / privacy ---------------------------------------- */

test('renders query text safely (no HTML injection)', async ({ page }) => {
  await ready(page);
  for (const q of ['<calculator>', '<img src=x onerror="1">', '"quoted"', '1/x', 'kg/lb', 'a % b']) {
    await search(page, q);
    // No injected elements from the query:
    expect(await page.locator('#search-a img').count()).toBe(0);
    expect(await page.locator('#search-a calculator').count()).toBe(0);
  }
  // A no-results query with markup echoes as TEXT, never as elements.
  await search(page, 'zzzqqq<b>');
  await expect(foot(page).locator('.calc-search__empty strong')).toContainText('zzzqqq');
  expect(await page.locator('#search-a b').count()).toBe(0);
});

test('never stores the raw query in localStorage', async ({ page }) => {
  await ready(page);
  await search(page, 'mortgage supersecret');
  await input(page).press('ArrowDown');
  await input(page).press('Enter');
  await page.waitForURL('**/finance/mortgage-calculator');
  const store = await page.evaluate(() => ({ ...localStorage }));
  const recent = store[RECENT_KEY] || '';
  expect(recent).toContain('finance/mortgage-calculator'); // id saved
  const all = JSON.stringify(store);
  expect(all).not.toContain('supersecret'); // raw query never stored anywhere
});

/* ---- mobile ----------------------------------------------------- */

test('mobile: 52px rows, no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await ready(page);
  await search(page, 'loan');
  const box = await options(page).first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(52);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

/* ---- caching ---------------------------------------------------- */

test('multiple instances fetch the index only once', async ({ page }) => {
  const reqs: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/search-index/')) reqs.push(r.url()); });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await page.locator('#search-c[data-state="ready"]').waitFor({ timeout: 8000 }); // eager instance loads it
  await page.locator('#search-a-input').click(); // interaction instances reuse the cached promise
  await page.locator('#search-b-input').click();
  await page.waitForTimeout(200);
  expect(reqs.length).toBe(1);
});
