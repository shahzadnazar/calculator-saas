/**
 * VAT — value-added tax across the four quantities that describe one sale.
 *
 * A VAT sale is two equations:
 *
 *     tax   = net x rate / 100
 *     gross = net + tax
 *
 * Four quantities, two equations, so ANY TWO of them determine the other two. Which two were
 * left blank IS the mode — there is no selector to get out of step with the fields, the same
 * reasoning that shapes the sales tax solver.
 *
 * Pure and unit-tested. Nothing here knows about the DOM, formatting or a currency: VAT is
 * levied in more than 170 countries, so the engine deals in bare numbers and the presentation
 * layer decides how to print them.
 *
 * Where the arithmetic cannot give an answer — a rate asked for against a net of nothing, a
 * gross smaller than its own tax — every figure comes back NaN and `unsolvable` is true. The
 * form layer turns that into an invalid state. It never becomes a zero or an Infinity on
 * screen.
 */

/** The four quantities. Order here is the order they are read and printed. */
export const VAT_QUANTITIES = ['ratePct', 'net', 'gross', 'tax'] as const;

export type VatQuantity = (typeof VAT_QUANTITIES)[number];

export interface VatSolveInput {
  /** `null` marks a quantity as not given. Exactly two must be non-null. */
  ratePct: number | null;
  net: number | null;
  gross: number | null;
  tax: number | null;
}

export interface VatSolution {
  ratePct: number;
  net: number;
  gross: number;
  tax: number;
  /** The two that were supplied, in `VAT_QUANTITIES` order. */
  given: readonly VatQuantity[];
  /** The two that were worked out, in `VAT_QUANTITIES` order. */
  solvedFor: readonly VatQuantity[];
  /** True when the pair given does not determine the rest; every figure is NaN. */
  unsolvable: boolean;
}

const NO_SOLUTION = (given: readonly VatQuantity[]): VatSolution => ({
  ratePct: Number.NaN,
  net: Number.NaN,
  gross: Number.NaN,
  tax: Number.NaN,
  given,
  solvedFor: VAT_QUANTITIES.filter((q) => !given.includes(q)),
  unsolvable: true,
});

/** Which quantities were supplied, in canonical order. */
export function givenOf(input: VatSolveInput): readonly VatQuantity[] {
  return VAT_QUANTITIES.filter((q) => input[q] !== null);
}

/**
 * Fill in the two that were left blank.
 *
 * Guards, and why each one exists:
 *   - A VAT rate is never negative. A negative rate is a data-entry slip, not a discount.
 *   - No price or tax amount is negative.
 *   - A gross is never smaller than the tax inside it, and never smaller than its own net.
 *   - Reading a RATE off two amounts needs a net greater than zero — a percentage has to be
 *     a percentage OF something. Zero net with zero tax is every rate at once, so it is
 *     unsolvable rather than 0%.
 *   - Recovering a NET from a rate and a tax amount needs a rate above zero, for the same
 *     reason read the other way round.
 */
export function solveVat(input: VatSolveInput): VatSolution {
  const given = givenOf(input);
  if (given.length !== 2) return NO_SOLUTION(given);

  const values = given.map((q) => input[q] as number);
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return NO_SOLUTION(given);

  const key = given.join('+');
  let ratePct = Number.NaN;
  let net = Number.NaN;
  let gross = Number.NaN;
  let tax = Number.NaN;

  switch (key) {
    // Add VAT to a net price — the everyday invoicing direction.
    case 'ratePct+net': {
      ratePct = input.ratePct as number;
      net = input.net as number;
      tax = net * (ratePct / 100);
      gross = net + tax;
      break;
    }
    // Strip VAT out of a gross price — the everyday receipt direction.
    case 'ratePct+gross': {
      ratePct = input.ratePct as number;
      gross = input.gross as number;
      net = gross / (1 + ratePct / 100);
      tax = gross - net;
      break;
    }
    // A known tax amount at a known rate implies the net it was charged on.
    case 'ratePct+tax': {
      ratePct = input.ratePct as number;
      tax = input.tax as number;
      if (ratePct <= 0) return NO_SOLUTION(given);
      net = tax / (ratePct / 100);
      gross = net + tax;
      break;
    }
    // Two amounts, so the rate is what falls out.
    case 'net+gross': {
      net = input.net as number;
      gross = input.gross as number;
      if (net <= 0 || gross < net) return NO_SOLUTION(given);
      tax = gross - net;
      ratePct = (tax / net) * 100;
      break;
    }
    case 'net+tax': {
      net = input.net as number;
      tax = input.tax as number;
      if (net <= 0) return NO_SOLUTION(given);
      gross = net + tax;
      ratePct = (tax / net) * 100;
      break;
    }
    case 'gross+tax': {
      gross = input.gross as number;
      tax = input.tax as number;
      if (gross < tax) return NO_SOLUTION(given);
      net = gross - tax;
      if (net <= 0) return NO_SOLUTION(given);
      ratePct = (tax / net) * 100;
      break;
    }
    default:
      return NO_SOLUTION(given);
  }

  if (![ratePct, net, gross, tax].every((n) => Number.isFinite(n))) return NO_SOLUTION(given);

  return {
    ratePct,
    net,
    gross,
    tax,
    given,
    solvedFor: VAT_QUANTITIES.filter((q) => !given.includes(q)),
    unsolvable: false,
  };
}

/* ------------------------------------------------------------------ */
/* The two everyday directions, as named primitives                    */
/* ------------------------------------------------------------------ */

export interface VatAmounts {
  net: number;
  tax: number;
  gross: number;
}

/** Add VAT to a net (VAT-exclusive) price. */
export function addVat(net: number, ratePct: number): VatAmounts {
  const base = Math.max(0, net || 0);
  const tax = base * (Math.max(0, ratePct || 0) / 100);
  return { net: base, tax, gross: base + tax };
}

/** Take the VAT back out of a gross (VAT-inclusive) price. */
export function removeVat(gross: number, ratePct: number): VatAmounts {
  const total = Math.max(0, gross || 0);
  const net = total / (1 + Math.max(0, ratePct || 0) / 100);
  return { net, tax: total - net, gross: total };
}
