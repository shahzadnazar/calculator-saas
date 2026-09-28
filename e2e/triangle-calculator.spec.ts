import { test, expect, type Page } from '@playwright/test';

/**
 * Triangle — one calculator, six fields, any three of them.
 *
 * The reference's own worked case (a = 1, b = 1, C = 60°) is asserted line for line, because it is
 * the only output of this tool we have seen printed. Beyond that the spec covers what makes a solver
 * different from a formula: the five cases, the ambiguous SSA that has two answers, the pi
 * expressions the reference invites in radian mode, and every way of giving it three values it
 * cannot use.
 */
const ROUTE = '/math/triangle-calculator';
const DEBOUNCE = 320;

type Values = Partial<Record<'a' | 'b' | 'c' | 'angleA' | 'angleB' | 'angleC' | 'angleUnit', string>>;
const FIELDS = ['a', 'b', 'c', 'angleA', 'angleB', 'angleC'] as const;

const root = (page: Page) => page.locator('[data-triangle]');
const shell = (page: Page) => root(page).locator('[data-result-state]');
const field = (page: Page, name: string) => root(page).locator(`[name="${name}"]`);
const errorFor = (page: Page, name: string) => root(page).locator(`[data-error-for="${name}"]`);
const kinds = (page: Page) => root(page).locator('.tri-kind');
const lines = (page: Page) => root(page).locator('.tri-line');
const solutions = (page: Page) => root(page).locator('.tri-solution');
const figures = (page: Page) => root(page).locator('.tri-figure');
const submit = (page: Page) => root(page).getByRole('button', { name: 'Calculate Triangle' });
const clear = (page: Page) => root(page).getByRole('button', { name: 'Clear' });

async function calc(page: Page, v: Values) {
  for (const name of FIELDS) await field(page, name).fill(v[name] ?? '');
  await field(page, 'angleUnit').selectOption(v.angleUnit ?? 'deg');
  await submit(page).click();
}

/** Every printed line, whitespace collapsed, for exact comparison. */
const allLines = (page: Page) =>
  lines(page).evaluateAll((els) => els.map((e) => e.textContent!.replace(/\s+/g, ' ').trim()));

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

test.describe('the form', () => {
  test('offers six fields around a diagram, all empty, with degrees selected', async ({ page }) => {
    for (const name of FIELDS) await expect(field(page, name)).toHaveValue('');
    await expect(field(page, 'angleUnit')).toHaveValue('deg');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(root(page).locator('.tri-diagram')).toBeVisible();
  });

  test('labels every field so the shape is not the only cue', async ({ page }) => {
    const unlabelled = await page.$$eval('[data-triangle] input, [data-triangle] select', (els) =>
      els
        .filter((e) => !e.getAttribute('aria-label') && !document.querySelector(`label[for="${e.id}"]`))
        .map((e) => (e as HTMLInputElement).name),
    );
    expect(unlabelled).toEqual([]);
  });
});

test.describe("the reference's own worked case", () => {
  test('a = 1, b = 1, C = 60° prints every line the reference prints', async ({ page }) => {
    await calc(page, { a: '1', b: '1', angleC: '60' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(kinds(page)).toHaveText(['Equilateral Triangle']);

    const printed = await allLines(page);
    for (const want of [
      'Side a = 1',
      'Side b = 1',
      'Side c = 1',
      'Angle ∠A = 60° = 1.0472 rad = π/3',
      'Angle ∠B = 60° = 1.0472 rad = π/3',
      'Angle ∠C = 60° = 1.0472 rad = π/3',
      'Area = 0.43301',
      'Perimeter p = 3',
      'Semiperimeter s = 1.5',
      'Height ha = 0.86603',
      'Height hb = 0.86603',
      'Height hc = 0.86603',
      'Median ma = 0.86603',
      'Median mb = 0.86603',
      'Median mc = 0.86603',
      'Inradius r = 0.28868',
      'Circumradius R = 0.57735',
      'Vertex coordinates = A[0, 0] B[1, 0] C[0.5, 0.86603]',
      'Centroid = [0.5, 0.28868]',
      'Inscribed circle center = [0.5, 0.28868]',
      'Circumscribed circle center = [0.5, 0.28868]',
    ]) {
      expect(printed).toContain(want);
    }
  });

  test('draws the solved triangle', async ({ page }) => {
    await calc(page, { a: '1', b: '1', angleC: '60' });
    await expect(figures(page)).toHaveCount(1);
  });
});

test.describe('the five cases', () => {
  test('SSS solves the 3-4-5 right triangle', async ({ page }) => {
    await calc(page, { a: '3', b: '4', c: '5' });
    await expect(kinds(page)).toHaveText(['Right Scalene Triangle']);
    expect(await allLines(page)).toContain('Area = 6');
    expect(await allLines(page)).toContain('Angle ∠C = 90° = 1.5708 rad = π/2');
  });

  test('SAS solves from two sides and the angle between them', async ({ page }) => {
    // Sides 3 and 4 with a right angle between them is the same 3-4-5 triangle.
    await calc(page, { a: '3', b: '4', angleC: '90' });
    await expect(kinds(page)).toHaveText(['Right Scalene Triangle']);
    expect(await allLines(page)).toContain('Side c = 5');
    expect(await allLines(page)).toContain('Area = 6');
  });

  test('ASA solves from one side and the two angles beside it', async ({ page }) => {
    await calc(page, { c: '5', angleA: '36.87', angleB: '53.13' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(kinds(page)).toHaveText(['Right Scalene Triangle']);
  });

  test('AAS solves from one side and two angles including its own', async ({ page }) => {
    await calc(page, { a: '3', angleA: '36.87', angleB: '53.13' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    const printed = await allLines(page);
    expect(printed.some((l) => l.startsWith('Side c = 4.999') || l === 'Side c = 5')).toBe(true);
  });
});

test.describe('SSA, the ambiguous case', () => {
  test('shows BOTH triangles and says why there are two', async ({ page }) => {
    await calc(page, { a: '5', b: '8', angleA: '30' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(solutions(page)).toHaveCount(2);
    await expect(figures(page)).toHaveCount(2);
    await expect(root(page).locator('.tri-ambiguous')).toContainText('two different triangles');
    await expect(root(page).locator('.tri-solution__index')).toHaveText([
      'First triangle',
      'Second triangle',
    ]);
  });

  test('the two really are different triangles', async ({ page }) => {
    await calc(page, { a: '5', b: '8', angleA: '30' });
    const areas = (await allLines(page)).filter((l) => l.startsWith('Area ='));
    expect(areas).toHaveLength(2);
    expect(areas[0]).not.toBe(areas[1]);
  });

  test('shows ONE triangle when only one is possible', async ({ page }) => {
    await calc(page, { a: '9', b: '8', angleA: '30' });
    await expect(solutions(page)).toHaveCount(1);
    await expect(root(page).locator('.tri-ambiguous')).toHaveCount(0);
  });

  test('reports none when the side cannot reach', async ({ page }) => {
    await calc(page, { a: '2', b: '8', angleA: '30' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });
});

test.describe('radians', () => {
  test('accepts a pi expression, as the reference invites', async ({ page }) => {
    await calc(page, { a: '1', b: '1', angleC: 'pi/3', angleUnit: 'rad' });
    await expect(kinds(page)).toHaveText(['Equilateral Triangle']);
    expect(await allLines(page)).toContain('Area = 0.43301');
  });

  test('accepts a plain radian value', async ({ page }) => {
    await calc(page, { a: '1', b: '1', angleC: '1.0471975512', angleUnit: 'rad' });
    await expect(kinds(page)).toHaveText(['Equilateral Triangle']);
  });

  test('refuses an expression it cannot read rather than evaluating it', async ({ page }) => {
    await calc(page, { a: '1', b: '1', angleC: '2*pi/3', angleUnit: 'rad' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(errorFor(page, 'angleC')).toBeVisible();
  });

  test('switches the suffix beside each angle field', async ({ page }) => {
    await expect(root(page).locator('[data-tri-angle-suffix]').first()).toHaveText('°');
    await field(page, 'angleUnit').selectOption('rad');
    await expect(root(page).locator('[data-tri-angle-suffix]').first()).toHaveText('rad');
  });
});

test.describe('validation', () => {
  test('asks for exactly three values', async ({ page }) => {
    await calc(page, { a: '3', b: '4' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(root(page).locator('[data-result-when~="invalid"]')).toContainText(
      'exactly three values',
    );
  });

  test('asks for at least one side', async ({ page }) => {
    await calc(page, { angleA: '60', angleB: '60', angleC: '60' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(root(page).locator('[data-result-when~="invalid"]')).toContainText(
      'at least one side',
    );
  });

  test('rejects three sides that cannot meet', async ({ page }) => {
    await calc(page, { a: '1', b: '2', c: '10' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(root(page).locator('[data-result-when~="invalid"]')).toContainText(
      'No triangle has those measurements',
    );
  });

  test('rejects angles that cannot fit', async ({ page }) => {
    await calc(page, { a: '5', angleA: '120', angleB: '70' });
    await expect(root(page).locator('[data-result-when~="invalid"]')).toContainText(
      'less than 180',
    );
  });

  test('rejects a zero or negative side with a field error', async ({ page }) => {
    await calc(page, { a: '0', b: '4', c: '5' });
    await expect(errorFor(page, 'a')).toHaveText('Enter a length greater than zero.');
  });

  test('rejects an angle outside a triangle with a field error', async ({ page }) => {
    await calc(page, { a: '3', b: '4', angleC: '200' });
    await expect(errorFor(page, 'angleC')).toBeVisible();
  });

  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    for (const v of [{}, { a: '3', b: '4' }, { a: '1', b: '2', c: '10' }, { a: '0', b: '1', c: '1' }]) {
      await calc(page, v);
      await expect(root(page)).not.toContainText(/NaN|Infinity|undefined/);
    }
  });
});

test.describe('recalculation and clear', () => {
  test('does not calculate before the primary action, then updates live', async ({ page }) => {
    await expect(root(page).locator('[data-live-note]')).toBeHidden();
    await field(page, 'a').fill('3');
    await field(page, 'b').fill('4');
    await field(page, 'c').fill('5');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).not.toHaveAttribute('data-result-state', 'valid');

    await submit(page).click();
    await expect(kinds(page)).toHaveText(['Right Scalene Triangle']);
    await expect(root(page).locator('[data-live-note]')).toBeVisible();

    await field(page, 'c').fill('6');
    await expect(kinds(page)).toHaveText(['Obtuse Scalene Triangle']);
  });

  test('Clear empties every field and restores degrees', async ({ page }) => {
    await calc(page, { a: '1', b: '1', angleC: 'pi/3', angleUnit: 'rad' });
    await clear(page).click();
    for (const name of FIELDS) await expect(field(page, name)).toHaveValue('');
    await expect(field(page, 'angleUnit')).toHaveValue('deg');
    await expect(root(page).locator('[data-tri-angle-suffix]').first()).toHaveText('°');
  });
});

test.describe('accessibility', () => {
  test('has one live region and no duplicate ids', async ({ page }) => {
    await expect(root(page).locator('[aria-live]')).toHaveCount(1);
    const duplicates = await page.evaluate(() => {
      const seen = new Set<string>();
      const dup: string[] = [];
      document.querySelectorAll('[id]').forEach((el) => {
        if (seen.has(el.id)) dup.push(el.id);
        seen.add(el.id);
      });
      return dup;
    });
    expect(duplicates).toEqual([]);
  });

  test('associates each error with its field', async ({ page }) => {
    await calc(page, { a: '0', b: '4', c: '5' });
    const described = await field(page, 'a').getAttribute('aria-describedby');
    const errorId = await errorFor(page, 'a').getAttribute('id');
    expect(described?.split(/\s+/)).toContain(errorId);
  });

  test('is operable by keyboard alone', async ({ page }) => {
    await field(page, 'a').focus();
    await page.keyboard.type('3');
    await field(page, 'b').fill('4');
    await field(page, 'c').fill('5');
    await submit(page).press('Enter');
    await expect(kinds(page)).toHaveText(['Right Scalene Triangle']);
  });

  test('does not overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await calc(page, { a: '3', b: '4', c: '5' });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
