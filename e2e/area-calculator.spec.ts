import { test, expect, type Page } from '@playwright/test';

/**
 * Area — the reference's SEVEN independent calculators on one page.
 *
 * The spec runs over every shape rather than a favourite one, because all seven share a single
 * binding: a regression in the shared layer would otherwise be caught for rectangles and missed for
 * the other six.
 *
 * Two things here that the square-footage spec has no equivalent of, both from the reference:
 * the answer is in the unit MEASURED IN squared rather than converted to square feet, and the
 * result SHOWS ITS WORKING. Both are asserted verbatim against the reference's own output.
 */
const ROUTE = '/math/area-calculator';
const DEBOUNCE = 300;

type Shape = { key: string; title: string; dims: string[]; sample: string[]; area: string };

/** Every shape, with a worked sample in metres whose answer is checked exactly. */
const SHAPES: Shape[] = [
  { key: 'rectangle', title: 'Rectangle', dims: ['d1', 'd2'], sample: ['30', '20'], area: '600' },
  { key: 'triangle', title: 'Triangle', dims: ['d1', 'd2', 'd3'], sample: ['30', '45', '50'], area: '666.58528149067' },
  { key: 'trapezoid', title: 'Trapezoid', dims: ['d1', 'd2', 'd3'], sample: ['30', '45', '20'], area: '750' },
  { key: 'circle', title: 'Circle', dims: ['d1'], sample: ['30'], area: '2827.4333882308' },
  { key: 'sector', title: 'Sector', dims: ['d1', 'd2'], sample: ['30', '90'], area: '706.8583470577' },
  { key: 'ellipse', title: 'Ellipse', dims: ['d1', 'd2'], sample: ['30', '20'], area: '1884.9555921539' },
  { key: 'parallelogram', title: 'Parallelogram', dims: ['d1', 'd2'], sample: ['30', '20'], area: '600' },
];

const box = (page: Page, key: string) => page.locator(`[data-ar-shape="${key}"]`);
const shell = (page: Page, key: string) => box(page, key).locator('[data-result-state]');
const value = (page: Page, key: string) =>
  box(page, key).locator('[data-result-when~="valid"] [data-result-value]');
const answerUnit = (page: Page, key: string) =>
  box(page, key).locator('.ar-step--final .ar-step__unit');
const field = (page: Page, key: string, name: string) => box(page, key).locator(`[name="${name}"]`);
const errorFor = (page: Page, key: string, name: string) =>
  box(page, key).locator(`[data-error-for="${name}"]`);
const submit = (page: Page, s: Shape) =>
  box(page, s.key).getByRole('button', { name: `Calculate ${s.title}`, exact: true });
const clear = (page: Page, key: string) => box(page, key).getByRole('button', { name: 'Clear' });

/** Every rendered line of the working, normalised to single spaces. */
const working = (page: Page, key: string) =>
  box(page, key)
    .locator('.ar-step')
    .allTextContents()
    .then((rows) => rows.map((r) => r.replace(/\s+/g, ' ').trim()));

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

test.describe('the page offers seven separate calculators', () => {
  test('renders one section per shape, each with its own form, button and result', async ({ page }) => {
    await expect(page.locator('[data-ar-shape]')).toHaveCount(7);
    for (const s of SHAPES) {
      await expect(box(page, s.key).locator('form[data-form]')).toHaveCount(1);
      await expect(shell(page, s.key)).toHaveCount(1);
      await expect(submit(page, s)).toBeVisible();
      await expect(box(page, s.key).getByRole('heading', { name: s.title, exact: true })).toBeVisible();
    }
  });

  test('keeps the result INSIDE the form card, under the inputs', async ({ page }) => {
    for (const s of SHAPES) {
      const inside = await box(page, s.key).evaluate((el) => {
        const card = el.querySelector('.card');
        const result = el.querySelector('[data-result-shell]');
        const form = el.querySelector('form');
        if (!card || !result || !form) return false;
        // In the same card, and after the form in document order.
        return (
          card.contains(result) &&
          !!(form.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING)
        );
      });
      expect(inside, `${s.key}: result inside the card, after the form`).toBe(true);
    }
  });

  test('every shape starts empty, in metres, with a labelled example', async ({ page }) => {
    for (const s of SHAPES) {
      await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'example');
      for (const d of s.dims) {
        await expect(field(page, s.key, d)).toHaveValue('');
        const unit = field(page, s.key, `${d}Unit`);
        await expect(unit).toHaveValue(s.key === 'sector' && d === 'd2' ? 'deg' : 'm');
      }
    }
  });

  test('gives each measurement its own unit control on the same row', async ({ page }) => {
    for (const s of SHAPES) {
      for (const d of s.dims) await expect(field(page, s.key, `${d}Unit`)).toBeVisible();
    }
    // Only the sector measures an angle.
    await expect(field(page, 'sector', 'd2Unit')).toHaveValue('deg');
  });

  test('labels the fields as the reference labels them', async ({ page }) => {
    await expect(box(page, 'rectangle').locator('label').first()).toHaveText('Length (l)');
    await expect(box(page, 'triangle').locator('label').first()).toHaveText('Edge 1 (a)');
    await expect(box(page, 'trapezoid').locator('label').first()).toHaveText('Base 1 (b₁)');
    await expect(box(page, 'circle').locator('label').first()).toHaveText('Radius (r)');
    await expect(box(page, 'ellipse').locator('label').first()).toHaveText('Semi-major Axes (a)');
  });

  test('points the triangle at the triangle calculator, as the reference does', async ({ page }) => {
    const link = box(page, 'triangle').getByRole('link', { name: /Triangle Calculator/ });
    await expect(link).toHaveAttribute('href', '/math/triangle-calculator');
  });
});

test.describe("the reference's own results", () => {
  for (const s of SHAPES) {
    test(`${s.title} matches the reference figure and unit`, async ({ page }) => {
      await calc(page, s, s.sample);
      await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'valid');
      await expect(value(page, s.key)).toHaveText(s.area);
      await expect(answerUnit(page, s.key)).toHaveText('meters²');
    });
  }
});

test.describe('the working, as the reference prints it', () => {
  test('triangle shows the semi-perimeter as its own step', async ({ page }) => {
    await calc(page, SHAPES[1], ['30', '45', '50']);
    expect(await working(page, 'triangle')).toEqual([
      's = (a + b + c) / 2',
      '= (30 + 45 + 50) / 2',
      '= 62.5 meters',
      'Area = √(s(s − a)(s − b)(s − c))',
      '= √(62.5 × (62.5 − 30) × (62.5 − 45) × (62.5 − 50))',
      '= 666.58528149067 meters²',
    ]);
  });

  test('circle shows the multiple of pi on its own line', async ({ page }) => {
    await calc(page, SHAPES[3], ['30']);
    expect(await working(page, 'circle')).toEqual([
      'Area = π r²',
      '= π × 30²',
      '= 900π',
      '= 2827.4333882308 meters²',
    ]);
  });

  test('sector shows the reference formula', async ({ page }) => {
    await calc(page, SHAPES[4], ['30', '90']);
    expect(await working(page, 'sector')).toEqual([
      'Area = A / 360 × π × r²',
      '= 90 / 360 × π × 30²',
      '= 225π',
      '= 706.8583470577 meters²',
    ]);
  });

  test('ellipse shows the reference formula', async ({ page }) => {
    await calc(page, SHAPES[5], ['30', '20']);
    expect(await working(page, 'ellipse')).toEqual([
      'Area = π a b',
      '= π × 30 × 20',
      '= 600π',
      '= 1884.9555921539 meters²',
    ]);
  });

  test('trapezoid and rectangle show their formulas', async ({ page }) => {
    await calc(page, SHAPES[2], ['30', '45', '20']);
    expect(await working(page, 'trapezoid')).toEqual([
      'Area = (b₁ + b₂) / 2 × h',
      '= (30 + 45) / 2 × 20',
      '= 750 meters²',
    ]);
    await calc(page, SHAPES[0], ['30', '20']);
    expect(await working(page, 'rectangle')).toEqual([
      'Area = l × w',
      '= 30 × 20',
      '= 600 meters²',
    ]);
  });

  test('the answer is the working’s last line, not a second figure', async ({ page }) => {
    await calc(page, SHAPES[0], ['30', '20']);
    // Exactly one result value, and it is inside the final step.
    await expect(value(page, 'rectangle')).toHaveCount(1);
    const inFinal = await box(page, 'rectangle').evaluate((el) => {
      const v = el.querySelector('[data-result-value]');
      return !!v?.closest('.ar-step--final');
    });
    expect(inFinal).toBe(true);
  });
});

test.describe('units', () => {
  test('reports in the unit measured in, squared', async ({ page }) => {
    const s = SHAPES[0];
    await calc(page, s, ['30', '20'], ['ft', 'ft']);
    await expect(value(page, s.key)).toHaveText('600');
    await expect(answerUnit(page, s.key)).toHaveText('feet²');
  });

  test('converts every measurement into the FIRST field’s unit', async ({ page }) => {
    const s = SHAPES[0];
    // 1 m by 50 cm is 1 m by 0.5 m.
    await calc(page, s, ['1', '50'], ['m', 'cm']);
    await expect(value(page, s.key)).toHaveText('0.5');
    await expect(answerUnit(page, s.key)).toHaveText('meters²');
  });

  test('says so when the units were mixed', async ({ page }) => {
    const s = SHAPES[0];
    await calc(page, s, ['30', '20'], ['m', 'm']);
    await expect(box(page, s.key).locator('[data-ar-mixed]')).toBeHidden();
    await calc(page, s, ['1', '50'], ['m', 'cm']);
    await expect(box(page, s.key).locator('[data-ar-mixed]')).toBeVisible();
  });

  test('does not call a sector mixed just because it has an angle', async ({ page }) => {
    await calc(page, SHAPES[4], ['30', '90'], ['m', 'deg']);
    await expect(box(page, 'sector').locator('[data-ar-mixed]')).toBeHidden();
  });

  test('accepts an angle in radians', async ({ page }) => {
    await calc(page, SHAPES[4], ['30', String(Math.PI / 2)], ['m', 'rad']);
    await expect(value(page, 'sector')).toHaveText('706.8583470577');
  });

  test('offers the answer in the other area units, behind a disclosure', async ({ page }) => {
    const s = SHAPES[0];
    await calc(page, s, ['30', '30'], ['ft', 'ft']);
    const others = box(page, s.key).locator('[data-ar-other="sqyd"] [data-ar-other-value]');
    await expect(others).toHaveText('100');
    await box(page, s.key).getByText('Show result in other units').click();
    await expect(others).toBeVisible();
    await expect(box(page, s.key).locator('[data-ar-other="sqin"] [data-ar-other-value]')).toHaveText('129600');
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
    await calc(page, SHAPES[0], ['0', '20']);
    await expect(errorFor(page, 'rectangle', 'd1')).toHaveText('Enter a number greater than zero.');
  });

  test('rejects three edges that cannot meet', async ({ page }) => {
    await calc(page, SHAPES[1], ['1', '2', '10']);
    await expect(shell(page, 'triangle')).toHaveAttribute('data-result-state', 'invalid');
    await expect(box(page, 'triangle').locator('[data-result-when~="invalid"]')).toContainText(
      'cannot make a triangle',
    );
  });

  test('rejects an angle past a full turn', async ({ page }) => {
    await calc(page, SHAPES[4], ['10', '400']);
    await expect(shell(page, 'sector')).toHaveAttribute('data-result-state', 'invalid');
  });

  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    for (const s of SHAPES) {
      await submit(page, s).click();
      await expect(box(page, s.key)).not.toContainText(/NaN|Infinity|undefined/);
      await calc(page, s, s.dims.map(() => '0'));
      await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'invalid');
      await expect(box(page, s.key)).not.toContainText(/NaN|Infinity|undefined/);
    }
  });
});

test.describe('the seven stay independent', () => {
  test('calculating one shape leaves the others untouched', async ({ page }) => {
    await calc(page, SHAPES[0], ['30', '20']);
    await expect(value(page, 'rectangle')).toHaveText('600');
    for (const s of SHAPES.slice(1)) {
      await expect(shell(page, s.key)).toHaveAttribute('data-result-state', 'example');
    }
    await calc(page, SHAPES[3], ['30']);
    await expect(value(page, 'circle')).toHaveText('2827.4333882308');
    await expect(value(page, 'rectangle')).toHaveText('600');
  });

  test('clearing one shape leaves the others alone', async ({ page }) => {
    await calc(page, SHAPES[0], ['30', '20']);
    await calc(page, SHAPES[3], ['30']);
    await clear(page, 'rectangle').click();
    await expect(field(page, 'rectangle', 'd1')).toHaveValue('');
    await expect(value(page, 'circle')).toHaveText('2827.4333882308');
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
    // d1 becomes feet while d2 stays metres: 10 m is 32.8083989501 ft.
    await field(page, s.key, 'd1Unit').selectOption('ft');
    await expect(value(page, s.key)).toHaveText('656.16797900262');
    await expect(answerUnit(page, s.key)).toHaveText('feet²');
  });

  test('Clear empties every measurement and restores metres', async ({ page }) => {
    const s = SHAPES[2];
    await calc(page, s, ['30', '45', '20'], ['ft', 'ft', 'ft']);
    await clear(page, s.key).click();
    for (const d of s.dims) {
      await expect(field(page, s.key, d)).toHaveValue('');
      await expect(field(page, s.key, `${d}Unit`)).toHaveValue('m');
    }
  });
});

test.describe('accessibility', () => {
  test('gives each calculator exactly one live region and no duplicate ids', async ({ page }) => {
    await expect(page.locator('[data-ar-shape] [aria-live]')).toHaveCount(7);
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
    const unlabelled = await page.$$eval('[data-ar-shape] input, [data-ar-shape] select', (els) =>
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

test.describe('layout', () => {
  for (const width of [1366, 1024, 768, 390]) {
    test(`does not overflow horizontally at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow).toBe(false);
    });
  }
});
