import { test, expect, type Page } from '@playwright/test';

/**
 * GPA — the reference's TWO calculators on one page: the GPA Calculator over a table of courses,
 * and the GPA Planning Calculator over four plain numbers. They keep their own fields, button and
 * result; neither is a mode of the other.
 *
 * The figures asserted here are the reference's own worked example: Math 3 credits at A, English 3
 * at B+, History 2 at A-, giving 8 credits and a GPA of 3.663; and a current GPA of 3.663 over 8
 * credits with a target of 3 over 15 more, needing 2.646.
 */
const ROUTE = '/everyday/gpa-calculator';

const gpa = (page: Page) => page.locator('[data-gpa]');
const plan = (page: Page) => page.locator('[data-gpa-plan]');
const shell = (page: Page) => page.locator('#gpa-result');
const planShell = (page: Page) => page.locator('#gpa-plan-result');
const rows = (page: Page) => page.locator('[data-gpa-row]');
const submit = (page: Page) => page.locator('[data-gpa-submit]');
const planSubmit = (page: Page) => page.locator('[data-plan-submit]');
const value = (page: Page) => page.locator('#gpa-result [data-result-value]');
const sentence = (page: Page) => page.locator('[data-plan-sentence]');

const COURSES: [string, string, string][] = [
  ['Math', '3', 'A'],
  ['English', '3', 'B+'],
  ['History', '2', 'A-'],
];

async function fillRow(page: Page, index: number, [name, credits, grade]: [string, string, string]) {
  const row = rows(page).nth(index);
  await row.locator('[data-gpa-name]').fill(name);
  await row.locator('[data-gpa-credits]').fill(credits);
  await row.locator('[data-gpa-grade]').selectOption(grade);
}

async function calculate(page: Page, courses = COURSES) {
  for (let i = 0; i < courses.length; i += 1) await fillRow(page, i, courses[i]);
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
}

async function calculatePlan(page: Page, values: Record<string, string>) {
  for (const [name, v] of Object.entries(values)) await plan(page).locator(`[name="${name}"]`).fill(v);
  await planSubmit(page).click();
}

const reportRows = (page: Page) =>
  page.locator('[data-gpa-breakdown] tr').evaluateAll((trs) =>
    trs.map((tr) => Array.from(tr.children).map((c) => (c.textContent ?? '').trim())),
  );

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Two separate calculators ------------------------------------------- */

test('offers both calculators, each with its own form, button and result', async ({ page }) => {
  await expect(gpa(page)).toHaveCount(1);
  await expect(plan(page)).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'GPA Calculator', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'GPA Planning Calculator', level: 2 })).toBeVisible();
  await expect(submit(page)).toHaveText('Calculate');
  await expect(planSubmit(page)).toHaveText('Calculate');
  await expect(page.locator('[data-reset]')).toHaveCount(2);
});

test('loads task-first: five blank rows, empty fields, no result in either', async ({ page }) => {
  await expect(rows(page)).toHaveCount(5);
  const values = await rows(page).locator('input').evaluateAll((els) =>
    (els as HTMLInputElement[]).map((e) => e.value),
  );
  expect(values.every((v) => v === '')).toBe(true);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(planShell(page)).toHaveAttribute('data-result-state', 'example');
});

test('calculating one leaves the other untouched', async ({ page }) => {
  await calculate(page);
  await expect(planShell(page)).toHaveAttribute('data-result-state', 'example');
});

/* ---- The grade scale ----------------------------------------------------- */

test('offers the reference grade scale, ignored grades included', async ({ page }) => {
  const options = await rows(page).first().locator('[data-gpa-grade] option').allTextContents();
  expect(options).toEqual([
    '-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'P', 'NP', 'I', 'W',
  ]);
});

/* ---- The reference result ------------------------------------------------ */

test('reproduces the reference GPA report', async ({ page }) => {
  await calculate(page);
  await expect(value(page)).toHaveText('3.663');
  await expect(page.locator('[data-gpa-total-credits]')).toHaveText('8');
  expect(await reportRows(page)).toEqual([
    ['Math', '3', 'A', '3×4 = 12'],
    ['English', '3', 'B+', '3×3.3 = 9.9'],
    ['History', '2', 'A-', '2×3.7 = 7.4'],
  ]);
  await expect(page.locator('[data-gpa-total-credits-row]')).toHaveText('8');
  await expect(page.locator('[data-gpa-overall]')).toHaveText('3.663');
  await expect(page.locator('#gpa-live')).toHaveText('GPA: 3.663 across 8 credits.');
});

test('a P, NP, I or W is left out of both the credits and the average', async ({ page }) => {
  await calculate(page);
  await fillRow(page, 3, ['Yoga', '4', 'W']);
  await expect(page.locator('[data-gpa-breakdown] tr')).toHaveCount(4); // the live update landed
  await expect(value(page)).toHaveText('3.663'); // unchanged
  await expect(page.locator('[data-gpa-total-credits]')).toHaveText('8'); // not 12
  expect((await reportRows(page))[3]).toEqual(['Yoga', '4', 'W', 'not counted']);
});

test('an F is scored as zero, which is not the same as ignoring it', async ({ page }) => {
  await calculate(page, [
    ['Math', '3', 'A'],
    ['Physics', '3', 'F'],
  ]);
  await expect(value(page)).toHaveText('2');
  await expect(page.locator('[data-gpa-total-credits]')).toHaveText('6');
});

test('an A+ counts above 4', async ({ page }) => {
  await calculate(page, [['Math', '3', 'A+']]);
  await expect(value(page)).toHaveText('4.3');
});

/* ---- Rows ---------------------------------------------------------------- */

test('add more courses appends a row and keeps the result live', async ({ page }) => {
  await calculate(page);
  await page.locator('[data-gpa-add]').click();
  await expect(rows(page)).toHaveCount(6);
  await expect(value(page)).toHaveText('3.663');
  await rows(page).last().locator('[data-gpa-remove]').click();
  await expect(rows(page)).toHaveCount(5);
});

test('removing a course recalculates without it', async ({ page }) => {
  await calculate(page);
  await rows(page).nth(2).locator('[data-gpa-remove]').click();
  await expect(value(page)).toHaveText('3.65'); // (12 + 9.9) / 6
  await expect(page.locator('[data-gpa-total-credits]')).toHaveText('6');
});

test('the last remaining row cannot be removed', async ({ page }) => {
  for (let i = 0; i < 4; i += 1) await rows(page).last().locator('[data-gpa-remove]').click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator('[data-gpa-remove]')).toBeDisabled();
});

/* ---- Validation ---------------------------------------------------------- */

test('a blank row is not an error, but a half-filled one is', async ({ page }) => {
  await calculate(page); // two blank rows remain, and it is valid
  await rows(page).nth(3).locator('[data-gpa-credits]').fill('4');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(rows(page).nth(3).locator('[data-error-for^="grade-"]')).toBeVisible();
});

test('an empty submission asks for at least one course', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(shell(page)).toContainText('at least one course');
});

test('a set of only ignored grades says so rather than showing no GPA', async ({ page }) => {
  await fillRow(page, 0, ['Yoga', '2', 'P']);
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(shell(page)).toContainText('not scored');
});

test('a zero-credit course is allowed alongside a graded one, and moves nothing', async ({ page }) => {
  await calculate(page, [
    ['Math', '3', 'A'],
    ['Audit', '0', 'F'],
  ]);
  await expect(value(page)).toHaveText('4');
  await expect(page.locator('[data-gpa-total-credits]')).toHaveText('3');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

test('graded courses carrying no credit at all are refused, and not called "not scored"', async ({ page }) => {
  await fillRow(page, 0, ['Audit', '0', 'F']);
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(shell(page)).toContainText('greater than zero');
  await expect(shell(page)).not.toContainText('not scored');
});

test('Clear empties the rows and returns to the opening set', async ({ page }) => {
  await calculate(page);
  await gpa(page).locator('[data-reset]').click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(rows(page)).toHaveCount(5);
  const values = await rows(page).locator('input').evaluateAll((els) =>
    (els as HTMLInputElement[]).map((e) => e.value),
  );
  expect(values.every((v) => v === '')).toBe(true);
});

/* ---- The planning calculator --------------------------------------------- */

test('reproduces the reference planning sentence', async ({ page }) => {
  await calculatePlan(page, { currentGpa: '3.663', targetGpa: '3', currentCredits: '8', additionalCredits: '15' });
  await expect(planShell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(sentence(page)).toHaveText(
    'To achieve a target GPA of 3, the GPA for the next 15 credits needs to be 2.646 or higher.',
  );
  await expect(page.locator('#gpa-plan-live')).toContainText('2.646');
});

test('says when a target is already met, and when it is out of reach', async ({ page }) => {
  await calculatePlan(page, { currentGpa: '4', targetGpa: '2', currentCredits: '30', additionalCredits: '15' });
  await expect(sentence(page)).toContainText('already met');
  await expect(sentence(page)).toHaveAttribute('data-plan-state', 'met');

  await calculatePlan(page, { currentGpa: '1', targetGpa: '4', currentCredits: '60', additionalCredits: '3' });
  await expect(sentence(page)).toContainText('out of reach');
  await expect(sentence(page)).toContainText('4.3'); // names the ceiling it exceeds
  await expect(sentence(page)).toHaveAttribute('data-plan-state', 'unreachable');
});

test('holds a planning GPA to the scale and needs more than zero additional credits', async ({ page }) => {
  await calculatePlan(page, { currentGpa: '3', targetGpa: '9', currentCredits: '8', additionalCredits: '15' });
  await expect(planShell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(plan(page).locator('[data-error-for="targetGpa"]')).toHaveText('Enter a GPA between 0 and 4.3.');

  await calculatePlan(page, { targetGpa: '3', additionalCredits: '0' });
  await expect(plan(page).locator('[data-error-for="additionalCredits"]')).toBeVisible();
});

test('Clear empties the planning fields', async ({ page }) => {
  await calculatePlan(page, { currentGpa: '3.663', targetGpa: '3', currentCredits: '8', additionalCredits: '15' });
  await plan(page).locator('[data-reset]').click();
  await expect(planShell(page)).toHaveAttribute('data-result-state', 'empty');
  const values = await plan(page).locator('input').evaluateAll((els) =>
    (els as HTMLInputElement[]).map((e) => e.value),
  );
  expect(values.every((v) => v === '')).toBe(true);
});

/* ---- Workspace / responsive ---------------------------------------------- */

test('desktop first viewport shows H1, the course table and its action', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(submit(page)).toBeInViewport();
});

test('mobile keeps the rows tappable and does not scroll the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const box = await rows(page).first().locator('[data-gpa-credits]').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await calculate(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('each calculator has exactly one live region', async ({ page }) => {
  await expect(page.locator('[aria-live]')).toHaveCount(2);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
