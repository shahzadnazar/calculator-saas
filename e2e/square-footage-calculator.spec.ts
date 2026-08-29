import { test, expect, type Page } from '@playwright/test';

/**
 * Square footage — the reference's NINE independent calculators on one page.
 *
 * The spec is written to run over every shape rather than over a favourite one, because all nine
 * share a single binding: a regression in the shared layer would otherwise be caught for
 * rectangles and missed for the other eight.
 *
 * The eight figures in "the reference's own results" are the values the reference prints for the
 * stated inputs, matched digit for digit. They also pin the two things easiest to get wrong: that
 * a rectangle border lies INSIDE the given dimensions, and that the square-metre factor is exact.
 */
const ROUTE = '/everyday/square-footage-calculator';
const DEBOUNCE = 300;

type Shape = { key: string; title: string; dims: string[]; sample: string[]; area: string };

/** Every shape, with a worked sample in feet whose area is checked exactly. */
const SHAPES: Shape[] = [
  { key: 'rectangle', title: 'Rectangle', dims: ['d1', 'd2'], sample: ['30', '20'], area: '600' },
  { key: 'rectangle-border', title: 'Rectangle Border', dims: ['d1', 'd2', 'd3'], sample: ['30', '20', '2'], area: '184' },
  { key: 'circle', title: 'Circle', dims: ['d1'], sample: ['2'], area: '3.1415926536' },
  { key: 'ring', title: 'Ring', dims: ['d1', 'd2'], sample: ['30', '2'], area: '175.929188601' },
  { key: 'triangle-edges', title: 'Triangle with Edge Lengths', dims: ['d1', 'd2', 'd3'], sample: ['3', '4', '5'], area: '6' },
  { key: 'triangle-base', title: 'Triangle with Base & Height', dims: ['d1', 'd2'], sample: ['30', '20'], area: '300' },
  { key: 'trapezoid', title: 'Trapezoid', dims: ['d1', 'd2', 'd3'], sample: ['30', '45', '20'], area: '750' },
  { key: 'sector', title: 'Sector', dims: ['d1', 'd2'], sample: ['30', '90'], area: '706.8583470577' },
  { key: 'parallelogram', title: 'Parallelogram', dims: ['d1', 'd2'], sample: ['30', '20'], area: '600' },
];

const box = (page: Page, key: string) => page.locator(`[data-sf-shape="${key}"]`);
const shell = (page: Page, key: string) => box(page, key).locator('[data-result-state]');
const value = (page: Page, key: string) =>
  box(page, key).locator('[data-result-when~="valid"] [data-result-value]');
const field = (page: Page, key: string, name: string) => box(page, key).locator(`[name="${name}"]`);
const errorFor = (page: Page, key: string, name: string) =>
  box(page, key).locator(`[data-error-for="${name}"]`);
const submit = (page: Page, s: Shape) => box(page, s.key).getByRole('button', { name: `Calculate ${s.title}`, exact: true });
const clear = (page: Page, key: string) => box(page, key).getByRole('button', { name: 'Clear' });

/** Fill a shape's dimensions (and optionally its units), then press its own button. */
async function calc(page: Page, s: Shape, values: string[], units?: string[]) {
  for (let i = 0; i < s.dims.length; i += 1) {
    await field(page, s.key, s.dims[i]).fill(values[i]);
    if (units) await field(page, s.key, `${s.dims[i]}Unit`).selectOption(units[i]);
  }
  await submit(page, s).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

test.describe('the page offers nine separate calculators', () => {
  test('renders one section per shape, each with its own form, button and result', async ({ page }) => {
    await expect(page.locator('[data-sf-shape]')).toHaveCount(9);
    for (const s of SHAPES) {
      await expect(box(page, s.key).locator('form[data-form]')).toHaveCount(1);
      await expect(shell(page, s.key)).toHaveCount(1);
      await expect(submit(page, s)).toBeVisible();
      await expect(box(page, s.key).getByRole('heading', { name: s.title, exact: true })).toBeVisible();
    }
  });

  test('every shape starts with empty measurements, quantity 1 and a labelled example', async ({ page }) => {
    for (const s of SHAPES) {
      await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'example');
      for (const d of s.dims) await expect(field(page, s.key, d)).toHaveValue('');
      await expect(field(page, s.key, 'quantity')).toHaveValue('1');
      await expect(field(page, s.key, 'price')).toHaveValue('');
      await expect(field(page, s.key, 'priceUnit')).toHaveValue('sqft');
    }
  });

  test('each measurement carries its own unit control on the same row', async ({ page }) => {
    for (const s of SHAPES) {
      for (const d of s.dims) {
        await expect(field(page, s.key, `${d}Unit`)).toBeVisible();
      }
    }
    // Only the sector measures an angle.
    await expect(field(page, 'sector', 'd2Unit')).toHaveValue('deg');
    await expect(field(page, 'rectangle', 'd1Unit')).toHaveValue('ft');
  });
});

test.describe('every shape calculates', () => {
  for (const s of SHAPES) {
    test(`${s.title} computes its area in square feet`, async ({ page }) => {
      await calc(page, s, s.sample);
      await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'valid');
      await expect(value(page, s.key)).toHaveText(s.area);
      await expect(box(page, s.key).locator('[data-sf-area-unit]')).toHaveText('Square Feet');
    });
  }
});

test.describe("the reference's own results", () => {
  const M = 'm';
  const cases: [string, string[], string[], string][] = [
    ['rectangle-border', ['30', '20', '2'], [M, M, M], '1980.5595166746'],
    ['circle', ['30'], [M], '7608.5599250326'],
    ['ring', ['30', '2'], [M, M], '1893.6860257859'],
    ['triangle-edges', ['30', '45', '50'], [M, M, M], '7175.0642550628'],
    ['triangle-base', ['30', '20'], [M, M], '3229.1731250129'],
    ['trapezoid', ['30', '45', '20'], [M, M, M], '8072.9328125323'],
    ['sector', ['30', '90'], [M, 'deg'], '7608.5599250326'],
    ['parallelogram', ['30', '20'], [M, M], '6458.3462500258'],
  ];

  for (const [key, values, units, expected] of cases) {
    test(`${key} in metres matches the reference figure`, async ({ page }) => {
      const s = SHAPES.find((x) => x.key === key)!;
      await calc(page, s, values, units);
      await expect(value(page, key)).toHaveText(expected);
    });
  }
});

test.describe('units, quantity and price', () => {
  test('converts each measurement by its own unit', async ({ page }) => {
    const s = SHAPES[0];
    // 1 yard by 12 inches is 3 ft by 1 ft.
    await calc(page, s, ['1', '12'], ['yd', 'in']);
    await expect(value(page, s.key)).toHaveText('3');
  });

  test('multiplies by the quantity and says the per-area figure', async ({ page }) => {
    const s = SHAPES[0];
    await field(page, s.key, 'quantity').fill('3');
    await calc(page, s, ['30', '20']);
    await expect(value(page, s.key)).toHaveText('1800');
    await expect(box(page, s.key).locator('[data-sf-quantity-note]')).toHaveText(
      '600 square feet each, for 3 areas.',
    );
  });

  test('hides the quantity note for a single area', async ({ page }) => {
    const s = SHAPES[0];
    await calc(page, s, ['30', '20']);
    await expect(box(page, s.key).locator('[data-sf-quantity-note]')).toBeHidden();
  });

  test('shows a cost only once a price is entered', async ({ page }) => {
    const s = SHAPES[0];
    await calc(page, s, ['30', '30']);
    await expect(box(page, s.key).locator('[data-sf-cost-row]')).toBeHidden();

    // 900 sq ft = 100 sq yd; at $12 a square yard that is $1,200.
    await field(page, s.key, 'price').fill('12');
    await field(page, s.key, 'priceUnit').selectOption('sqyd');
    await page.waitForTimeout(DEBOUNCE);
    await expect(box(page, s.key).locator('[data-sf-cost-row]')).toBeVisible();
    await expect(box(page, s.key).locator('[data-sf-cost]')).toHaveText('$1,200.00');
    await expect(box(page, s.key).locator('[data-sf-cost-label]')).toHaveText(
      'Cost at $12.00 per square yard',
    );
  });

  test('shows the same area in the four other units', async ({ page }) => {
    const s = SHAPES[0];
    await calc(page, s, ['30', '30']);
    const other = (u: string) => box(page, s.key).locator(`[data-sf-other="${u}"] [data-sf-other-value]`);
    await expect(other('sqyd')).toHaveText('100');
    await expect(other('sqin')).toHaveText('129600');
    await expect(other('acre')).toHaveText('0.020661157');
    await expect(other('sqm')).toHaveText('83.612736');
  });
});

test.describe('validation', () => {
  test('asks for a value before objecting to it, and focuses the first empty field', async ({ page }) => {
    const s = SHAPES[0];
    await submit(page, s).click();
    await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'invalid');
    await expect(errorFor(page, s.key, 'd1')).toHaveText('Enter a value.');
    await expect(field(page, s.key, 'd1')).toBeFocused();
  });

  test('rejects a zero or negative measurement', async ({ page }) => {
    const s = SHAPES[0];
    await calc(page, s, ['0', '20']);
    await expect(errorFor(page, s.key, 'd1')).toHaveText('Enter a number greater than zero.');
  });

  test('rejects a border wider than the rectangle', async ({ page }) => {
    const s = SHAPES.find((x) => x.key === 'rectangle-border')!;
    await calc(page, s, ['10', '10', '5']);
    await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'invalid');
    await expect(box(page, s.key).locator('[data-result-when~="invalid"]')).toContainText(
      'wider than the shape',
    );
  });

  test('rejects a ring border past the centre', async ({ page }) => {
    const s = SHAPES.find((x) => x.key === 'ring')!;
    await calc(page, s, ['30', '16']);
    await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('rejects three edges that cannot meet', async ({ page }) => {
    const s = SHAPES.find((x) => x.key === 'triangle-edges')!;
    await calc(page, s, ['1', '2', '10']);
    await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'invalid');
    await expect(box(page, s.key).locator('[data-result-when~="invalid"]')).toContainText(
      'cannot make a triangle',
    );
  });

  test('rejects an angle past a full turn', async ({ page }) => {
    const s = SHAPES.find((x) => x.key === 'sector')!;
    await calc(page, s, ['10', '400']);
    await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('rejects a fractional quantity', async ({ page }) => {
    const s = SHAPES[0];
    await field(page, s.key, 'quantity').fill('1.5');
    await calc(page, s, ['10', '10']);
    await expect(errorFor(page, s.key, 'quantity')).toBeVisible();
  });

  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    // A number input silently drops letters, so the reachable bad entries are the empty form and
    // a zero — both of which must show an error rather than a computed nothing.
    for (const s of SHAPES) {
      await submit(page, s).click();
      await expect(box(page, s.key)).not.toContainText(/NaN|Infinity|undefined/);
      await calc(page, s, s.dims.map(() => '0'));
      await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'invalid');
      await expect(box(page, s.key)).not.toContainText(/NaN|Infinity|undefined/);
    }
  });
});

test.describe('the nine stay independent', () => {
  test('calculating one shape leaves the others untouched', async ({ page }) => {
    await calc(page, SHAPES[0], ['30', '20']);
    await expect(value(page, 'rectangle')).toHaveText('600');
    for (const s of SHAPES.slice(1)) {
      await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'example');
    }

    await calc(page, SHAPES[2], ['2']);
    await expect(value(page, 'circle')).toHaveText('3.1415926536');
    // The first answer is still on screen.
    await expect(value(page, 'rectangle')).toHaveText('600');
  });

  test('clearing one shape leaves the others alone', async ({ page }) => {
    await calc(page, SHAPES[0], ['30', '20']);
    await calc(page, SHAPES[2], ['2']);
    await clear(page, 'rectangle').click();
    await expect(field(page, 'rectangle', 'd1')).toHaveValue('');
    await expect(value(page, 'circle')).toHaveText('3.1415926536');
  });
});

test.describe('recalculation and clear', () => {
  test('does not calculate before the primary action, then updates live', async ({ page }) => {
    const s = SHAPES[0];
    await expect(box(page, s.key).locator('[data-live-note]')).toBeHidden();
    await field(page, s.key, 'd1').fill('10');
    await field(page, s.key, 'd2').fill('10');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page, s.key)).not.toHaveAttribute('data-result-state', 'valid');

    await submit(page, s).click();
    await expect(value(page, s.key)).toHaveText('100');
    await expect(box(page, s.key).locator('[data-live-note]')).toBeVisible();

    await field(page, s.key, 'd1').fill('20');
    await expect(value(page, s.key)).toHaveText('200');
  });

  test('a unit change re-projects live after the first calculation', async ({ page }) => {
    const s = SHAPES[0];
    await calc(page, s, ['20', '10']);
    await expect(value(page, s.key)).toHaveText('200');
    await field(page, s.key, 'd1Unit').selectOption('yd');
    await expect(value(page, s.key)).toHaveText('600');
  });

  test('Clear empties every measurement and restores the defaults', async ({ page }) => {
    const s = SHAPES[1];
    await calc(page, s, ['30', '20', '2'], ['m', 'm', 'm']);
    await field(page, s.key, 'quantity').fill('4');
    await field(page, s.key, 'price').fill('9');
    await field(page, s.key, 'priceUnit').selectOption('sqm');
    await page.waitForTimeout(DEBOUNCE);

    await clear(page, s.key).click();
    for (const d of s.dims) {
      await expect(field(page, s.key, d)).toHaveValue('');
      await expect(field(page, s.key, `${d}Unit`)).toHaveValue('ft');
    }
    await expect(field(page, s.key, 'quantity')).toHaveValue('1');
    await expect(field(page, s.key, 'price')).toHaveValue('');
    await expect(field(page, s.key, 'priceUnit')).toHaveValue('sqft');
  });
});

test.describe('accessibility', () => {
  test('gives each calculator exactly one live region and no duplicate ids', async ({ page }) => {
    await expect(page.locator('[data-sf-shape] [aria-live]')).toHaveCount(9);
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
    const unlabelled = await page.$$eval('[data-sf-shape] input, [data-sf-shape] select', (els) =>
      els
        .filter((e) => !e.getAttribute('aria-label') && !document.querySelector(`label[for="${e.id}"]`))
        .map((e) => (e as HTMLInputElement).name),
    );
    expect(unlabelled).toEqual([]);
  });

  test('associates each error with its field', async ({ page }) => {
    const s = SHAPES[0];
    await submit(page, s).click();
    const described = await field(page, s.key, 'd1').getAttribute('aria-describedby');
    const errorId = await errorFor(page, s.key, 'd1').getAttribute('id');
    expect(described?.split(/\s+/)).toContain(errorId);
  });

  test('is operable by keyboard alone', async ({ page }) => {
    const s = SHAPES[0];
    await field(page, s.key, 'd1').focus();
    await page.keyboard.type('30');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.type('20');
    await submit(page, s).press('Enter');
    await expect(value(page, s.key)).toHaveText('600');
  });
});
