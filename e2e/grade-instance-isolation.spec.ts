import { test, expect, type Page } from '@playwright/test';

/**
 * Grade — same-document instance-isolation proof.
 *
 * Mounts TWO independent, REAL Grade calculator instances in ONE document and proves they do not
 * leak into each other. The harness is test-only: it fetches the built page's server HTML, takes
 * the pristine island root, the real stylesheets and the REAL built island script, and serves a
 * synthetic two-root document on the preview origin. At load the genuine island module mounts BOTH
 * roots, so this exercises the real behaviour rather than a mock.
 *
 * The assignment rows already carry per-instance-unique ids from a module-global counter. The
 * island additionally namespaces its server-STATIC ids — the planning fields, the result shell, the
 * live region — and repoints their in-root references WHEN, and only when, more than one shares the
 * document. A lone instance keeps the ids the server wrote.
 */
const REAL = 'http://localhost:4399/everyday/grade-calculator';
const FIXTURE = 'http://localhost:4399/__grade-two-instance-fixture';

let cachedDoc: string | null = null;

async function twoInstanceDoc(page: Page): Promise<string> {
  if (cachedDoc) return cachedDoc;
  const raw = await (await page.request.get(REAL)).text();
  const parts = await page.evaluate((html) => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const root = d.querySelector('[data-grade-page]');
    const links = [...d.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
    const script = [...d.querySelectorAll('script[type="module"][src]')]
      .map((s) => s.getAttribute('src'))
      .find((src) => /GradeCalculator/.test(src ?? ''));
    return { rootHTML: root?.outerHTML ?? '', links, script };
  }, raw);
  cachedDoc =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    parts.links.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
    `</head><body>` +
    `<div id="inst-a">${parts.rootHTML}</div>` +
    `<div id="inst-b">${parts.rootHTML}</div>` +
    `<script type="module" src="${parts.script}"></script>` +
    `</body></html>`;
  return cachedDoc;
}

async function mountTwo(page: Page): Promise<void> {
  const doc = await twoInstanceDoc(page);
  await page.route('**/__grade-two-instance-fixture', (r) =>
    r.fulfill({ contentType: 'text/html; charset=utf-8', body: doc }),
  );
  await page.goto(FIXTURE, { waitUntil: 'networkidle' });
  await expect(page.locator('[data-grade-page]')).toHaveCount(2);
}

const inst = (page: Page, id: 'inst-a' | 'inst-b') => ({
  rows: page.locator(`#${id} [data-grade-row]`),
  row: (i: number) => page.locator(`#${id} [data-grade-row]`).nth(i),
  add: page.locator(`#${id} [data-grade-add]`),
  submit: page.locator(`#${id} [data-grade-submit]`),
  reset: page.locator(`#${id} [data-grade] [data-reset]`),
  shell: page.locator(`#${id} [data-grade] [data-result-shell]`),
  value: page.locator(`#${id} [data-grade] [data-result-when~="valid"] [data-result-value]`).first(),
  live: page.locator(`#${id} [data-grade] [data-result-live]`),
  goal: page.locator(`#${id} [name="goal"]`),
  remaining: page.locator(`#${id} [name="remainingWeight"]`),
  finalShell: page.locator(`#${id} [data-final] [data-result-shell]`),
  finalCurrent: page.locator(`#${id} [name="current"]`),
  finalWant: page.locator(`#${id} [name="want"]`),
  finalWeight: page.locator(`#${id} [name="weight"]`),
  finalSubmit: page.locator(`#${id} [data-final-submit]`),
  finalSentence: page.locator(`#${id} [data-final-sentence]`),
});
type Inst = ReturnType<typeof inst>;

const setRow = async (a: Inst, i: number, score: string, weight: string) => {
  await a.row(i).locator('[data-grade-score]').fill(score);
  await a.row(i).locator('[data-grade-weight]').fill(weight);
};

test.describe('grade: same-document instance isolation', () => {
  test.beforeEach(async ({ page }) => {
    await mountTwo(page);
  });

  test('both instances mount, task-first, with their own rows', async ({ page }) => {
    for (const id of ['inst-a', 'inst-b'] as const) {
      const x = inst(page, id);
      await expect(x.rows).toHaveCount(5);
      await expect(x.shell).toHaveAttribute('data-result-state', 'example');
      await expect(x.finalShell).toHaveAttribute('data-result-state', 'example');
      await expect(x.live).toHaveText('');
    }
  });

  test('no duplicate ids exist across the document, and every reference resolves in its own instance', async ({ page }) => {
    const duplicates = await page.evaluate(() => {
      const counts: Record<string, number> = {};
      for (const el of document.querySelectorAll('[id]')) counts[el.id] = (counts[el.id] || 0) + 1;
      return Object.entries(counts)
        .filter(([, n]) => n > 1)
        .map(([id]) => id);
    });
    expect(duplicates).toEqual([]);

    const ok = await page.evaluate(() => {
      for (const scope of ['#inst-a', '#inst-b']) {
        const root = document.querySelector(scope)!;
        for (const el of root.querySelectorAll('label[for], [aria-describedby]')) {
          const refs = (el.getAttribute('for') || el.getAttribute('aria-describedby') || '')
            .split(/\s+/)
            .filter(Boolean);
          for (const ref of refs) {
            const target = document.getElementById(ref);
            if (!target || !target.closest(scope)) return false;
          }
        }
      }
      return true;
    });
    expect(ok).toBe(true);
  });

  test('calculating in one instance leaves the other empty', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await setRow(a, 0, '90', '5');
    await setRow(a, 1, 'B', '20');
    await setRow(a, 2, '88', '20');
    await a.submit.click();
    await expect(a.shell).toHaveAttribute('data-result-state', 'valid');
    await expect(a.value).toHaveText('B+ (3.21)');
    await expect(b.shell).toHaveAttribute('data-result-state', 'example');
    await expect(b.live).toHaveText('');
  });

  test('adding and removing rows stays scoped to the instance that was edited', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await a.add.click();
    await expect(a.rows).toHaveCount(6);
    await expect(b.rows).toHaveCount(5);
    await a.row(5).locator('[data-grade-remove]').click();
    await expect(a.rows).toHaveCount(5);
    await expect(b.rows).toHaveCount(5);
  });

  test('live edits after the first calculation stay in their own instance', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await setRow(a, 0, 'A', '50');
    await a.submit.click();
    await expect(a.value).toHaveText('A (4)');
    await setRow(b, 0, 'F', '50');
    await b.submit.click();
    await expect(b.value).toHaveText('F (0)');
    await expect(a.value).toHaveText('A (4)'); // untouched
  });

  test('a field error in one instance targets only that instance’s controls', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await a.row(0).locator('[data-grade-weight]').fill('10'); // weight with no grade
    await a.submit.click();
    await expect(a.shell).toHaveAttribute('data-result-state', 'invalid');
    await expect(a.row(0).locator('[data-error-for^="grade-"]')).toBeVisible();
    await expect(b.row(0).locator('[data-error-for^="grade-"]')).toBeHidden();
    await expect(b.shell).toHaveAttribute('data-result-state', 'example');
  });

  test('the two final-grade calculators do not leak into each other', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await a.finalCurrent.fill('88');
    await a.finalWant.fill('85');
    await a.finalWeight.fill('40');
    await a.finalSubmit.click();
    await expect(a.finalShell).toHaveAttribute('data-result-state', 'valid');
    await expect(a.finalSentence).toContainText('80.5');
    await expect(b.finalShell).toHaveAttribute('data-result-state', 'example');
  });

  test('resetting one instance restores only that instance', async ({ page }) => {
    const a = inst(page, 'inst-a');
    const b = inst(page, 'inst-b');
    await setRow(a, 0, 'A', '50');
    await a.submit.click();
    await setRow(b, 0, 'B', '50');
    await b.submit.click();
    await expect(b.value).toHaveText('B (3)');

    await a.reset.click();
    await expect(a.shell).toHaveAttribute('data-result-state', 'empty');
    await expect(a.row(0).locator('[data-grade-score]')).toHaveValue('');
    await expect(b.shell).toHaveAttribute('data-result-state', 'valid');
    await expect(b.value).toHaveText('B (3)');
  });
});
