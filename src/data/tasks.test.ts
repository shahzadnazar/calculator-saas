import { describe, it, expect } from 'vitest';
import { TASK_GROUPS } from './tasks';
import { getLiveCalculators } from './calculators';

/**
 * The task IA is the site's PRIMARY navigation, so it must be a clean partition
 * of the live calculators: every tool has exactly one task home, and every
 * member points to a real, live tool. These invariants are what let the rest of
 * the app treat "the task group of a calculator" as total and unambiguous.
 */
describe('task groups', () => {
  const liveRefs = new Set(getLiveCalculators().map((c) => `${c.category}/${c.slug}`));
  const allMembers = TASK_GROUPS.flatMap((g) => g.members.map((m) => m.ref));

  it('covers every live calculator exactly once', () => {
    const counts = new Map<string, number>();
    for (const ref of allMembers) counts.set(ref, (counts.get(ref) ?? 0) + 1);

    const missing = [...liveRefs].filter((ref) => !counts.has(ref));
    const duplicated = [...counts].filter(([, n]) => n > 1).map(([ref]) => ref);
    expect(missing, `live calculators with no task group: ${missing.join(', ')}`).toEqual([]);
    expect(duplicated, `calculators in more than one task group: ${duplicated.join(', ')}`).toEqual([]);
  });

  it('has no member pointing to a missing or non-live calculator', () => {
    const dangling = allMembers.filter((ref) => !liveRefs.has(ref));
    expect(dangling, `task members not matching a live calculator: ${dangling.join(', ')}`).toEqual([]);
  });

  it('has unique slugs and orders', () => {
    const slugs = TASK_GROUPS.map((g) => g.slug);
    const orders = TASK_GROUPS.map((g) => g.order);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('keeps section refs consistent with members (when a hub uses sections)', () => {
    for (const g of TASK_GROUPS) {
      if (!g.sections) continue;
      const memberRefs = new Set(g.members.map((m) => m.ref));
      const sectionRefs = g.sections.flatMap((s) => s.refs);
      // Every sectioned ref is a real member...
      for (const ref of sectionRefs) {
        expect(memberRefs.has(ref), `${g.slug}: section ref ${ref} is not a member`).toBe(true);
      }
      // ...and every member appears in exactly one section (no tool hidden).
      expect(new Set(sectionRefs).size, `${g.slug}: sections have duplicate refs`).toBe(sectionRefs.length);
      expect(sectionRefs.length, `${g.slug}: not every member is placed in a section`).toBe(g.members.length);
    }
  });
});
