import { test, expect, type Page } from '@playwright/test';

/**
 * Concrete — the reference's FIVE independent calculators on one page.
 *
 * The "reference's own results" block is the load-bearing part: each case is a full result the
 * reference prints for the stated inputs — volume in three units, weight in two, and both bag
 * counts — entered here through the form exactly as a visitor would enter them, with mixed units.
 */
const ROUTE = '/everyday/concrete-calculator';
const DEBOUNCE = 320;

type Pour = {
  key: string;
  title: string;
  dims: string[];
  units: (string | null)[];
  want: { ft3: string; yd3: string; m3: string; lbs: string; kg: string; b60: string; b80: string };
};

/** The reference's own inputs and printed results. */
const POURS: Pour[] = [
  {
    key: 'slab',
    title: 'Slabs, Square Footings, or Walls',
    dims: ['5', '2.5', '5', '1'],
    units: ['m', 'm', 'cm', null],
    want: { ft3: '22.07', yd3: '0.82', m3: '0.63', lbs: '2,935.53', kg: '1,331.25', b60: '48.93', b80: '36.69' },
  },
  {
    key: 'tube',
    title: 'Circular Slab or Tube',
    dims: ['5', '4', '6', '1'],
    units: ['m', 'm', 'cm', null],
    want: { ft3: '14.98', yd3: '0.55', m3: '0.42', lbs: '1,992', kg: '903.36', b60: '33.2', b80: '24.9' },
  },
  {
    key: 'curb',
    title: 'Curb and Gutter Barrier',
    dims: ['4', '10', '4', '5', '10', '1'],
    units: ['cm', 'cm', 'cm', 'cm', 'm', null],
    want: { ft3: '3.04', yd3: '0.11', m3: '0.086', lbs: '403.93', kg: '183.18', b60: '6.73', b80: '5.05' },
  },
  {
    key: 'stairs',
    title: 'Stairs',
    dims: ['12', '6', '50', '5', '5'],
    units: ['cm', 'cm', 'cm', 'cm', null],
    want: { ft3: '1.54', yd3: '0.057', m3: '0.044', lbs: '204.31', kg: '92.66', b60: '3.41', b80: '2.55' },
  },
];

const ALL_KEYS = ['slab', 'footing', 'tube', 'curb', 'stairs'];

const box = (page: Page, key: string) => page.locator(`[data-cc-shape="${key}"]`);
const shell = (page: Page, key: string) => box(page, key).locator('[data-result-state]');
const value = (page: Page, key: string) => box(page, key).locator('[data-result-value]');
const field = (page: Page, key: string, name: string) => box(page, key).locator(`[name="${name}"]`);
const errorFor = (page: Page, key: string, name: string) =>
  box(page, key).locator(`[data-error-for="${name}"]`);
const submit = (page: Page, key: string) => box(page, key).getByRole('button', { name: 'Calculate', exact: true });
const clear = (page: Page, key: string) => box(page, key).getByRole('button', { name: 'Clear' });

async function calc(page: Page, key: string, dims: string[], units: (string | null)[] = []) {
  const names = await box(page, key)
    .locator('[data-field]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.field!));
  for (let i = 0; i < names.length; i += 1) {
    await field(page, key, names[i]).fill(dims[i] ?? '');
    const unit = units[i];
    if (unit) await field(page, key, `${names[i]}Unit`).selectOption(unit);
  }
  await submit(page, key).click();
}

/** Every figure the result panel shows. */
async function readResult(page: Page, key: string) {
  const b = box(page, key);
  const text = async (sel: string) => (await b.locator(sel).textContent())!.trim();
  return {
    ft3: await text('[data-result-value]'),
    yd3: await text('[data-cc-yd3]'),
    m3: await text('[data-cc-m3]'),
    lbs: await text('[data-cc-lbs]'),
    kg: await text('[data-cc-kg]'),
    b60: await text('[data-cc-bags="0"]'),
    b80: await text('[data-cc-bags="1"]'),
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

test.describe('the page offers five separate calculators', () => {
  test('renders one section per pour, each with its own form, button and result', async ({ page }) => {
    await expect(page.locator('[data-cc-shape]')).toHaveCount(5);
    for (const key of ALL_KEYS) {
      await expect(box(page, key).locator('form[data-form]')).toHaveCount(1);
      await expect(shell(page, key)).toHaveCount(1);
      await expect(submit(page, key)).toBeVisible();
    }
  });

  test('titles them as the reference titles them', async ({ page }) => {
    const titles = await page.locator('[data-cc-shape] h2').allTextContents();
    expect(titles.map((t) => t.trim())).toEqual([
      'Slabs, Square Footings, or Walls',
      'Hole, Column, or Round Footings',
      'Circular Slab or Tube',
      'Curb and Gutter Barrier',
      'Stairs',
    ]);
  });

  test('starts with empty measurements, a quantity of one and a labelled example', async ({ page }) => {
    for (const key of ALL_KEYS) {
      await expect(shell(page, key)).toHaveAttribute('data-result-state', 'example');
      const inputs = box(page, key).locator('input[type=number]');
      for (let i = 0; i < (await inputs.count()); i += 1) {
        const name = await inputs.nth(i).getAttribute('name');
        await expect(inputs.nth(i)).toHaveValue(name === 'quantity' ? '1' : '');
      }
    }
  });

  test('keeps the result inside the same card as the form', async ({ page }) => {
    for (const key of ALL_KEYS) {
      const inside = await box(page, key).evaluate((el) => {
        const card = el.querySelector('.card');
        const result = el.querySelector('[data-result-shell]');
        return !!card && !!result && card.contains(result);
      });
      expect(inside).toBe(true);
    }
  });

  test('gives a unit to every measurement but not to a count', async ({ page }) => {
    // The stairs' riser count and every quantity are plain numbers.
    await expect(field(page, 'stairs', 'd5Unit')).toHaveCount(0);
    await expect(field(page, 'slab', 'quantityUnit')).toHaveCount(0);
    await expect(field(page, 'slab', 'd1Unit')).toHaveValue('ft');
  });
});

test.describe("the reference's own results", () => {
  for (const pour of POURS) {
    test(`${pour.title} matches every printed figure`, async ({ page }) => {
      await calc(page, pour.key, pour.dims, pour.units);
      await expect(shell(page, pour.key)).toHaveAttribute('data-result-state', 'valid');
      expect(await readResult(page, pour.key)).toEqual(pour.want);
    });
  }

  test('Hole, Column, or Round Footings matches every printed figure', async ({ page }) => {
    await calc(page, 'footing', ['2.5', '6', '1'], ['m', 'm', null]);
    expect(await readResult(page, 'footing')).toEqual({
      ft3: '1,040.1', yd3: '38.52', m3: '29.45',
      lbs: '138,333.55', kg: '62,733.63', b60: '2,305.56', b80: '1,729.17',
    });
  });
});

test.describe('units and quantity', () => {
  test('converts each measurement by its own unit', async ({ page }) => {
    // 12 in by 12 in by 12 in is exactly one cubic foot.
    await calc(page, 'slab', ['12', '12', '12', '1'], ['in', 'in', 'in', null]);
    await expect(value(page, 'slab')).toHaveText('1');
  });

  test('multiplies by the quantity', async ({ page }) => {
    await calc(page, 'slab', ['10', '4', '0.5', '1']);
    await expect(value(page, 'slab')).toHaveText('20');
    await field(page, 'slab', 'quantity').fill('3');
    await expect(value(page, 'slab')).toHaveText('60');
  });

  test('counts risers instead of a quantity on the stairs', async ({ page }) => {
    await expect(field(page, 'stairs', 'quantity')).toHaveCount(0);
    await expect(box(page, 'stairs')).toContainText('Number of Risers');
  });

  test('shows the density the estimate assumes', async ({ page }) => {
    await calc(page, 'slab', ['10', '4', '0.5', '1']);
    await expect(box(page, 'slab')).toContainText('2,130 kg/m³');
    await expect(box(page, 'slab')).toContainText('133 lbs/ft³');
  });
});

test.describe('validation', () => {
  test('asks for a value before objecting to it, and focuses the first empty field', async ({ page }) => {
    await field(page, 'slab', 'quantity').fill('1');
    await submit(page, 'slab').click();
    await expect(shell(page, 'slab')).toHaveAttribute('data-result-state', 'invalid');
    await expect(errorFor(page, 'slab', 'd1')).toHaveText('Enter a value.');
    await expect(field(page, 'slab', 'd1')).toBeFocused();
  });

  test('rejects a zero or negative measurement', async ({ page }) => {
    await calc(page, 'slab', ['0', '4', '0.5', '1']);
    await expect(errorFor(page, 'slab', 'd1')).toHaveText('Enter a number greater than zero.');
  });

  test('demands a whole number for a quantity and for risers', async ({ page }) => {
    await calc(page, 'slab', ['10', '4', '0.5', '1.5']);
    await expect(errorFor(page, 'slab', 'quantity')).toBeVisible();
    await calc(page, 'stairs', ['1', '0.5', '3', '1', '2.5']);
    await expect(errorFor(page, 'stairs', 'd5')).toBeVisible();
  });

  test('rejects a bore that is not smaller than the outer diameter', async ({ page }) => {
    await calc(page, 'tube', ['4', '5', '1', '1']);
    await expect(shell(page, 'tube')).toHaveAttribute('data-result-state', 'invalid');
    await expect(box(page, 'tube').locator('[data-result-when~="invalid"]')).toContainText(
      'inner diameter',
    );
  });

  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    for (const key of ALL_KEYS) {
      await submit(page, key).click();
      await expect(box(page, key)).not.toContainText(/NaN|Infinity|undefined/);
      const count = await box(page, key).locator('[data-field]').count();
      await calc(page, key, Array.from({ length: count }, () => '0'));
      await expect(shell(page, key)).toHaveAttribute('data-result-state', 'invalid');
      await expect(box(page, key)).not.toContainText(/NaN|Infinity|undefined/);
    }
  });
});

test.describe('the five stay independent', () => {
  test('calculating one pour leaves the others untouched', async ({ page }) => {
    await calc(page, 'slab', ['10', '4', '0.5', '1']);
    await expect(value(page, 'slab')).toHaveText('20');
    for (const key of ALL_KEYS.filter((k) => k !== 'slab')) {
      await expect(shell(page, key)).toHaveAttribute('data-result-state', 'example');
    }
    await calc(page, 'footing', ['2', '10', '1']);
    await expect(shell(page, 'footing')).toHaveAttribute('data-result-state', 'valid');
    await expect(value(page, 'slab')).toHaveText('20');
  });

  test('clearing one pour leaves the others alone', async ({ page }) => {
    await calc(page, 'slab', ['10', '4', '0.5', '1']);
    await calc(page, 'footing', ['2', '10', '1']);
    await clear(page, 'slab').click();
    await expect(field(page, 'slab', 'd1')).toHaveValue('');
    await expect(shell(page, 'footing')).toHaveAttribute('data-result-state', 'valid');
  });
});

test.describe('recalculation and clear', () => {
  test('does not calculate before the primary action, then updates live', async ({ page }) => {
    await expect(box(page, 'slab').locator('[data-live-note]')).toBeHidden();
    await field(page, 'slab', 'd1').fill('10');
    await field(page, 'slab', 'd2').fill('4');
    await field(page, 'slab', 'd3').fill('0.5');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page, 'slab')).not.toHaveAttribute('data-result-state', 'valid');

    await submit(page, 'slab').click();
    await expect(value(page, 'slab')).toHaveText('20');
    await expect(box(page, 'slab').locator('[data-live-note]')).toBeVisible();

    await field(page, 'slab', 'd1').fill('20');
    await expect(value(page, 'slab')).toHaveText('40');
  });

  test('Clear empties the measurements, restores the quantity and the default unit', async ({ page }) => {
    await calc(page, 'slab', ['5', '2.5', '5', '4'], ['m', 'm', 'cm', null]);
    await clear(page, 'slab').click();
    for (const name of ['d1', 'd2', 'd3']) {
      await expect(field(page, 'slab', name)).toHaveValue('');
      await expect(field(page, 'slab', `${name}Unit`)).toHaveValue('ft');
    }
    await expect(field(page, 'slab', 'quantity')).toHaveValue('1');
  });
});

test.describe('accessibility', () => {
  test('gives each calculator exactly one live region and no duplicate ids', async ({ page }) => {
    await expect(page.locator('[data-cc-shape] [aria-live]')).toHaveCount(5);
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
    const unlabelled = await page.$$eval('[data-cc-shape] input, [data-cc-shape] select', (els) =>
      els
        .filter((e) => !e.getAttribute('aria-label') && !document.querySelector(`label[for="${e.id}"]`))
        .map((e) => (e as HTMLInputElement).name),
    );
    expect(unlabelled).toEqual([]);
  });

  test('associates each error with its field', async ({ page }) => {
    await calc(page, 'slab', ['0', '4', '0.5', '1']);
    const described = await field(page, 'slab', 'd1').getAttribute('aria-describedby');
    const errorId = await errorFor(page, 'slab', 'd1').getAttribute('id');
    expect(described?.split(/\s+/)).toContain(errorId);
  });

  test('is operable by keyboard alone', async ({ page }) => {
    await field(page, 'slab', 'd1').focus();
    await page.keyboard.type('10');
    await field(page, 'slab', 'd2').fill('4');
    await field(page, 'slab', 'd3').fill('0.5');
    await submit(page, 'slab').press('Enter');
    await expect(value(page, 'slab')).toHaveText('20');
  });

  test('does not overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await calc(page, 'slab', ['10', '4', '0.5', '1']);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
