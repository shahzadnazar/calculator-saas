import { test, expect, type Page } from '@playwright/test';

/**
 * Age calculator — R18C1 task-first migration (everyday date/duration). Wraps the R18C0-repaired
 * calculateAge (UNCHANGED) via its OWN age-form.ts binding on the UNCHANGED standard-form runtime.
 * Task-first: DOB starts EMPTY, "age at" defaults to the visitor's local TODAY (client-set on
 * hydration), the result is empty on the server AND after hydration (the legacy island auto-calculated
 * a 2000-01-01 → today example). The dominant result is the exact age (y/m/d); total months/weeks/days
 * and next-birthday are supporting. Exact-age assertions fill BOTH dates deterministically — never the
 * wall clock — and pin the R18C0 month-end repair (2020-01-31 → 2020-03-01 = 0y 1m 1d).
 */
const ROUTE = '/everyday/age-calculator';
const EMBED = '/embed/everyday/age-calculator';
const GUIDE = '/guides/how-to-calculate-your-exact-age';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#age-result');
const primary = (page: Page) => page.locator('#age-result [data-result-when~="valid"] [data-result-value]').first();
const summaryLabel = (page: Page) => page.locator('#age-result [data-result-summary-label]');
const months = (page: Page) => page.locator('[data-age-months]');
const weeks = (page: Page) => page.locator('[data-age-weeks]');
const days = (page: Page) => page.locator('[data-age-days]');
const next = (page: Page) => page.locator('[data-age-next]');
const interpretation = (page: Page) => page.locator('[data-age-interpretation]');
const live = (page: Page) => page.locator('#age-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate Age' });
const region = (page: Page, when: string) => page.locator(`#age-result [data-result-when~="${when}"]`);

const localToday = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });

type Inp = Partial<{ dob: string; at: string }>;
const calc = async (page: Page, i: Inp) => {
  if (i.dob !== undefined) await page.locator('[name="dob"]').fill(i.dob);
  if (i.at !== undefined) await page.locator('[name="at"]').fill(i.at);
  await submit(page).click();
};

test.describe('age: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- SSR / hydration parity ---- */

  test('the server-rendered result region equals the hydrated one — empty, no baked-in age', async ({ page }) => {
    const raw = await (await page.request.get(ROUTE)).text();
    const server = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        state: d.querySelector('#age-result')?.getAttribute('data-result-state') ?? null,
        primary: d.querySelector('#age-result [data-result-when~="valid"] [data-result-value]')?.textContent?.trim() ?? null,
        dob: d.querySelector<HTMLInputElement>('[name="dob"]')?.getAttribute('value') ?? '',
      };
    }, raw);
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
    expect(server.state).toBe('empty');
    expect(server.primary).toBe('—');
    expect(server.dob).toBe(''); // no baked DOB
    // The example is rendered on hydration, never baked into the HTML — so the two DIFFER.
    expect(server.primary).not.toBe((await primary(page).textContent())?.trim());
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  });

  /* ---- initial state ---- */

  test('loads empty — DOB blank, "age at" defaults to today, no result/announcement', async ({ page }) => {
    await expect(page.locator('[name="dob"]')).toHaveValue('');
    await expect(page.locator('[name="at"]')).toHaveValue(await localToday(page));
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    // The example fills this calculator's OWN valid region, so it is visible on load.
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await page.locator('[name="dob"]').fill('1990-06-15');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- computation ---- */

  test('ordinary exact age: DOB + as-of → dominant y/m/d, totals, next birthday, announcement', async ({ page }) => {
    await calc(page, { dob: '1990-06-15', at: '2020-06-15' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Exact age');
    await expect(primary(page)).toHaveText('30 years, 0 months, 0 days');
    await expect(months(page)).toHaveText('360'); // total months
    await expect(weeks(page)).toHaveText(/^[\d,]+$/);
    await expect(days(page)).toHaveText(/^[\d,]+$/);
    await expect(next(page)).toHaveText(/^[\d,]+$/);
    await expect(interpretation(page)).toContainText('until the next birthday');
    await expect(live(page)).toHaveText('Exact age: 30 years, 0 months, 0 days.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('a same-date pair is a VALID zero age (0y 0m 0d), not empty or invalid', async ({ page }) => {
    await calc(page, { dob: '2020-06-15', at: '2020-06-15' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0 years, 0 months, 0 days');
    await expect(months(page)).toHaveText('0');
    await expect(weeks(page)).toHaveText('0');
    await expect(days(page)).toHaveText('0');
    await expect(live(page)).toHaveText('Exact age: 0 years, 0 months, 0 days.');
  });

  test('preserves the R18C0 month-end repair: 2020-01-31 → 2020-03-01 = 0y 1m 1d (30 days)', async ({ page }) => {
    await calc(page, { dob: '2020-01-31', at: '2020-03-01' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0 years, 1 month, 1 day');
    await expect(days(page)).toHaveText('30'); // total days
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|-\d|Infinity|undefined/);
  });

  test('a leap-day birth reaches its clamped anniversary as a full year: 2020-02-29 → 2021-02-28 = 1y', async ({ page }) => {
    await calc(page, { dob: '2020-02-29', at: '2021-02-28' });
    await expect(primary(page)).toHaveText('1 year, 0 months, 0 days');
    await expect(months(page)).toHaveText('12');
  });

  /* ---- validation ---- */

  test('an empty submission focuses the first required field (DOB)', async ({ page }) => {
    // clear the today-defaulted as-of so both are empty
    await page.locator('[name="at"]').fill('');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="dob"]')).toHaveText('Enter a date of birth.');
    await expect(page.locator('[name="dob"]')).toBeFocused();
  });

  test('a date of birth after the as-of date is a cross-field error on the DOB field (never swapped)', async ({ page }) => {
    await calc(page, { dob: '2021-06-15', at: '2020-06-15' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="dob"]')).toContainText('on or before');
    await expect(page.locator('[name="dob"]')).toBeFocused();
  });

  /* ---- live-after-first / invalidate / reset ---- */

  test('after the first result, editing DOB recalculates live without moving focus', async ({ page }) => {
    await calc(page, { dob: '1990-06-15', at: '2020-06-15' });
    await page.locator('[name="dob"]').fill('2000-06-15');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('20 years, 0 months, 0 days');
    await expect(page.locator('[name="dob"]')).toBeFocused();
  });

  test('after the first result, editing the as-of date recalculates live', async ({ page }) => {
    await calc(page, { dob: '1990-06-15', at: '2020-06-15' });
    await page.locator('[name="at"]').fill('2010-06-15');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('20 years, 0 months, 0 days');
  });

  test('an invalid live edit (DOB after as-of) clears the stale result, keeping focus', async ({ page }) => {
    await calc(page, { dob: '1990-06-15', at: '2020-06-15' });
    await expect(region(page, 'valid')).toBeVisible();
    await page.locator('[name="dob"]').fill('2021-06-15');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[name="dob"]')).toBeFocused();
  });

  test('reset clears DOB, restores the today default for as-of, empties the result', async ({ page }) => {
    await calc(page, { dob: '1990-06-15', at: '2010-06-15' });
    await expect(primary(page)).not.toHaveText('—');
    await page.click('[data-reset]');
    await expect(page.locator('[name="dob"]')).toHaveValue('');
    await expect(page.locator('[name="at"]')).toHaveValue(await localToday(page));
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / guide / monetization ---- */

  test('keyboard submission works from a field', async ({ page }) => {
    await page.locator('[name="dob"]').fill('1990-06-15');
    await page.locator('[name="at"]').fill('2020-06-15');
    await page.locator('[name="at"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('desktop shows the exact age within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await calc(page, { dob: '1990-06-15', at: '2020-06-15' });
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page, { dob: '1990-06-15', at: '2020-06-15' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page, { dob: '1990-06-15', at: '2020-06-15' });
    await expect(primary(page)).toBeVisible();
  });

  test('the generated embed mounts the same island (empty SSR, no auto-calc, then an age)', async ({ page }) => {
    await page.goto(EMBED, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#age-result')).toHaveAttribute('data-result-state', 'example');
    await page.locator('[name="dob"]').fill('1990-06-15');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('#age-result')).toHaveAttribute('data-result-state', 'empty'); // no auto-calc
    await page.locator('[name="at"]').fill('2020-06-15');
    await page.getByRole('button', { name: 'Calculate Age' }).click();
    await expect(page.locator('#age-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#age-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('30 years, 0 months, 0 days');
  });

  test('the direct guide renderer mounts the same working island', async ({ page }) => {
    await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#age-result')).toHaveAttribute('data-result-state', 'example');
    await page.locator('[name="dob"]').fill('1990-06-15');
    await page.locator('[name="at"]').fill('2020-06-15');
    await page.getByRole('button', { name: 'Calculate Age' }).click();
    await expect(page.locator('#age-result [data-result-when~="valid"] [data-result-value]').first()).toHaveText('30 years, 0 months, 0 days');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});

/* -------------------- "age at" defaults to the visitor's LOCAL civil date (R18C1.1) --------------------
 * The as-of default must be the visitor's LOCAL calendar date, not the UTC date of the instant. Each
 * case freezes a UTC instant (page.clock) under a controlled browser timezone (timezoneId) and asserts
 * the hydrated as-of value against a HARD-CODED expected local date (an oracle independent of todayISO):
 * at 2026-08-09T21:30Z, Asia/Karachi (+05:00) is already 2026-08-10 while UTC is still 2026-08-09. */
const TZ_CASES = [
  { tz: 'Asia/Karachi', instant: '2026-08-09T21:30:00Z', expected: '2026-08-10' }, // +05:00 crosses midnight
  { tz: 'UTC', instant: '2026-08-09T21:30:00Z', expected: '2026-08-09' }, // UTC baseline (the earlier artifact)
  { tz: 'America/Los_Angeles', instant: '2026-08-10T04:30:00Z', expected: '2026-08-09' }, // -07:00, still prev day
  { tz: 'Asia/Karachi', instant: '2026-12-31T20:00:00Z', expected: '2027-01-01' }, // year rollover
];

for (const c of TZ_CASES) {
  test.describe(`age: as-of = local date — ${c.tz} @ ${c.instant}`, () => {
    test.use({ timezoneId: c.tz });
    test(`hydrates as-of to ${c.expected} (local), DOB empty, result empty`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(c.instant));
      await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[name="at"]')).toHaveValue(c.expected);
      await expect(page.locator('[name="dob"]')).toHaveValue('');
      await expect(shell(page)).toHaveAttribute('data-result-state', 'example'); // no calc from populating today
      await expect(live(page)).toHaveText('');
    });
  });
}

test.describe('age: local-today under Asia/Karachi — reset + explicit calc still correct (R18C1.1)', () => {
  test.use({ timezoneId: 'Asia/Karachi' });

  test('reset restores the Karachi-local date across the UTC boundary', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-08-09T21:30:00Z'));
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await page.locator('[name="dob"]').fill('1990-06-15');
    await page.locator('[name="at"]').fill('2020-06-15');
    await page.getByRole('button', { name: 'Calculate Age' }).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await page.click('[data-reset]');
    await expect(page.locator('[name="at"]')).toHaveValue('2026-08-10'); // Karachi local, not UTC 08-09
    await expect(page.locator('[name="dob"]')).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('explicit-date calculation is timezone-independent: Jan-31→Mar-01 = 0y 1m 1d; same-date = 0', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-08-09T21:30:00Z'));
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page, { dob: '2020-01-31', at: '2020-03-01' });
    await expect(primary(page)).toHaveText('0 years, 1 month, 1 day');
    await calc(page, { dob: '2020-06-15', at: '2020-06-15' });
    await expect(primary(page)).toHaveText('0 years, 0 months, 0 days');
  });
});

/* -------------------- same-document two-instance isolation -------------------- */

test.describe('age: same-document instance isolation', () => {
  const FIXTURE = 'http://localhost:4399/__age-two-instance-fixture';

  async function mountTwo(page: Page) {
    const raw = await (await page.request.get('http://localhost:4399/everyday/age-calculator')).text();
    const parts = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const root = d.querySelector('[data-age]');
      const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const script = [...d.querySelectorAll('script[type="module"][src]')]
        .map((s) => s.getAttribute('src'))
        .find((src) => /AgeCalculator/.test(src ?? ''));
      return { rootHTML: root?.outerHTML ?? '', links, script };
    }, raw);
    const doc =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
      `</head><body><div id="inst-a">${parts.rootHTML}</div><div id="inst-b">${parts.rootHTML}</div>` +
      `<script type="module" src="${parts.script}"></script></body></html>`;
    await page.route('**/__age-two-instance-fixture', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }));
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await expect(page.locator('#inst-a [data-age]')).toHaveCount(1);
    await expect(page.locator('#inst-b [data-age]')).toHaveCount(1);
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
      await scope('[name="dob"]').fill('1990-06-15');
      await scope('[name="at"]').fill('2020-06-15');
      await scope('button[type="submit"]').click();
    };
    await fill(A);
    await expect(A('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('30 years, 0 months, 0 days');
    await expect(B('[data-result-shell]')).toHaveAttribute('data-result-state', 'example'); // B untouched

    await fill(B);
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('30 years, 0 months, 0 days');

    await A('[data-reset]').click();
    await expect(A('[data-result-shell]')).toHaveAttribute('data-result-state', 'empty');
    await expect(B('[data-result-when~="valid"] [data-result-value]').first()).toHaveText('30 years, 0 months, 0 days'); // B unaffected
  });
});
