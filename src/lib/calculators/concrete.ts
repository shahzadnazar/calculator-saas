/**
 * Concrete volume for a rectangular slab, in cubic yards/metres/feet, plus the
 * number of pre-mix bags needed. Pure and unit-tested.
 */
export type LengthUnit = 'ft' | 'm';

export interface ConcreteInput {
  length: number;
  width: number;
  depth: number;
  unit: LengthUnit;
  /** Extra material to order for waste/spillage, as a percent (e.g. 10). */
  wastePct?: number;
}

export interface ConcreteResult {
  cubicYards: number;
  cubicMeters: number;
  cubicFeet: number;
  bags40lb: number;
  bags60lb: number;
  bags80lb: number;
}

const FT3_PER_M3 = 35.3146667;
// Approximate yield of pre-mixed concrete bags, in cubic feet.
const BAG_YIELD_FT3 = { lb40: 0.3, lb60: 0.45, lb80: 0.6 };

export function calculateConcrete(input: ConcreteInput): ConcreteResult {
  const l = Math.max(0, input.length || 0);
  const w = Math.max(0, input.width || 0);
  const d = Math.max(0, input.depth || 0);
  const waste = 1 + Math.max(0, input.wastePct || 0) / 100;

  // Volume in cubic feet (convert metres if needed).
  let cubicFeet = l * w * d * waste;
  if (input.unit === 'm') cubicFeet *= FT3_PER_M3;

  return {
    cubicFeet: Math.round(cubicFeet * 1000) / 1000,
    cubicYards: Math.round((cubicFeet / 27) * 1000) / 1000,
    cubicMeters: Math.round((cubicFeet / FT3_PER_M3) * 1000) / 1000,
    bags40lb: Math.ceil(cubicFeet / BAG_YIELD_FT3.lb40),
    bags60lb: Math.ceil(cubicFeet / BAG_YIELD_FT3.lb60),
    bags80lb: Math.ceil(cubicFeet / BAG_YIELD_FT3.lb80),
  };
}
