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

/**
 * The hero wraps the search in `text-center lg:text-left`, so on a phone every
 * result inherited centre alignment: the title floated in the middle of its row
 * and the blurb sat indented beneath it, lined up with nothing. The component
 * declares its own alignment now, which is what these assert — measured against
 * the row's own left padding rather than a hard-coded x.
 */
test.describe('mobile alignment inside a centred host', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  const heroInput = (p: Page) => p.locator('#hero-search-input');
  const heroOptions = (p: Page) => p.locator('#hero-search [role="option"]');

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await heroInput(page).click();
    await heroInput(page).pressSequentially('calc', { delay: 30 });
    await expect(heroOptions(page).first()).toBeVisible();
  });

  test('the host really is centred — otherwise this proves nothing', async ({ page }) => {
    const hostAlign = await page.evaluate(() => {
      const host = document.querySelector('#hero-search')!.parentElement!;
      return getComputedStyle(host).textAlign;
    });
    expect(hostAlign).toBe('center');
  });

  test('title and blurb start at the same left edge, flush with the row', async ({ page }) => {
    const row = heroOptions(page).first();
    const edges = await row.evaluate((el) => {
      const pad = parseFloat(getComputedStyle(el).paddingLeft);
      const left = el.getBoundingClientRect().left + pad;
      const of = (sel: string) => el.querySelector(sel)!.getBoundingClientRect().left;
      return {
        title: of('.calc-search__result-title') - left,
        blurb: of('.calc-search__result-blurb') - left,
      };
    });
    expect(Math.abs(edges.title)).toBeLessThanOrEqual(1);
    expect(Math.abs(edges.blurb)).toBeLessThanOrEqual(1);
  });

  test('category and arrow sit on one line, centred against the row', async ({ page }) => {
    const row = heroOptions(page).first();
    const m = await row.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cat = el.querySelector('.calc-search__result-cat')!.getBoundingClientRect();
      const arrow = el.querySelector('.calc-search__result-arrow')!.getBoundingClientRect();
      return {
        catMid: cat.top + cat.height / 2 - (r.top + r.height / 2),
        arrowMid: arrow.top + arrow.height / 2 - (r.top + r.height / 2),
        gap: arrow.left - cat.right,
        rightPad: r.right - arrow.right - parseFloat(getComputedStyle(el).paddingRight),
      };
    });
    expect(Math.abs(m.catMid)).toBeLessThanOrEqual(2);
    expect(Math.abs(m.arrowMid)).toBeLessThanOrEqual(2);
    expect(m.gap).toBeGreaterThan(0);
    expect(Math.abs(m.rightPad)).toBeLessThanOrEqual(1);
  });

  test('the longest title never shoves the category or the arrow off the row', async ({ page }) => {
    // 320px is the narrowest viewport the site supports, and "Standard Deviation
    // Calculator" is the longest title in the registry — the worst case there is.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await heroInput(page).fill('standard deviation');
      await expect(heroOptions(page).first()).toBeVisible();

      const row = heroOptions(page).first();
      const m = await row.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const box = (sel: string) => el.querySelector(sel)!.getBoundingClientRect();
        const title = el.querySelector('.calc-search__result-title') as HTMLElement;
        return {
          titleOverCat: box('.calc-search__result-title').right - box('.calc-search__result-cat').left,
          arrowOver: box('.calc-search__result-arrow').right - r.right,
          titleOverflows: title.getBoundingClientRect().width < title.scrollWidth - 1,
          ellipsis: getComputedStyle(title).textOverflow,
        };
      });

      expect(m.titleOverCat, `title runs into the category at ${width}px`).toBeLessThanOrEqual(1);
      expect(m.arrowOver, `arrow escapes the row at ${width}px`).toBeLessThanOrEqual(1);
      // Whether it actually clips depends on the width; that it clips rather than
      // spilling is the contract.
      if (m.titleOverflows) expect(m.ellipsis).toBe('ellipsis');
    }
  });
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

/* ---- The home page's hero search ---------------------------------------- */

/**
 * The hero used to be a plain GET form with no dropdown. It is now the SAME
 * combobox as everywhere else, so these tests cover the wiring — that the live
 * listbox actually appears on `/` and still degrades to a real form — not the
 * ranking, which the tests above already own.
 */
test.describe('home page hero search', () => {
  const input = (page: Page) => page.locator('#hero-search-input');
  const panel = (page: Page) => page.locator('#hero-search [data-calc-search-panel]');
  const options = (page: Page) => page.locator('#hero-search [role="option"]');

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('typing opens a live dropdown of matching calculators', async ({ page }) => {
    await expect(panel(page)).toBeHidden();
    await input(page).click();
    await input(page).pressSequentially('mort', { delay: 30 });
    await expect(panel(page)).toBeVisible();
    await expect(options(page).first()).toContainText('Mortgage Calculator');
    await expect(options(page).first()).toContainText('Finance');
  });

  test('the list narrows as more is typed, and clears back out', async ({ page }) => {
    await input(page).click();
    await input(page).pressSequentially('c', { delay: 30 });
    const broad = await options(page).count();
    await input(page).pressSequentially('alorie', { delay: 30 });
    await expect(options(page).first()).toContainText('Calorie Calculator');
    expect(await options(page).count()).toBeLessThanOrEqual(broad);
  });

  test('is a real combobox: aria-expanded, keyboard selection and Escape', async ({ page }) => {
    await expect(input(page)).toHaveAttribute('role', 'combobox');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
    await input(page).click();
    await input(page).pressSequentially('bmi', { delay: 30 });
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
    await input(page).press('ArrowDown');
    await expect(options(page).first()).toHaveAttribute('aria-selected', 'true');
    await input(page).press('Escape');
    await expect(panel(page)).toBeHidden();
  });

  test('Enter on a highlighted option opens that calculator', async ({ page }) => {
    await input(page).click();
    await input(page).pressSequentially('mortgage', { delay: 30 });
    await input(page).press('ArrowDown');
    await input(page).press('Enter');
    await page.waitForURL('**/finance/mortgage-calculator');
  });

  test('still submits to /calculators when nothing is highlighted', async ({ page }) => {
    await input(page).fill('interest');
    await page.locator('#hero-search button[type="submit"]').click();
    await page.waitForURL('**/calculators?q=interest');
  });

  test('a query with no match offers something rather than a dead end', async ({ page }) => {
    await input(page).click();
    await input(page).pressSequentially('zzzzqqq', { delay: 30 });
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).not.toHaveText('');
  });

  test('the dropdown does not push the page sideways on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await input(page).click();
    await input(page).pressSequentially('mort', { delay: 30 });
    await expect(panel(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
