import { test, expect, type Page } from '@playwright/test';

/**
 * R0.5 — the Scientific Calculator on its NON-dedicated-page surfaces now uses
 * the shared PhysicalCalculator (via ScientificCalculatorEmbed), replacing the
 * retired legacy island. Verified on both the /embed route and the how-to guide.
 */
const ID = 'scientific-calculator';
const SURFACES = [
  { name: 'embed route', route: '/embed/math/scientific-calculator' },
  { name: 'how-to guide', route: '/guides/how-to-use-a-scientific-calculator' },
];

const bkey = (p: Page, aria: string) => p.locator(`#${ID} .keypad--basic button[aria-label="${aria}"]`).first();
const fkey = (p: Page, aria: string) => p.locator(`#${ID} button[aria-label="${aria}"]`).first();
const mainText = (p: Page) => p.locator(`#${ID} [data-calc-main]`).textContent();
async function tapBasic(p: Page, arias: string[]) { for (const a of arias) await bkey(p, a).click(); }

for (const { name, route } of SURFACES) {
  test.describe(`Scientific on the ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
    });

    test('renders the shared PhysicalCalculator in Scientific mode (no legacy markup)', async ({ page }) => {
      await expect(page.locator(`#${ID}[data-physical-calculator]`)).toBeVisible();
      await expect(page.locator(`#${ID} .sci-panel`)).toBeVisible();
      await expect(page.locator(`#${ID} .keypad--basic`)).toBeVisible();
      await expect(page.locator(`#${ID} [data-angle-switch]`)).toBeVisible();
      await expect(page.locator(`#${ID} [data-mode-switch]`)).toHaveCount(0); // no Basic/Scientific switch
      await expect(page.locator('[data-scientific-calculator]')).toHaveCount(0); // legacy island gone
    });

    test('scientific function + order of operations', async ({ page }) => {
      await fkey(page, 'sine').click();
      await tapBasic(page, ['9', '0']);
      await fkey(page, 'close parenthesis').click();
      await bkey(page, 'equals').click();
      expect((await mainText(page))?.trim()).toBe('1'); // sin(90°) = 1
    });

    test('Deg/Rad toggle', async ({ page }) => {
      await page.locator(`#${ID} [data-angle-switch] button[data-angle="rad"]`).click();
      await fkey(page, 'sine').click();
      await tapBasic(page, ['9', '0']);
      await fkey(page, 'close parenthesis').click();
      await bkey(page, 'equals').click();
      expect(Number(await mainText(page))).toBeCloseTo(0.894, 2); // sin(90 rad)
    });

    test('reciprocal', async ({ page }) => {
      await tapBasic(page, ['8']);
      await fkey(page, 'Reciprocal').click();
      expect((await mainText(page))?.trim()).toBe('0.125');
    });

    test('hardware keyboard', async ({ page }) => {
      await page.locator(`#${ID} [data-calc-display]`).click();
      await page.keyboard.type('2+3*4');
      await page.keyboard.press('Enter');
      expect((await mainText(page))?.trim()).toBe('14'); // precedence
    });

    test('mobile sizing — fits, no horizontal overflow', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      await expect(page.locator(`#${ID}`)).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow).toBe(false);
      await tapBasic(page, ['7', 'multiply', '8', 'equals']);
      expect((await mainText(page))?.trim()).toBe('56');
    });
  });
}
