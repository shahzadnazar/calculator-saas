import { test, expect, type Page } from '@playwright/test';

/**
 * Volume — the reference's ELEVEN independent calculators on one page.
 *
 * Written to run over every shape rather than a favourite one, because all eleven share a single
 * binding: a regression in the shared layer would otherwise be caught for the sphere and missed for
 * the other ten.
 *
 * The figures in "the reference's own results" are the values the reference prints for the stated
 * inputs. Three of them pin down rules that are easy to get wrong: the Tube's `22.5π` (the π line
 * appears for any terminating coefficient, not only whole numbers), the Cube's single-line layout,
 * and the Spherical Cap's TWO answers from a pair of radii.
 */
const ROUTE = '/math/volume-calculator';
const DEBOUNCE = 300;

type Shape = { key: string; title: string; dims: (string | null)[]; answer: string };

/** Every shape with the reference's own inputs, in metres, and the figure it prints. */
const SHAPES: Shape[] = [
  { key: 'sphere', title: 'Sphere', dims: ['33'], answer: '150532.55358941' },
  { key: 'cone', title: 'Cone', dims: ['11', '22'], answer: '2787.6398812853' },
  { key: 'cube', title: 'Cube', dims: ['5'], answer: '125' },
  { key: 'cylinder', title: 'Cylinder', dims: ['22', '7'], answer: '10643.715910362' },
  { key: 'rectangular-tank', title: 'Rectangular Tank', dims: ['8', '34', '66'], answer: '17952' },
  { key: 'capsule', title: 'Capsule', dims: ['5', '8'], answer: '1151.9173063163' },
  { key: 'spherical-cap', title: 'Spherical Cap', dims: ['7', '9', null], answer: '276.88296304275' },
  { key: 'conical-frustum', title: 'Conical Frustum', dims: ['2', '4', '5'], answer: '146.60765716752' },
  { key: 'ellipsoid', title: 'Ellipsoid', dims: ['4', '6', '5'], answer: '502.65482457437' },
  { key: 'square-pyramid', title: 'Square Pyramid', dims: ['3', '5'], answer: '15' },
  { key: 'tube', title: 'Tube', dims: ['4', '1', '6'], answer: '70.68583470577' },
];

const box = (page: Page, key: string) => page.locator(`[data-vl-shape="${key}"]`);
const shell = (page: Page, key: string) => box(page, key).locator('[data-result-state]');
const value = (page: Page, key: string) => box(page, key).locator('[data-result-value]');
const finals = (page: Page, key: string) => box(page, key).locator('.vl-step--final');
const steps = (page: Page, key: string) => box(page, key).locator('.vl-steps > *');
const field = (page: Page, key: string, name: string) => box(page, key).locator(`[name="${name}"]`);
const errorFor = (page: Page, key: string, name: string) =>
  box(page, key).locator(`[data-error-for="${name}"]`);
const submit = (page: Page, s: Shape) =>
  box(page, s.key).getByRole('button', { name: `Calculate ${s.title}`, exact: true });
const clear = (page: Page, key: string) => box(page, key).getByRole('button', { name: 'Clear' });

/** Fill a shape's dimensions (a null leaves the field blank), then press its own button. */
async function calc(page: Page, s: Shape, values = s.dims, units?: string[]) {
  const names = await box(page, s.key)
    .locator('[data-field]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.field!));
  for (let i = 0; i < names.length; i += 1) {
    await field(page, s.key, names[i]).fill(values[i] ?? '');
    if (units) await field(page, s.key, `${names[i]}Unit`).selectOption(units[i]);
  }
  await submit(page, s).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

test.describe('the page offers eleven separate calculators', () => {
  test('renders one section per shape, each with its own form, button and result', async ({ page }) => {
    await expect(page.locator('[data-vl-shape]')).toHaveCount(11);
    for (const s of SHAPES) {
      await expect(box(page, s.key).locator('form[data-form]')).toHaveCount(1);
      await expect(shell(page, s.key)).toHaveCount(1);
      await expect(submit(page, s)).toBeVisible();
      await expect(box(page, s.key).getByRole('heading', { name: s.title, exact: true })).toBeVisible();
    }
  });

  test('every shape starts with empty measurements and a labelled example', async ({ page }) => {
    for (const s of SHAPES) {
      await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'example');
      const inputs = box(page, s.key).locator('input[type=number]');
      for (let i = 0; i < (await inputs.count()); i += 1) {
        await expect(inputs.nth(i)).toHaveValue('');
      }
    }
  });

  test('keeps the result inside the same card as the form', async ({ page }) => {
    for (const s of SHAPES) {
      const inside = await box(page, s.key).evaluate((el) => {
        const card = el.querySelector('.card');
        const result = el.querySelector('[data-result-shell]');
        return !!card && !!result && card.contains(result);
      });
      expect(inside).toBe(true);
    }
  });

  test('gives each measurement its own unit control, defaulting to meters', async ({ page }) => {
    for (const s of SHAPES) {
      const selects = box(page, s.key).locator('select');
      const count = await selects.count();
      expect(count).toBe(s.dims.length);
      for (let i = 0; i < count; i += 1) await expect(selects.nth(i)).toHaveValue('m');
    }
  });
});

test.describe("the reference's own results", () => {
  for (const s of SHAPES) {
    test(`${s.title} matches the reference figure`, async ({ page }) => {
      await calc(page, s);
      await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'valid');
      await expect(value(page, s.key)).toHaveText(s.answer);
    });
  }
});

test.describe('the working', () => {
  test('the sphere shows its formula, substitution, pi multiple and answer', async ({ page }) => {
    await calc(page, SHAPES[0]);
    await expect(steps(page, 'sphere')).toHaveText([
      'Volume = 4/3 πr³',
      '= 4/3 × π × 33³',
      '= 47916π',
      '= 150532.55358941 meters³',
    ]);
  });

  test('the cone OMITS the pi line, because its coefficient does not terminate', async ({ page }) => {
    await calc(page, SHAPES[1]);
    await expect(steps(page, 'cone')).toHaveText([
      'Volume = 1/3 πr²h',
      '= 1/3 × π × 11² × 22',
      '= 2787.6398812853 meters³',
    ]);
  });

  test('the tube SHOWS a non-integer pi multiple', async ({ page }) => {
    await calc(page, SHAPES[10]);
    await expect(steps(page, 'tube')).toContainText(['22.5π']);
  });

  test('the cube prints on a single line, and its result value is the number alone', async ({ page }) => {
    await calc(page, SHAPES[2]);
    await expect(steps(page, 'cube')).toHaveText(['Volume = 5³ = 125 meters³']);
    await expect(value(page, 'cube')).toHaveText('125');
  });

  test('every shape ends its working on a figure carrying the cubed unit', async ({ page }) => {
    for (const s of SHAPES) {
      await calc(page, s);
      await expect(finals(page, s.key).last()).toContainText('meters³');
    }
  });
});

test.describe('the spherical cap takes any two values', () => {
  const cap = SHAPES.find((s) => s.key === 'spherical-cap')!;

  test('gives TWO answers from the two radii, and works each through', async ({ page }) => {
    await calc(page, cap, ['7', '9', null]);
    await expect(shell(page, cap.key)).toHaveAttribute('data-result-state', 'valid');
    await expect(steps(page, cap.key).first()).toHaveText('Two possible results:');
    await expect(box(page, cap.key)).toContainText('276.88296304275');
    await expect(box(page, cap.key)).toContainText('2776.7450962465');
    await expect(steps(page, cap.key)).toContainText(['Steps:']);
    await expect(box(page, cap.key)).toContainText('3.3431457505076 or 14.656854249492');
  });

  test('gives ONE answer from a base radius and a height', async ({ page }) => {
    await calc(page, cap, ['7', null, '4']);
    await expect(shell(page, cap.key)).toHaveAttribute('data-result-state', 'valid');
    // R = (7² + 4²) / (2 × 4) = 8.125; V = 1/3 π × 4² × (3 × 8.125 − 4).
    await expect(value(page, cap.key)).toHaveText('341.38640169009');
  });

  test('gives ONE answer from a ball radius and a height', async ({ page }) => {
    await calc(page, cap, [null, '9', '4']);
    await expect(shell(page, cap.key)).toHaveAttribute('data-result-state', 'valid');
    await expect(value(page, cap.key)).toHaveText('385.36869884035');
  });

  test('asks for two values when given only one', async ({ page }) => {
    await calc(page, cap, ['7', null, null]);
    await expect(shell(page, cap.key)).toHaveAttribute('data-result-state', 'invalid');
    await expect(box(page, cap.key).locator('[data-result-when~="invalid"]')).toContainText('any two');
  });

  test('rejects a base wider than the ball it sits on', async ({ page }) => {
    await calc(page, cap, ['10', '9', null]);
    await expect(shell(page, cap.key)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('rejects a cap taller than the ball is wide', async ({ page }) => {
    await calc(page, cap, [null, '9', '19']);
    await expect(shell(page, cap.key)).toHaveAttribute('data-result-state', 'invalid');
  });
});

test.describe('units', () => {
  test('converts each measurement into the first field unit', async ({ page }) => {
    const tank = SHAPES.find((s) => s.key === 'rectangular-tank')!;
    // 1 m by 50 cm by 200 cm is 1 × 0.5 × 2 = 1 m³.
    await calc(page, tank, ['1', '50', '200'], ['m', 'cm', 'cm']);
    await expect(value(page, tank.key)).toHaveText('1');
    await expect(box(page, tank.key).locator('[data-vl-mixed]')).toBeVisible();
  });

  test('reports in the unit of the first field, cubed', async ({ page }) => {
    await calc(page, SHAPES[2], ['5'], ['ft']);
    await expect(finals(page, 'cube')).toContainText('feet³');
  });

  test('says nothing about mixed units when every unit matches', async ({ page }) => {
    await calc(page, SHAPES[2]);
    await expect(box(page, 'cube').locator('[data-vl-mixed]')).toBeHidden();
  });
});

test.describe('validation', () => {
  test('asks for a value before objecting to it, and focuses the first empty field', async ({ page }) => {
    await submit(page, SHAPES[0]).click();
    await expect(shell(page, 'sphere')).toHaveAttribute('data-result-state', 'invalid');
    await expect(errorFor(page, 'sphere', 'd1')).toHaveText('Enter a value.');
    await expect(field(page, 'sphere', 'd1')).toBeFocused();
  });

  test('rejects a zero or negative measurement', async ({ page }) => {
    await calc(page, SHAPES[1], ['0', '5']);
    await expect(errorFor(page, 'cone', 'd1')).toHaveText('Enter a number greater than zero.');
  });

  test('rejects a tube bore that is not smaller than the pipe', async ({ page }) => {
    await calc(page, SHAPES[10], ['4', '5', '6']);
    await expect(shell(page, 'tube')).toHaveAttribute('data-result-state', 'invalid');
    await expect(box(page, 'tube').locator('[data-result-when~="invalid"]')).toContainText(
      'inner diameter',
    );
  });

  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    for (const s of SHAPES) {
      await submit(page, s).click();
      await expect(box(page, s.key)).not.toContainText(/NaN|Infinity|undefined/);
      await calc(page, s, s.dims.map(() => '0'));
      await expect(box(page, s.key)).not.toContainText(/NaN|Infinity|undefined/);
    }
  });
});

test.describe('the eleven stay independent', () => {
  test('calculating one shape leaves the others untouched', async ({ page }) => {
    await calc(page, SHAPES[0]);
    await expect(value(page, 'sphere')).toHaveText('150532.55358941');
    for (const s of SHAPES.slice(1)) {
      await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'example');
    }
    await calc(page, SHAPES[2]);
    await expect(value(page, 'cube')).toHaveText('125');
    await expect(value(page, 'sphere')).toHaveText('150532.55358941');
  });

  test('clearing one shape leaves the others alone', async ({ page }) => {
    await calc(page, SHAPES[0]);
    await calc(page, SHAPES[2]);
    await clear(page, 'sphere').click();
    await expect(field(page, 'sphere', 'd1')).toHaveValue('');
    await expect(value(page, 'cube')).toHaveText('125');
  });
});

test.describe('recalculation and clear', () => {
  test('does not calculate before the primary action, then updates live', async ({ page }) => {
    await expect(box(page, 'cube').locator('[data-live-note]')).toBeHidden();
    await field(page, 'cube', 'd1').fill('3');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page, 'cube')).not.toHaveAttribute('data-result-state', 'valid');

    await submit(page, SHAPES[2]).click();
    await expect(value(page, 'cube')).toHaveText('27');
    await expect(box(page, 'cube').locator('[data-live-note]')).toBeVisible();

    await field(page, 'cube', 'd1').fill('4');
    await expect(value(page, 'cube')).toHaveText('64');
  });

  test('Clear empties every measurement and restores the default unit', async ({ page }) => {
    const tank = SHAPES.find((s) => s.key === 'rectangular-tank')!;
    await calc(page, tank, ['8', '34', '66'], ['ft', 'ft', 'ft']);
    await clear(page, tank.key).click();
    for (const name of ['d1', 'd2', 'd3']) {
      await expect(field(page, tank.key, name)).toHaveValue('');
      await expect(field(page, tank.key, `${name}Unit`)).toHaveValue('m');
    }
  });
});

test.describe('accessibility', () => {
  test('gives each calculator exactly one live region and no duplicate ids', async ({ page }) => {
    await expect(page.locator('[data-vl-shape] [aria-live]')).toHaveCount(11);
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

  test('labels every control', async ({ page }) => {
    const unlabelled = await page.$$eval('[data-vl-shape] input, [data-vl-shape] select', (els) =>
      els
        .filter((e) => !e.getAttribute('aria-label') && !document.querySelector(`label[for="${e.id}"]`))
        .map((e) => (e as HTMLInputElement).name),
    );
    expect(unlabelled).toEqual([]);
  });

  test('associates each error with its field', async ({ page }) => {
    await submit(page, SHAPES[0]).click();
    const described = await field(page, 'sphere', 'd1').getAttribute('aria-describedby');
    const errorId = await errorFor(page, 'sphere', 'd1').getAttribute('id');
    expect(described?.split(/\s+/)).toContain(errorId);
  });

  test('is operable by keyboard alone', async ({ page }) => {
    await field(page, 'cube', 'd1').focus();
    await page.keyboard.type('5');
    await submit(page, SHAPES[2]).press('Enter');
    await expect(value(page, 'cube')).toHaveText('125');
  });
});
