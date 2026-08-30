import { describe, it, expect } from 'vitest';
import {
  FIELD_LABELS,
  MSG,
  VAT_EXAMPLE_VALUES,
  completeVatValue,
  computeVat,
  describeVatResult,
  formatAmount,
  formatRate,
  headlineOf,
  interpretVat,
  parseAmount,
  parseRate,
  solvedForLabel,
  summaryLabel,
  summaryValue,
  validateVatValues,
  vatBinding,
  type VatValues,
} from './vat-form';

/** The published reference case: 20% on a net of 1,200 is 240 of tax and a gross of 1,440. */
const REF: VatValues = { rate: '20', net: '1200', gross: '', tax: '' };
const vals = (over: Partial<VatValues> = {}): VatValues => ({ rate: '', net: '', gross: '', tax: '', ...over });
const errs = (v: VatValues) => (validateVatValues(v) as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
const formError = (v: VatValues) => (validateVatValues(v) as { formError?: string }).formError;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

describe('parsing', () => {
  it('reads a blank as "work this one out", never as zero', () => {
    expect(parseAmount('')).toBe('blank');
    expect(parseRate('   ')).toBe('blank');
    expect(parseAmount('')).not.toBe(0);
  });

  it('never turns a bad entry into zero', () => {
    expect(parseAmount('abc')).toBe('invalid');
    expect(parseRate('abc')).toBe('invalid');
    expect(parseAmount('12abc')).toBe('invalid');
  });

  it('tolerates a symbol or separator pasted from an invoice', () => {
    expect(parseAmount('£1,234.50')).toBe(1234.5);
    expect(parseAmount('€ 1 200')).toBe(1200);
    expect(parseAmount('$99.99')).toBe(99.99);
    expect(parseRate('20%')).toBe(20);
  });

  it('accepts zero — a zero rate and a zero amount are both real', () => {
    expect(parseRate('0')).toBe(0);
    expect(parseAmount('0')).toBe(0);
  });

  it('rejects a negative rate or amount', () => {
    expect(parseRate('-5')).toBe('invalid');
    expect(parseAmount('-100')).toBe('invalid');
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('validation', () => {
  it('accepts the reference case', () => {
    expect(validateVatValues(REF)).toEqual({ ok: true });
  });

  it('accepts every one of the six valid pairs', () => {
    const pairs: VatValues[] = [
      vals({ rate: '20', net: '1200' }),
      vals({ rate: '20', gross: '1440' }),
      vals({ rate: '20', tax: '240' }),
      vals({ net: '1200', gross: '1440' }),
      vals({ net: '1200', tax: '240' }),
      vals({ gross: '1440', tax: '240' }),
    ];
    for (const v of pairs) expect(validateVatValues(v)).toEqual({ ok: true });
  });

  it('asks for two when fewer are filled in', () => {
    expect(formError(vals())).toBe(MSG.needTwo);
    expect(formError(vals({ net: '1200' }))).toBe(MSG.needTwo);
  });

  it('asks for two blanks when more than two are filled in', () => {
    expect(formError(vals({ rate: '20', net: '1200', gross: '1440' }))).toBe(MSG.tooMany);
    expect(formError(vals({ rate: '20', net: '1200', gross: '1440', tax: '240' }))).toBe(MSG.tooMany);
  });

  it('names the field that is unreadable, and does not guess a zero', () => {
    expect(errs(vals({ rate: 'abc', net: '1200' })).rate).toBe(MSG.rate);
    expect(errs(vals({ rate: '20', net: 'abc' })).net).toBe(MSG.amount);
    expect(errs(vals({ gross: 'x', tax: '240' })).gross).toBe(MSG.amount);
  });

  it('rejects a gross below the net it came from, on the gross field', () => {
    expect(errs(vals({ net: '1200', gross: '900' })).gross).toBe(MSG.grossBelowNet);
  });

  it('rejects a gross below the tax inside it, on the gross field', () => {
    expect(errs(vals({ gross: '100', tax: '240' })).gross).toBe(MSG.grossBelowTax);
  });

  it('will not read a rate off a net of nothing', () => {
    expect(errs(vals({ net: '0', gross: '0' })).net).toBe(MSG.noNet);
    expect(errs(vals({ net: '0', tax: '0' })).net).toBe(MSG.noNet);
    expect(errs(vals({ gross: '240', tax: '240' })).gross).toBe(MSG.noNet);
  });

  it('will not recover a net price from a tax amount at a zero rate', () => {
    expect(errs(vals({ rate: '0', tax: '100' })).rate).toBe(MSG.noRate);
    expect(errs(vals({ rate: '0', tax: '0' })).rate).toBe(MSG.noRate);
  });

  it('accepts a zero rate against a price — zero-rated goods are real', () => {
    expect(validateVatValues(vals({ rate: '0', net: '500' }))).toEqual({ ok: true });
    expect(validateVatValues(vals({ rate: '0', gross: '500' }))).toEqual({ ok: true });
  });

  it('reports a bad field before complaining about how many are filled', () => {
    const v = vals({ rate: 'abc', net: '1200', gross: '1440' });
    expect(errs(v).rate).toBe(MSG.rate);
    expect(formError(v)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('computation', () => {
  it('works the reference case forwards', () => {
    const r = computeVat(REF);
    expect(round(r.gross)).toBe(1440);
    expect(round(r.tax)).toBe(240);
    expect(r.solvedFor).toEqual(['gross', 'tax']);
  });

  it('strips VAT back out of a gross price by DIVIDING, not subtracting', () => {
    const r = computeVat(vals({ rate: '20', gross: '1440' }));
    expect(round(r.net)).toBe(1200);
    expect(round(r.net)).not.toBe(1152); // 1440 - 20% — the classic error
  });

  it('reads a rate off two amounts', () => {
    const r = computeVat(vals({ net: '1200', gross: '1440' }));
    expect(round(r.ratePct)).toBe(20);
  });

  it('recovers a net price from a rate and a tax amount', () => {
    const r = computeVat(vals({ rate: '20', tax: '240' }));
    expect(round(r.net)).toBe(1200);
    expect(round(r.gross)).toBe(1440);
  });

  it('a pair that cannot be solved comes back unsolvable, with no zeros or infinities', () => {
    const r = computeVat(vals({ net: '0', tax: '0' }));
    expect(r.unsolvable).toBe(true);
    for (const n of [r.ratePct, r.net, r.gross, r.tax]) expect(Number.isNaN(n)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('completeVatValue', () => {
  it('returns the headline figure when all four reconcile', () => {
    expect(round(completeVatValue(computeVat(REF)))).toBe(1440);
  });

  it('refuses an unsolvable set rather than printing part of it', () => {
    expect(Number.isFinite(completeVatValue(computeVat(vals({ net: '0', tax: '0' }))))).toBe(false);
  });

  it('refuses a set that breaks gross = net + tax', () => {
    const bad = { ...computeVat(REF), gross: 9999 };
    expect(Number.isFinite(completeVatValue(bad))).toBe(false);
  });

  it('refuses a set that breaks tax = rate% of net', () => {
    const r = computeVat(REF);
    const bad = { ...r, ratePct: 5 };
    expect(Number.isFinite(completeVatValue(bad))).toBe(false);
  });

  it('refuses any negative figure', () => {
    const bad = { ...computeVat(REF), tax: -1, net: 1441 };
    expect(Number.isFinite(completeVatValue(bad))).toBe(false);
  });

  it('holds at invoice scale, where a fixed epsilon would be too tight', () => {
    const r = computeVat(vals({ rate: '19', gross: '9876543.21' }));
    expect(Number.isFinite(completeVatValue(r))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Headline                                                            */
/* ------------------------------------------------------------------ */

describe('which figure leads', () => {
  it('leads on the gross price whenever it was worked out', () => {
    expect(headlineOf(computeVat(vals({ rate: '20', net: '1200' })))).toBe('gross');
    expect(headlineOf(computeVat(vals({ rate: '20', tax: '240' })))).toBe('gross');
    expect(headlineOf(computeVat(vals({ net: '1200', tax: '240' })))).toBe('gross');
  });

  it('leads on the net price when the gross was given', () => {
    expect(headlineOf(computeVat(vals({ rate: '20', gross: '1440' })))).toBe('net');
    expect(headlineOf(computeVat(vals({ gross: '1440', tax: '240' })))).toBe('net');
  });

  it('leads on the tax when both prices were given', () => {
    expect(headlineOf(computeVat(vals({ net: '1200', gross: '1440' })))).toBe('tax');
  });

  it('never leads on a figure the visitor typed in', () => {
    const pairs: VatValues[] = [
      vals({ rate: '20', net: '1200' }),
      vals({ rate: '20', gross: '1440' }),
      vals({ rate: '20', tax: '240' }),
      vals({ net: '1200', gross: '1440' }),
      vals({ net: '1200', tax: '240' }),
      vals({ gross: '1440', tax: '240' }),
    ];
    for (const v of pairs) {
      const r = computeVat(v);
      expect(r.solvedFor).toContain(headlineOf(r));
      expect(r.given).not.toContain(headlineOf(r));
    }
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('formatting', () => {
  it('prints amounts with grouping, two decimals and NO currency symbol', () => {
    expect(formatAmount(1440)).toBe('1,440.00');
    expect(formatAmount(1234567.891)).toBe('1,234,567.89');
    expect(formatAmount(0)).toBe('0.00');
    expect(formatAmount(1440)).not.toMatch(/[$£€]/);
  });

  it('prints a rate without pointless trailing zeros', () => {
    expect(formatRate(20)).toBe('20%');
    expect(formatRate(7.5)).toBe('7.5%');
    expect(formatRate(7.75)).toBe('7.75%');
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(100)).toBe('100%');
  });

  it('never prints NaN, Infinity or undefined', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatAmount(bad)).toBe('—');
      expect(formatRate(bad)).toBe('—');
    }
  });
});

describe('the words on screen', () => {
  it('labels the headline with the figure that was worked out', () => {
    expect(summaryLabel(computeVat(REF))).toBe(FIELD_LABELS.gross);
    expect(summaryValue(computeVat(REF))).toBe('1,440.00');
  });

  it('announces the headline, never the whole table', () => {
    expect(describeVatResult(computeVat(REF))).toBe('Gross price: 1,440.00.');
  });

  it('interprets each of the six directions in its own words', () => {
    const said = new Set<string>();
    const pairs: VatValues[] = [
      vals({ rate: '20', net: '1200' }),
      vals({ rate: '20', gross: '1440' }),
      vals({ rate: '20', tax: '240' }),
      vals({ net: '1200', gross: '1440' }),
      vals({ net: '1200', tax: '240' }),
      vals({ gross: '1440', tax: '240' }),
    ];
    for (const v of pairs) {
      const line = interpretVat(computeVat(v));
      expect(line).not.toMatch(/NaN|Infinity|undefined|—/);
      said.add(line);
    }
    expect(said.size).toBe(6);
  });

  it('names both figures it supplied', () => {
    expect(solvedForLabel(computeVat(REF))).toBe('Gross price and Tax amount');
    expect(solvedForLabel(computeVat(vals({ net: '1200', gross: '1440' })))).toBe('VAT rate and Tax amount');
  });
});

/* ------------------------------------------------------------------ */
/* The binding contract                                                */
/* ------------------------------------------------------------------ */

describe('binding', () => {
  it('opens on the reference example, which is itself valid', () => {
    expect(VAT_EXAMPLE_VALUES).toEqual(REF);
    expect(validateVatValues(VAT_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(round(computeVat(VAT_EXAMPLE_VALUES).gross)).toBe(1440);
  });

  it('exposes the standard-form contract the runtime calls', () => {
    for (const key of ['readValues', 'validate', 'compute', 'resultValue', 'describeResult', 'renderResult', 'resetValues'] as const) {
      expect(typeof vatBinding[key]).toBe('function');
    }
  });

  it('resets every field back to blank, not to the example', () => {
    // A four-field stand-in for the form: enough DOM for readValues/resetValues, and no more.
    const store: Record<string, string> = { rate: '20', net: '1200', gross: '1440', tax: '240' };
    const root = {
      querySelector(sel: string) {
        const name = /\[name="(.+?)"\]/.exec(sel)?.[1];
        if (!name || !(name in store)) return null;
        return {
          get value() {
            return store[name];
          },
          set value(next: string) {
            store[name] = next;
          },
        };
      },
    } as unknown as HTMLElement;

    expect(vatBinding.readValues(root)).toEqual({ rate: '20', net: '1200', gross: '1440', tax: '240' });
    vatBinding.resetValues!(root, 'all');
    expect(vatBinding.readValues(root)).toEqual({ rate: '', net: '', gross: '', tax: '' });
  });
});
