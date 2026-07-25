import { test, expect, type Page } from '@playwright/test';

/**
 * Password generator — the R4 generator-runtime pilot, on its LIVE page.
 *
 * Beyond the usual doctrine checks, this suite is security-focused: the
 * generated password must never appear in an aria-live region, in storage, in
 * the URL, in a network request or in the console; Copy is gated on a fresh
 * output; and a settings change marks the output stale rather than regenerating.
 */
const ROUTE = '/everyday/password-generator';

const shell = (page: Page) => page.locator('#pg-result');
const output = (page: Page) => page.locator('[data-generator-output]');
const generateBtn = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const copyBtn = (page: Page) => page.locator('[data-copy]');
const live = (page: Page) => page.locator('#pg-live');
const readOutput = (page: Page) => page.inputValue('[data-generator-output]');
const generate = (page: Page) => generateBtn(page).click();

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads with no password, an empty output, Copy disabled, Generate visible', async ({ page }) => {
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(output(page)).toHaveValue('');
  await expect(copyBtn(page)).toBeDisabled();
  await expect(generateBtn(page)).toHaveText('Generate Password');
  await expect(generateBtn(page)).toBeVisible();
  await expect(live(page)).toHaveText('');
});

test('does not generate automatically when settings change', async ({ page }) => {
  await page.locator('#pg-length').fill('32');
  await page.locator('input[name="symbols"]').click();
  await page.waitForTimeout(200);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(output(page)).toHaveValue('');
});

/* ---- Explicit generation ------------------------------------------------ */

test('generates a valid password with the selected classes, strength and Copy enabled', async ({ page }) => {
  await generate(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  const pw = await readOutput(page);
  expect(pw).toHaveLength(16);
  expect(/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)).toBe(true);
  await expect(page.locator('.pg-strength')).not.toHaveText('—');
  await expect(copyBtn(page)).toBeEnabled();
  await expect(generateBtn(page)).toHaveText('Generate New Password');
});

test('the generated password is never placed in the live region', async ({ page }) => {
  await generate(page);
  const pw = await readOutput(page);
  await expect(live(page)).toHaveText('Password generated.');
  expect(await live(page).textContent()).not.toContain(pw);
});

/* ---- Stale on settings change ------------------------------------------- */

test('a settings change marks the output stale, keeps it visible, disables Copy', async ({ page }) => {
  await generate(page);
  const pw = await readOutput(page);
  await page.locator('input[name="symbols"]').click(); // change a setting
  await page.waitForTimeout(200);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid'); // not a new state
  await expect(shell(page)).toHaveAttribute('data-stale', 'true');
  await expect(output(page)).toHaveValue(pw); // last password kept visible
  await expect(copyBtn(page)).toBeDisabled();
  await expect(page.locator('[data-stale-note]')).toBeVisible();
  await expect(live(page)).toHaveText('Settings changed. Generate again to apply them.');
});

test('regenerating clears the stale state and applies the new settings', async ({ page }) => {
  await generate(page);
  const first = await readOutput(page);
  await page.locator('input[name="symbols"]').click(); // drop symbols
  await page.waitForTimeout(200);
  await generate(page);
  await expect(shell(page)).toHaveAttribute('data-stale', 'false');
  const second = await readOutput(page);
  expect(second).not.toBe(first);
  expect(/[^A-Za-z0-9]/.test(second)).toBe(false); // symbols now excluded
  await expect(copyBtn(page)).toBeEnabled();
});

/* ---- Validation --------------------------------------------------------- */

test('generating with no character type selected shows an error and focuses the first control', async ({ page }) => {
  for (const n of ['upper', 'lower', 'digits', 'symbols']) {
    const box = page.locator(`input[name="${n}"]`);
    if (await box.isChecked()) await box.click();
  }
  await generate(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="charsets"]')).toHaveText('Select at least one character type.');
  await expect(page.locator('input[name="upper"]')).toBeFocused();
  await expect(output(page)).toHaveValue(''); // no fabricated output
});

/* ---- Copy --------------------------------------------------------------- */

test('Copy confirms and announces the action, never the password', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await generate(page);
  const pw = await readOutput(page);
  await copyBtn(page).click();
  await expect(page.locator('[data-copy-confirm]')).toBeVisible();
  await expect(live(page)).toHaveText('Password copied.');
  expect(await live(page).textContent()).not.toContain(pw);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(pw);
});

test('a failed Copy keeps the password selectable and guides the user', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await generate(page);
  const pw = await readOutput(page);
  await copyBtn(page).click();
  await expect(page.locator('[data-copy-confirm]')).toContainText(/copy/i);
  await expect(output(page)).toHaveValue(pw); // output not cleared
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears the output and strength, disables Copy, restores defaults', async ({ page }) => {
  await generate(page);
  await page.locator('[data-reset]').click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(output(page)).toHaveValue('');
  await expect(copyBtn(page)).toBeDisabled();
  await expect(generateBtn(page)).toHaveText('Generate Password');
  await expect(live(page)).toHaveText('');
});

/* ---- Security: no leakage ---------------------------------------------- */

test('the password never leaks to storage, URL, network or console', async ({ page }) => {
  const requests: string[] = [];
  const logs: string[] = [];
  page.on('request', (r) => requests.push(`${r.url()} ${r.postData() ?? ''}`));
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(ROUTE, { waitUntil: 'networkidle' });
  await generate(page);
  const pw = await readOutput(page);
  expect(pw.length).toBeGreaterThan(0);

  const storage = await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
  expect(storage).not.toContain(pw);
  expect(page.url()).not.toContain(pw);
  expect(requests.some((r) => r.includes(pw))).toBe(false);
  expect(logs.some((l) => l.includes(pw))).toBe(false);

  // The password must not appear in any accessibility attribute or announcement
  // (aria-label / aria-describedby target text / title / live region).
  const a11yText = await page.evaluate(() => {
    const parts: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const label = el.getAttribute('aria-label');
      const title = el.getAttribute('title');
      if (label) parts.push(label);
      if (title) parts.push(title);
      const describedby = el.getAttribute('aria-describedby');
      if (describedby)
        for (const id of describedby.split(/\s+/)) parts.push(document.getElementById(id)?.textContent ?? '');
      if (el.getAttribute('aria-live') || el.getAttribute('role') === 'status') parts.push(el.textContent ?? '');
    }
    return parts.join(' ');
  });
  expect(a11yText).not.toContain(pw);
  // Also confirm the output value stays out of trust/validation copy.
  expect(await page.locator('.pg-trust').textContent()).not.toContain(pw);
});

/* ---- Workspace / responsive / theme ------------------------------------ */

test('desktop first viewport shows settings, Generate and the output location', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(generateBtn(page)).toBeInViewport();
  const top = (await shell(page).boundingBox())!.y;
  expect(top).toBeLessThan(768);
});

test('mobile stacks settings → Generate → output, no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const genY = (await generateBtn(page).boundingBox())!.y;
  const outY = (await shell(page).boundingBox())!.y;
  expect(outY).toBeGreaterThan(genY);
  await generate(page);
  await expect(output(page)).not.toHaveValue('');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await generate(page);
  await expect(output(page)).not.toHaveValue('');
  await expect(page.locator('.pg-strength')).toBeVisible();
});
