import { describe, it, expect } from 'vitest';
import {
  CUSTOMARY_TIP_PCT,
  DEFAULT_PEOPLE,
  DEFAULT_TIP_PCT,
  MSG,
  QUICK_TIP_EXAMPLE_VALUES,
  SHARED_TIP_EXAMPLE_VALUES,
  TIP_PERCENTAGES,
  completeSharedTip,
  computeQuickTip,
  computeSharedTip,
  describeQuickTip,
  describeSharedTip,
  formatTipPct,
  interpretQuickTip,
  interpretSharedTip,
  parseMoney,
  parsePeople,
  parsePercent,
  quickTipBinding,
  sharedLabels,
  sharedTipBinding,
  spokenUSD,
  validateQuickTip,
  validateSharedTip,
  type SharedTipOperands,
} from './tip-form';

/**
 * The published reference cases, both on a $55 bill: the tip table, and the shared bill at
 * 15% split one way, which comes to $8.25 of tip and $63.25 in all.
 */
const shared = (over: Partial<SharedTipOperands> = {}): SharedTipOperands => ({
  price: '55',
  tipPct: '15',
  people: '1',
  ...over,
});
const errs = (r: ReturnType<typeof validateSharedTip>) =>
  (r as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
const money = (n: number) => Math.round(n * 100) / 100;

/** Vitest runs without a DOM, so the root is a stub answering the bindings' selectors. */
const stubRoot = (v: Record<string, string>) => {
  const controls: Record<string, { value: string }> = {};
  for (const [k, val] of Object.entries(v)) controls[k] = { value: val };
  return {
    querySelector(sel: string) {
      const m = sel.match(/\[name="(.+?)"\]$/);
      return m ? (controls[m[1]] ?? null) : null;
    },
  } as unknown as HTMLElement;
};

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

describe('parsing', () => {
  it('tells an empty field from a bad one', () => {
    expect(parseMoney('')).toBe('empty');
    expect(parseMoney('abc')).toBe('invalid');
    expect(parseMoney('-1')).toBe('invalid');
    expect(parseMoney('0')).toBe(0);
  });

  it('never turns a bad entry into zero', () => {
    expect(parseMoney('abc')).not.toBe(0);
    expect(parsePercent('abc')).toBe('invalid');
  });

  it('accepts a typed dollar sign, comma or percent', () => {
    expect(parseMoney('$1,234.50')).toBe(1234.5);
    expect(parsePercent('15%')).toBe(15);
  });

  it('counts whole people, at least one', () => {
    expect(parsePeople('4')).toBe(4);
    expect(parsePeople('1.5')).toBe('invalid');
    expect(parsePeople('0')).toBe('invalid');
    expect(parsePeople('')).toBe('empty');
  });
});

/* ------------------------------------------------------------------ */
/* The tip table                                                       */
/* ------------------------------------------------------------------ */

describe('the tip table', () => {
  const r = computeQuickTip({ price: '55' });

  it('reproduces the published table', () => {
    const published: [number, number, number][] = [
      [5, 2.75, 57.75], [10, 5.5, 60.5], [12, 6.6, 61.6], [14, 7.7, 62.7], [15, 8.25, 63.25],
      [18, 9.9, 64.9], [20, 11, 66], [25, 13.75, 68.75], [30, 16.5, 71.5], [50, 27.5, 82.5],
    ];
    expect(r.rows).toHaveLength(published.length);
    for (const [pct, tip, total] of published) {
      const row = r.rows.find((x) => x.tipPct === pct)!;
      expect(money(row.tipAmount)).toBe(tip);
      expect(money(row.total)).toBe(total);
    }
  });

  it('leads with the customary rate', () => {
    expect(CUSTOMARY_TIP_PCT).toBe(15);
    expect(r.customary!.tipPct).toBe(15);
    expect(money(quickTipBinding.resultValue(r))).toBe(63.25);
  });

  it('offers the ten percentages the reference offers', () => {
    expect([...TIP_PERCENTAGES]).toEqual([5, 10, 12, 14, 15, 18, 20, 25, 30, 50]);
  });

  it('requires a price and refuses a bad one', () => {
    expect(validateQuickTip({ price: '' })).toMatchObject({ fieldErrors: { price: MSG.priceRequired } });
    expect(validateQuickTip({ price: '-5' })).toMatchObject({ fieldErrors: { price: MSG.priceInvalid } });
    expect(validateQuickTip({ price: '55' })).toEqual({ ok: true });
  });

  it('a zero price is a real table of zeros', () => {
    const zero = computeQuickTip({ price: '0' });
    expect(zero.rows).toHaveLength(10);
    expect(quickTipBinding.resultValue(zero)).toBe(0);
  });

  it('never produces a figure from an unusable price', () => {
    expect(Number.isNaN(quickTipBinding.resultValue(computeQuickTip({ price: 'abc' })))).toBe(true);
    expect(computeQuickTip({ price: 'abc' }).rows).toEqual([]);
  });

  it('says what it found', () => {
    expect(describeQuickTip(r)).toBe('At 15%, the tip is 8 dollars and 25 cents and the total 63 dollars and 25 cents.');
    expect(interpretQuickTip(r)).toBe(
      'On $55.00, the customary 15% is $8.25, making $63.25 in all. Every other rate is priced below.',
    );
  });

  it('the example is the reference case', () => {
    expect(QUICK_TIP_EXAMPLE_VALUES).toEqual({ price: '55' });
    expect(validateQuickTip(QUICK_TIP_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(money(quickTipBinding.resultValue(computeQuickTip(QUICK_TIP_EXAMPLE_VALUES)))).toBe(63.25);
  });

  it('reads and resets its one field', () => {
    const root = stubRoot({ price: '55' });
    expect(quickTipBinding.readOperands(root)).toEqual({ price: '55' });
    quickTipBinding.resetOperands(root);
    expect(quickTipBinding.readOperands(root)).toEqual({ price: '' });
  });
});

/* ------------------------------------------------------------------ */
/* The shared bill                                                     */
/* ------------------------------------------------------------------ */

describe('the shared bill', () => {
  const one = computeSharedTip(shared());

  it('reproduces the published case', () => {
    expect(money(one.tipAmount)).toBe(8.25);
    expect(money(one.total)).toBe(63.25);
    expect(money(one.perPersonTip)).toBe(8.25);
    expect(money(one.perPersonTotal)).toBe(63.25);
  });

  it('splits between people', () => {
    const four = computeSharedTip(shared({ people: '4' }));
    expect(money(four.total)).toBe(63.25);
    expect(money(four.perPersonTotal)).toBe(15.81);
    expect(money(four.perPersonTip)).toBe(2.06);
  });

  it('the guarded value is what each person pays', () => {
    expect(money(sharedTipBinding.resultValue(one))).toBe(63.25);
    expect(money(sharedTipBinding.resultValue(computeSharedTip(shared({ people: '4' }))))).toBe(15.81);
  });

  it('names the two lines the reference names, per person once split', () => {
    expect(sharedLabels(one)).toEqual({ tip: 'Tip', total: 'Total Amount' });
    expect(sharedLabels(computeSharedTip(shared({ people: '3' })))).toEqual({
      tip: 'Tip per Person',
      total: 'Total per Person',
    });
  });

  it('explains the split only when there is one', () => {
    expect(interpretSharedTip(one)).toBe('15% on $55.00 is $8.25, making $63.25 to pay.');
    expect(interpretSharedTip(computeSharedTip(shared({ people: '4' })))).toContain('Split 4 ways');
  });

  it('announces what each person pays', () => {
    expect(describeSharedTip(one)).toBe('Total Amount: 63 dollars and 25 cents.');
  });

  it('requires every field', () => {
    const e = errs(validateSharedTip({ price: '', tipPct: '', people: '' }));
    expect(e).toEqual({
      price: MSG.priceRequired,
      tipPct: MSG.tipRequired,
      people: MSG.peopleRequired,
    });
  });

  it('rejects a negative price or rate, and a fractional party', () => {
    expect(errs(validateSharedTip(shared({ price: '-1' }))).price).toBe(MSG.priceInvalid);
    expect(errs(validateSharedTip(shared({ tipPct: '-1' }))).tipPct).toBe(MSG.tipInvalid);
    expect(errs(validateSharedTip(shared({ people: '2.5' }))).people).toBe(MSG.peopleInvalid);
    expect(errs(validateSharedTip(shared({ people: '0' }))).people).toBe(MSG.peopleInvalid);
  });

  it('a zero tip is a real answer', () => {
    expect(validateSharedTip(shared({ tipPct: '0' }))).toEqual({ ok: true });
    expect(money(computeSharedTip(shared({ tipPct: '0' })).total)).toBe(55);
  });

  it('never lets a broken figure reach the panel', () => {
    expect(Number.isNaN(completeSharedTip(computeSharedTip(shared({ price: 'abc' }))))).toBe(true);
    expect(Number.isNaN(completeSharedTip({ ...one, perPersonTip: Number.NaN }))).toBe(true);
    expect(Number.isNaN(completeSharedTip({ ...one, people: 0 }))).toBe(true);
  });

  it('reads all three fields, and reset restores the documented defaults', () => {
    const root = stubRoot({ price: '99', tipPct: '20', people: '4' });
    expect(sharedTipBinding.readOperands(root)).toEqual({ price: '99', tipPct: '20', people: '4' });
    sharedTipBinding.resetOperands(root);
    expect(sharedTipBinding.readOperands(root)).toEqual({ price: '', tipPct: '15', people: '1' });
  });

  it('ships the documented defaults', () => {
    expect(DEFAULT_TIP_PCT).toBe('15');
    expect(DEFAULT_PEOPLE).toBe('1');
    expect(SHARED_TIP_EXAMPLE_VALUES).toEqual({ price: '55', tipPct: '15', people: '1' });
    expect(money(sharedTipBinding.resultValue(computeSharedTip(SHARED_TIP_EXAMPLE_VALUES)))).toBe(63.25);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

describe('presentation helpers', () => {
  it('prints a percentage without trailing zeros', () => {
    expect(formatTipPct(15)).toBe('15%');
    expect(formatTipPct(12.5)).toBe('12.5%');
  });

  it('speaks an amount', () => {
    expect(spokenUSD(63.25)).toBe('63 dollars and 25 cents');
    expect(spokenUSD(55)).toBe('55 dollars');
    expect(spokenUSD(1.01)).toBe('1 dollar and 1 cent');
  });
});
