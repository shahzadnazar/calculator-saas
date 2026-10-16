import { describe, it, expect } from 'vitest';
import {
  NEW_CALCULATOR_LAUNCHES,
  NEW_CALCULATOR_WINDOW_DAYS,
  daysSinceLaunch,
  getNewCalculators,
  getCalculator,
} from './calculators';

/**
 * The "recently added" boost puts a calculator at the top of the rail on every page,
 * which is the single strongest internal-link lever the site has. It used to be a
 * hand-maintained list with a comment asking someone to prune it, and nobody did:
 * VAT collected 53 inbound links that way, more than any other page on the site.
 *
 * These tests exist so the boost cannot become permanent again by neglect.
 */
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('new-calculator launch records', () => {
  it('keeps the list short', () => {
    expect(NEW_CALCULATOR_LAUNCHES.length).toBeLessThanOrEqual(3);
  });

  it('names a real live calculator and a real date', () => {
    for (const entry of NEW_CALCULATOR_LAUNCHES) {
      const [category, slug] = entry.ref.split('/');
      expect(getCalculator(category, slug)?.status, entry.ref).toBe('live');
      expect(entry.launchedAt, entry.ref).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(entry.launchedAt)), entry.ref).toBe(false);
    }
  });
});

describe('the boost expires on its own', () => {
  it('counts whole days from the launch date', () => {
    expect(daysSinceLaunch('2026-08-30', at('2026-08-30'))).toBe(0);
    expect(daysSinceLaunch('2026-08-30', at('2026-09-29'))).toBe(30);
    expect(daysSinceLaunch('2026-08-30', at('2026-08-29'))).toBe(-1);
  });

  it('promotes an entry on its launch day and on the last day of the window', () => {
    const entry = NEW_CALCULATOR_LAUNCHES[0];
    if (!entry) return;
    const launch = new Date(`${entry.launchedAt}T12:00:00Z`);
    const lastDay = new Date(launch.getTime() + (NEW_CALCULATOR_WINDOW_DAYS - 1) * 86_400_000);
    expect(getNewCalculators(undefined, launch).map((c) => `${c.category}/${c.slug}`)).toContain(entry.ref);
    expect(getNewCalculators(undefined, lastDay).map((c) => `${c.category}/${c.slug}`)).toContain(entry.ref);
  });

  /** The regression: no entry may still be promoted once the window has passed. */
  it('drops every entry once the window has passed, however long it is left in the file', () => {
    for (const entry of NEW_CALCULATOR_LAUNCHES) {
      const launch = Date.parse(`${entry.launchedAt}T12:00:00Z`);
      for (const extraDays of [NEW_CALCULATOR_WINDOW_DAYS, NEW_CALCULATOR_WINDOW_DAYS + 1, 365, 3650]) {
        const later = new Date(launch + extraDays * 86_400_000);
        expect(
          getNewCalculators(undefined, later).map((c) => `${c.category}/${c.slug}`),
          `${entry.ref} still promoted ${extraDays} days after launch`,
        ).not.toContain(entry.ref);
      }
    }
  });

  it('never promotes an entry dated in the future', () => {
    const entry = NEW_CALCULATOR_LAUNCHES[0];
    if (!entry) return;
    const dayBefore = new Date(Date.parse(`${entry.launchedAt}T12:00:00Z`) - 86_400_000);
    expect(getNewCalculators(undefined, dayBefore)).toHaveLength(0);
  });

  it('never promotes the page you are already on', () => {
    for (const entry of NEW_CALCULATOR_LAUNCHES) {
      const [category, slug] = entry.ref.split('/');
      const self = getCalculator(category, slug)!;
      const launch = new Date(`${entry.launchedAt}T12:00:00Z`);
      expect(getNewCalculators(self, launch).map((c) => `${c.category}/${c.slug}`)).not.toContain(entry.ref);
    }
  });

  it('does not leave long-dead entries sitting in the file', () => {
    // Expired entries are inert, so this is housekeeping rather than correctness —
    // but a list nobody prunes is exactly how the old behaviour went wrong.
    for (const entry of NEW_CALCULATOR_LAUNCHES) {
      const age = daysSinceLaunch(entry.launchedAt, new Date());
      expect(
        age,
        `${entry.ref} launched ${age} days ago and is still listed; delete it`,
      ).toBeLessThan(NEW_CALCULATOR_WINDOW_DAYS * 3);
    }
  });
});
