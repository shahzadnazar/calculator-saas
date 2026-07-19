import { test, expect, type Page } from '@playwright/test';

/**
 * Monetization-region architecture (R5), on the internal /dev/monetization demo.
 *
 * Placeholders only: these tests confirm the orchestrator's gating (state,
 * consent, result-state, sidebar), the per-module distinctions + disclosures,
 * the no-fill/CLS reservation behaviour, and — importantly — that nothing here
 * makes a third-party/analytics request or leaks sensitive data.
 */
const ROUTE = '/dev/monetization';

const cell = (page: Page, demo: string) => page.locator(`[data-demo="${demo}"]`);
const region = (page: Page, demo: string) => cell(page, demo).locator('[data-mon-region]');

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Slot states -------------------------------------------------------- */

test('disabled renders no region and occupies no region element', async ({ page }) => {
  await expect(region(page, 'state-disabled')).toHaveCount(0);
});

test('reserved and loading render a region with stable reserved dimensions', async ({ page }) => {
  for (const demo of ['state-reserved', 'state-loading']) {
    const r = region(page, demo);
    await expect(r).toHaveCount(1);
    const box = await r.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(80); // reserved dimensions held
  }
});

test('filled shows the module with an explicit disclosure', async ({ page }) => {
  const r = region(page, 'state-filled');
  await expect(r).toHaveAttribute('data-mon-state', 'filled');
  await expect(r).toContainText('Advertisement');
});

test('a visible no-fill retains its reservation; an unseen lazy no-fill collapses', async ({ page }) => {
  const seen = region(page, 'state-nofill-seen');
  await expect(seen).toHaveCount(1);
  expect((await seen.boundingBox())!.height).toBeGreaterThanOrEqual(80); // retained
  await expect(region(page, 'state-nofill-unseen')).toHaveCount(0); // collapsed
});

test('failed retains the reservation while visible', async ({ page }) => {
  await expect(region(page, 'state-failed')).toHaveCount(1);
});

/* ---- Module kinds + disclosures ----------------------------------------- */

test('each module kind renders a distinct, correctly-labelled placeholder', async ({ page }) => {
  await expect(region(page, 'module-ad')).toContainText('Advertisement');
  await expect(region(page, 'module-affiliate')).toContainText(/partner links|commission/i);
  await expect(region(page, 'module-sponsored')).toContainText('Sponsored');
  await expect(region(page, 'module-premium')).toContainText('AllCalculators Plus');
  await expect(region(page, 'module-embed')).toContainText('Embed this tool');
  await expect(region(page, 'module-api')).toContainText('AllCalculators API');
  await expect(region(page, 'module-lead')).toContainText(/quote/i);
  // Distinct module identity is exposed for each.
  await expect(region(page, 'module-sponsored')).toHaveAttribute('data-mon-module', 'sponsored');
  await expect(region(page, 'module-premium')).toHaveAttribute('data-mon-module', 'premium');
});

test('every rendered region is a labelled complementary landmark', async ({ page }) => {
  const regions = page.locator('[data-mon-region]');
  const n = await regions.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    await expect(regions.nth(i)).toHaveAttribute('role', 'complementary');
    expect((await regions.nth(i).getAttribute('aria-label'))?.length).toBeGreaterThan(0);
  }
});

/* ---- Result-state gating ------------------------------------------------ */

test('post-result renders only for a fresh valid result', async ({ page }) => {
  await expect(region(page, 'gate-valid')).toHaveCount(1);
  await expect(region(page, 'gate-stale')).toHaveCount(0);
  await expect(region(page, 'gate-invalid')).toHaveCount(0);
  await expect(region(page, 'gate-empty')).toHaveCount(0);
});

/* ---- Consent ------------------------------------------------------------ */

test('consent gates restricted modules; placeholders only when granted', async ({ page }) => {
  await expect(region(page, 'consent-denied')).toHaveCount(0); // lead, no consent
  await expect(region(page, 'consent-granted')).toHaveCount(1); // lead, consent granted
  await expect(region(page, 'consent-ad-denied')).toHaveCount(0); // ad, no advertising consent
});

/* ---- Sidebar eligibility ------------------------------------------------ */

test('an eligible wide workspace shows the sidebar; a narrow one hides it (core not compressed)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const wideSide = cell(page, 'sidebar-eligible').locator('.mon-elig-side');
  const narrowSide = cell(page, 'sidebar-ineligible').locator('.mon-elig-side');
  await expect(wideSide).toBeVisible();
  await expect(narrowSide).toBeHidden();
  // The narrow core keeps its width (never compressed by a sidebar).
  const core = cell(page, 'sidebar-ineligible').locator('.mon-elig-core');
  expect((await core.boundingBox())!.width).toBeGreaterThan(0);
});

/* ---- Responsive / theme ------------------------------------------------- */

test('mobile: the sidebar column drops below the core and nothing overflows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(cell(page, 'sidebar-eligible').locator('.mon-elig-side')).toBeHidden(); // container too narrow
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(region(page, 'module-sponsored')).toBeVisible();
});

/* ---- No focus trap / autofocus ------------------------------------------ */

test('does not autofocus a monetization region on load', async ({ page }) => {
  const active = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
  expect(['BODY', 'HTML']).toContain(active);
});

/* ---- Privacy: no third-party / analytics / sensitive data --------------- */

test('makes no third-party or analytics requests and leaks no sensitive data', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') external.push(r.url());
  });
  await page.goto(ROUTE, { waitUntil: 'networkidle' });

  expect(external, `unexpected external requests: ${external.join(', ')}`).toEqual([]);

  // Regions carry only placement/state/module metadata — no input/result/query data.
  const attrs = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('[data-mon-region] *, [data-mon-region]'))) {
      for (const a of Array.from(el.attributes)) out.push(`${a.name}=${a.value}`);
    }
    return out.join('\n');
  });
  expect(attrs).not.toMatch(/password|heightCm|weightKg|data-value|inputmode|result-value/i);
  // No analytics/tracking script tags present.
  const scripts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src') ?? ''),
  );
  expect(scripts.some((s) => /google-analytics|googletagmanager|gtag|plausible|segment|doubleclick|adsbygoogle/i.test(s))).toBe(
    false,
  );
});

/* ---- Result-state bridge (R6, layout integration) ----------------------- */

const gate = (page: Page, demo: string) => cell(page, demo).locator('[data-mon-client-gated]');
// Workspace controls (exclude the external-scope buttons, which share data-act/target).
const act = (page: Page, demo: string, action: string, target = 0) =>
  cell(page, demo).locator(`[data-act="${action}"][data-target="${target}"]:not([data-scope="ext"])`).click();
// Unrelated external-shell controls (outside [data-calculator-workspace]).
const actExternal = (page: Page, demo: string, action: string, target = 0) =>
  cell(page, demo).locator(`[data-scope="ext"][data-act="${action}"][data-target="${target}"]`).click();

test('the post-result region starts hidden and reveals only for a fresh valid result', async ({ page }) => {
  const region = gate(page, 'bridge-single');
  await expect(region).toBeHidden(); // empty on load
  await expect(region).toHaveAttribute('data-mon-eligible', 'false');

  await act(page, 'bridge-single', 'valid');
  await expect(region).toBeVisible();
  await expect(region).toHaveAttribute('data-mon-eligible', 'true');
  await expect(region).toContainText(/partner links|commission/i); // affiliate placeholder
});

test('the region hides again on stale, recalculating, invalid or reset', async ({ page }) => {
  const region = gate(page, 'bridge-single');
  for (const blocking of ['stale', 'calc', 'invalid', 'empty']) {
    await act(page, 'bridge-single', 'valid');
    await expect(region).toBeVisible();
    await act(page, 'bridge-single', blocking);
    await expect(region).toBeHidden();
    await expect(region).toHaveAttribute('data-mon-eligible', 'false');
  }
});

test('percentage: three independent equations share ONE region; any single valid result qualifies', async ({ page }) => {
  const region = gate(page, 'bridge-percent');
  await expect(cell(page, 'bridge-percent').locator('[data-result-shell]')).toHaveCount(3);
  await expect(region).toBeHidden();

  // Only the second equation is valid → the single region reveals.
  await act(page, 'bridge-percent', 'valid', 1);
  await expect(region).toBeVisible();

  // Reset it → all three empty again → hidden.
  await act(page, 'bridge-percent', 'empty', 1);
  await expect(region).toBeHidden();

  // Two others valid → still one region, still shown.
  await act(page, 'bridge-percent', 'valid', 0);
  await act(page, 'bridge-percent', 'valid', 2);
  await expect(region).toBeVisible();
});

test('the post-result region is a sibling of the result shell, never nested inside it', async ({ page }) => {
  const nested = await cell(page, 'bridge-single').locator('[data-result-shell] [data-mon-region]').count();
  expect(nested).toBe(0);
});

/* ---- Result-bridge scope: workspace-only, ignores external shells (R6.1) ---- */

test('an unrelated external valid result does NOT make an empty workspace eligible', async ({ page }) => {
  const region = gate(page, 'bridge-single');
  await expect(region).toBeHidden();
  await actExternal(page, 'bridge-single', 'valid'); // external shell → valid
  await expect(region).toBeHidden(); // workspace still empty → blocked
  await expect(region).toHaveAttribute('data-mon-eligible', 'false');
});

test('an external valid result does NOT rescue an invalid workspace', async ({ page }) => {
  const region = gate(page, 'bridge-single');
  await act(page, 'bridge-single', 'invalid'); // workspace → invalid
  await actExternal(page, 'bridge-single', 'valid'); // external → valid
  await expect(region).toBeHidden();
});

test('eligibility tracks the workspace result and ignores external mutations', async ({ page }) => {
  const region = gate(page, 'bridge-single');
  await act(page, 'bridge-single', 'valid'); // workspace → valid
  await expect(region).toBeVisible();
  // Mutating the unrelated external shell (valid → empty → valid) never changes it.
  await actExternal(page, 'bridge-single', 'valid');
  await expect(region).toBeVisible();
  await actExternal(page, 'bridge-single', 'empty');
  await expect(region).toBeVisible(); // still driven only by the workspace result
  // Only a workspace change flips it.
  await act(page, 'bridge-single', 'empty');
  await expect(region).toBeHidden();
});

test('the workspace root scopes the shell query (external shell is outside it)', async ({ page }) => {
  const scope = cell(page, 'bridge-single');
  // The external shell exists but lives OUTSIDE [data-calculator-workspace].
  await expect(scope.locator('[data-external-shell]')).toHaveCount(1);
  await expect(scope.locator('[data-calculator-workspace] [data-external-shell]')).toHaveCount(0);
  await expect(scope.locator('[data-calculator-workspace] [data-result-shell]')).toHaveCount(1);
});

test('percentage: the any-fresh-valid rule still holds within the scoped workspace', async ({ page }) => {
  const region = gate(page, 'bridge-percent');
  await expect(cell(page, 'bridge-percent').locator('[data-calculator-workspace] [data-result-shell]')).toHaveCount(3);
  await act(page, 'bridge-percent', 'valid', 2); // only the third equation
  await expect(region).toBeVisible();
  await act(page, 'bridge-percent', 'empty', 2);
  await expect(region).toBeHidden();
});

test('a stale workspace output stays blocked', async ({ page }) => {
  const region = gate(page, 'bridge-single');
  await act(page, 'bridge-single', 'valid');
  await expect(region).toBeVisible();
  await act(page, 'bridge-single', 'stale'); // password-style stale
  await expect(region).toBeHidden();
});

/* ---- Disabled ⇒ nothing on a real (live) calculator page ---------------- */

test('a live calculator page carries no monetization region, wrapper, CSS or bridge', async ({ page }) => {
  await page.goto('/health/bmi-calculator', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  await expect(page.locator('[data-mon-workspace]')).toHaveCount(0);
  await expect(page.locator('[data-mon-client-gated]')).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toContain('data-mon-');
  expect(html).not.toContain('mon-region{');
  expect(html).not.toContain('mon-workspace{');
});
