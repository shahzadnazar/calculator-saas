import { test, expect, type Page } from '@playwright/test';

/**
 * GPA calculator — R16B1 task-first migration (Academic family pilot, 1 of 2). Wraps the UNCHANGED
 * calculateGPA / GRADE_POINTS via its OWN gpa-form.ts binding; the dynamic course rows are entirely
 * island-owned (built via the DOM API, per-row error slots, add/remove dispatching `input`). Task-first:
 * one blank row, "Calculate GPA" for the first result, live-after-first. Grades are letters mapped to
 * points; a valid 0.0 (all F with credits) and a valid 4.0 (all A) both render. The complete-result
 * guard lives in resultValue (NaN sentinel — NO isUsableResult; a finite 0 the default gate accepts).
 */
const ROUTE = '/everyday/gpa-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#gpa-result');
const primary = (page: Page) => page.locator('#gpa-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#gpa-result [data-result-summary-label]');
const creditsTotal = (page: Page) => page.locator('[data-gpa-credits-total]');
const interpretation = (page: Page) => page.locator('[data-gpa-interpretation]');
const live = (page: Page) => page.locator('#gpa-live');
const submit = (page: Page) => page.locator('[data-gpa-submit]');
const addBtn = (page: Page) => page.locator('[data-gpa-add]');
const rows = (page: Page) => page.locator('[data-gpa-row]');
const region = (page: Page, when: string) => page.locator(`#gpa-result [data-result-when~="${when}"]`);
const invalidMsg = (page: Page) => page.locator('#gpa-result [data-result-invalid-message]');

const rowAt = (page: Page, i: number) => rows(page).nth(i);
const setRow = async (page: Page, i: number, grade: string, credits: string) => {
  await rowAt(page, i).locator('[data-gpa-grade]').selectOption(grade);
  await rowAt(page, i).locator('[data-gpa-credits]').fill(credits);
};
/** Grow to `courses.length` rows (the page starts with one), then fill each. */
const fillCourses = async (page: Page, courses: Array<[string, string]>) => {
  for (let k = 1; k < courses.length; k++) await addBtn(page).click();
  for (let i = 0; i < courses.length; i++) await setRow(page, i, courses[i][0], courses[i][1]);
};

test.describe('gpa: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads with one blank course row, empty result, "Calculate GPA", remove disabled', async ({ page }) => {
    await expect(rows(page)).toHaveCount(1);
    await expect(rowAt(page, 0).locator('[data-gpa-grade]')).toHaveValue('');
    await expect(rowAt(page, 0).locator('[data-gpa-credits]')).toHaveValue('');
    await expect(submit(page)).toHaveText('Calculate GPA');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(live(page)).toHaveText('');
    await expect(rowAt(page, 0).locator('[data-gpa-remove]')).toBeDisabled(); // one row can't be removed
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await setRow(page, 0, 'A', '3');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('Add Course / Remove Course grow and shrink the row set (min one row)', async ({ page }) => {
    await addBtn(page).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(rowAt(page, 0).locator('[data-gpa-remove]')).toBeEnabled();
    await rowAt(page, 1).locator('[data-gpa-remove]').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rowAt(page, 0).locator('[data-gpa-remove]')).toBeDisabled();
  });

  test('ordinary valid GPA: dominant GPA + total credits + interpretation + announcement', async ({ page }) => {
    await fillCourses(page, [['A', '3'], ['B', '4'], ['A-', '3']]);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('GPA');
    await expect(primary(page)).toHaveText('3.51'); // (12+12+11.1)/10
    await expect(creditsTotal(page)).toHaveText('10');
    await expect(interpretation(page)).toContainText('3 courses');
    await expect(live(page)).toHaveText('GPA: 3.51 across 10 credit hours.');
    const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const metricSize = await creditsTotal(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(primarySize).toBeGreaterThan(metricSize * 1.5);
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('a valid 0.0 GPA (all F with credits) renders as a result, not an error', async ({ page }) => {
    await setRow(page, 0, 'F', '3');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0.00');
    await expect(creditsTotal(page)).toHaveText('3');
    await expect(live(page)).toHaveText('GPA: 0.00 across 3 credit hours.');
  });

  test('a valid maximum 4.0 GPA renders', async ({ page }) => {
    await setRow(page, 0, 'A', '3');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('4.00');
  });

  /* ---- validation ---- */

  test('a partially completed row (grade set, credits blank) is a row credits error with focus', async ({ page }) => {
    await rowAt(page, 0).locator('[data-gpa-grade]').selectOption('A');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(rowAt(page, 0).locator('[data-error-for^="credits-"]')).toHaveText('Enter credit hours for this course.');
    await expect(rowAt(page, 0).locator('[data-gpa-credits]')).toBeFocused();
  });

  test('an unsupported/blank-grade partial row is a row grade error', async ({ page }) => {
    await rowAt(page, 0).locator('[data-gpa-credits]').fill('3'); // credits but no grade
    await submit(page).click();
    await expect(rowAt(page, 0).locator('[data-error-for^="grade-"]')).toHaveText('Select a grade for this course.');
  });

  test('negative credits are a row credits error', async ({ page }) => {
    await setRow(page, 0, 'A', '-1');
    await submit(page).click();
    await expect(rowAt(page, 0).locator('[data-error-for^="credits-"]')).toHaveText('Enter credit hours of zero or more.');
  });

  test('an all-empty form is a form-level error and focuses the first grade', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(invalidMsg(page)).toHaveText('Add at least one course with a grade and credit hours greater than zero.');
    await expect(rowAt(page, 0).locator('[data-gpa-grade]')).toBeFocused();
  });

  /* ---- live update / add / remove / invalidate / reset ---- */

  test('after the first result, editing a credit recalculates live without moving focus', async ({ page }) => {
    await setRow(page, 0, 'A', '3');
    await submit(page).click();
    await expect(primary(page)).toHaveText('4.00');
    await rowAt(page, 0).locator('[data-gpa-credits]').fill('3'); // unchanged grade
    await addBtn(page).click();
    await setRow(page, 1, 'C', '3'); // add a C, 3 credits
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('3.00'); // (4·3 + 2·3)/6
    await expect(creditsTotal(page)).toHaveText('6');
  });

  test('removing a row after the first result recalculates', async ({ page }) => {
    await fillCourses(page, [['A', '3'], ['F', '3']]);
    await submit(page).click();
    await expect(primary(page)).toHaveText('2.00'); // (12+0)/6
    await rowAt(page, 1).locator('[data-gpa-remove]').click();
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('4.00'); // just the A now
    await expect(creditsTotal(page)).toHaveText('3');
  });

  test('an invalid live edit clears the stale result, keeping focus', async ({ page }) => {
    await setRow(page, 0, 'A', '3');
    await submit(page).click();
    await expect(region(page, 'valid')).toBeVisible();
    await rowAt(page, 0).locator('[data-gpa-credits]').fill(''); // now partial
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(rowAt(page, 0).locator('[data-gpa-credits]')).toBeFocused();
  });

  test('reset collapses to one blank row, empties result + announcement', async ({ page }) => {
    await fillCourses(page, [['A', '3'], ['B', '4']]);
    await submit(page).click();
    await expect(primary(page)).not.toHaveText('—');
    await page.click('[data-reset]');
    await expect(rows(page)).toHaveCount(1);
    await expect(rowAt(page, 0).locator('[data-gpa-grade]')).toHaveValue('');
    await expect(rowAt(page, 0).locator('[data-gpa-credits]')).toHaveValue('');
    await expect(rowAt(page, 0).locator('[data-gpa-remove]')).toBeDisabled();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from a credit field', async ({ page }) => {
    await rowAt(page, 0).locator('[data-gpa-grade]').selectOption('A');
    await rowAt(page, 0).locator('[data-gpa-credits]').fill('3');
    await rowAt(page, 0).locator('[data-gpa-credits]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('4.00');
  });

  test('desktop shows the dominant GPA within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await setRow(page, 0, 'A', '3');
    await submit(page).click();
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await fillCourses(page, [['A', '3'], ['B', '4']]);
    await submit(page).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setRow(page, 0, 'A', '3');
    await submit(page).click();
    await expect(primary(page)).toBeVisible();
  });

  test('the generated embed mounts the same island and computes', async ({ page }) => {
    await page.goto('/embed/everyday/gpa-calculator', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-gpa-row]')).toHaveCount(1);
    await page.locator('[data-gpa-row]').nth(0).locator('[data-gpa-grade]').selectOption('A');
    await page.locator('[data-gpa-row]').nth(0).locator('[data-gpa-credits]').fill('4');
    await page.locator('[data-gpa-submit]').click();
    await expect(page.locator('#gpa-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#gpa-result [data-result-value]')).toHaveText('4.00');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});
