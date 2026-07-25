import { test, expect, type Page } from '@playwright/test';

/**
 * Permanent interaction coverage for the physical calculator.
 *
 * Targets the internal demo route while the system is built in isolation; at
 * live integration these tests repoint to the real calculator page(s). The demo
 * renders three instances: #demo-a (Basic, mode switch), #demo-b (Scientific,
 * fixed), #demo-c (compact) — used for multi-instance keyboard isolation.
 */
const ROUTE = '/dev/physical-calculator';

const bkey = (page: Page, inst: string, aria: string) =>
  page.locator(`#${inst} .keypad--basic button[aria-label="${aria}"]`).first();
const fkey = (page: Page, inst: string, aria: string) =>
  page.locator(`#${inst} button[aria-label="${aria}"]`).first();
const mainText = (page: Page, inst = 'demo-a') => page.locator(`#${inst} [data-calc-main]`).textContent();
const subText = (page: Page, inst = 'demo-a') => page.locator(`#${inst} [data-calc-sub]`).textContent();
const liveText = (page: Page, inst = 'demo-a') => page.locator(`#${inst} [data-calc-live]`).textContent();
async function tap(page: Page, inst: string, arias: string[]) {
  for (const a of arias) await bkey(page, inst, a).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

// NOTE: basic keypad calculation, hardware keyboard, reciprocal and
// division-by-zero recovery are exercised on the live route in
// scientific-page.spec.ts. This file keeps only behaviors that need Basic mode,
// the mode switch, or multiple instances — not available on the live page yet.

test('contextual percentage (basic mode)', async ({ page }) => {
  await tap(page, 'demo-a', ['2', '0', '0', 'add', '1', '0', 'percent', 'equals']);
  expect((await mainText(page))?.trim()).toBe('220');
});

test('repeated equals', async ({ page }) => {
  await tap(page, 'demo-a', ['5', 'add', '2', 'equals']);
  expect((await mainText(page))?.trim()).toBe('7');
  await bkey(page, 'demo-a', 'equals').click();
  expect((await mainText(page))?.trim()).toBe('9');
  await bkey(page, 'demo-a', 'equals').click();
  expect((await mainText(page))?.trim()).toBe('11');
});

test('operator replacement', async ({ page }) => {
  await tap(page, 'demo-a', ['1', '2', 'add', 'multiply', '3', 'equals']);
  expect((await mainText(page))?.trim()).toBe('36'); // 12 × 3
});

test('decimal restrictions', async ({ page }) => {
  await tap(page, 'demo-a', ['decimal point', '5', 'decimal point', '5']);
  expect((await mainText(page))?.trim()).toBe('0.55'); // ".5" → 0.5, extra dot ignored
  await bkey(page, 'demo-a', 'all clear').click();
  await tap(page, 'demo-a', ['0', '0', '7']);
  expect((await mainText(page))?.trim()).toBe('7'); // no uncontrolled leading zeros
});

test('basic/scientific switching keeps the basic keypad present', async ({ page }) => {
  await expect(page.locator('#demo-a .sci-panel')).toBeHidden();
  await page.locator('#demo-a [data-mode-switch] button[data-mode="scientific"]').click();
  await expect(page.locator('#demo-a .sci-panel')).toBeVisible();
  await expect(page.locator('#demo-a .keypad--basic')).toBeVisible(); // shared, still there
  await expect(page.locator('#demo-a [data-angle-switch]')).toBeVisible();
});

test('expression, Ans and angle preservation across mode switch', async ({ page }) => {
  // Expression preserved.
  await tap(page, 'demo-a', ['1', '2', 'add', '3']);
  await page.locator('#demo-a [data-mode-switch] button[data-mode="scientific"]').click();
  expect((await subText(page))?.trim()).toBe('12 +');
  await bkey(page, 'demo-a', 'equals').click();
  expect((await mainText(page))?.trim()).toBe('15');
  // Ans preserved (6 + 2 = 8, recall after toggling modes).
  await bkey(page, 'demo-a', 'all clear').click();
  await tap(page, 'demo-a', ['6', 'add', '2', 'equals']);
  // Angle: set Rad, toggle to Basic and back — must stay Rad.
  await page.locator('#demo-a [data-angle-switch] button[data-angle="rad"]').click();
  await page.locator('#demo-a [data-mode-switch] button[data-mode="basic"]').click();
  await page.locator('#demo-a [data-mode-switch] button[data-mode="scientific"]').click();
  await expect(page.locator('#demo-a [data-angle-switch] button[data-angle="rad"]')).toHaveAttribute('aria-checked', 'true');
  await bkey(page, 'demo-a', 'all clear').click();
  await fkey(page, 'demo-a', 'Previous answer').click(); // Ans
  expect((await mainText(page))?.trim()).toBe('8');
});

test('basic left-to-right vs scientific operator precedence', async ({ page }) => {
  await tap(page, 'demo-a', ['2', 'add', '3', 'multiply', '4', 'equals']);
  expect((await mainText(page))?.trim()).toBe('20'); // (2+3)*4 left-to-right
  await bkey(page, 'demo-a', 'all clear').click();
  await page.locator('#demo-a [data-mode-switch] button[data-mode="scientific"]').click();
  await tap(page, 'demo-a', ['2', 'add', '3', 'multiply', '4', 'equals']);
  expect((await mainText(page))?.trim()).toBe('14'); // precedence
});

test('multiple-instance keyboard isolation', async ({ page }) => {
  await page.locator('#demo-a [data-calc-display]').click(); // demo-a active
  await page.keyboard.press('5');
  expect((await mainText(page, 'demo-a'))?.trim()).toBe('5');
  expect((await mainText(page, 'demo-c'))?.trim()).toBe('0'); // other instance untouched
  await page.locator('#demo-c [data-calc-display]').click(); // demo-c active
  await page.keyboard.press('7');
  expect((await mainText(page, 'demo-c'))?.trim()).toBe('7');
  expect((await mainText(page, 'demo-a'))?.trim()).toBe('5'); // demo-a unchanged
});

test('typing in another form field does not reach the calculator', async ({ page }) => {
  // A search box outside the calculator must keep the keystrokes.
  await page.locator('#demo-a [data-calc-display]').click();
  await page.evaluate(() => {
    const i = document.createElement('input');
    i.id = 'outside-field';
    document.body.appendChild(i);
    i.focus();
  });
  await page.locator('#outside-field').type('123');
  expect((await mainText(page, 'demo-a'))?.trim()).toBe('0'); // calc ignored the typing
  await expect(page.locator('#outside-field')).toHaveValue('123');
});

test('display states never duplicate the secondary and main', async ({ page }) => {
  expect((await subText(page))?.trim()).toBe(''); // fresh
  expect((await mainText(page))?.trim()).toBe('0');
  await tap(page, 'demo-a', ['5', '6']); // entry
  expect((await subText(page))?.trim()).toBe('');
  expect((await mainText(page))?.trim()).toBe('56');
  await bkey(page, 'demo-a', 'add').click(); // pending
  expect((await subText(page))?.trim()).toBe('56 +');
  expect((await mainText(page))?.trim()).toBe('0');
  await tap(page, 'demo-a', ['1', '2', 'equals']); // result
  expect((await subText(page))?.trim()).toBe('56 + 12 =');
  expect((await mainText(page))?.trim()).toBe('68');
  await bkey(page, 'demo-a', 'all clear').click();
  await tap(page, 'demo-a', ['5', 'divide', '0', 'equals']); // error
  expect((await mainText(page))?.trim()).toBe('Cannot divide by zero');
});

test('screen-reader live region only changes after equals or errors', async ({ page }) => {
  expect((await liveText(page))?.trim()).toBe(''); // fresh
  await tap(page, 'demo-a', ['5', 'add', '2']); // entry/operator → still silent
  expect((await liveText(page))?.trim()).toBe('');
  await bkey(page, 'demo-a', 'equals').click(); // result announced
  expect((await liveText(page))?.trim()).toBe('7');
  await bkey(page, 'demo-a', 'all clear').click();
  await tap(page, 'demo-a', ['5', 'divide', '0', 'equals']); // error announced
  expect((await liveText(page))?.trim()).toBe('Cannot divide by zero');
});
