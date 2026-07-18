/**
 * Square footage for rooms/areas, with multi-room quantity and cost estimate.
 * Pure and unit-tested.
 */
export type SqFtUnit = 'ft' | 'in' | 'yd' | 'm';

const TO_FEET: Record<SqFtUnit, number> = {
  ft: 1,
  in: 1 / 12,
  yd: 3,
  m: 3.280839895,
};

export interface SquareFootageInput {
  length: number;
  width: number;
  unit: SqFtUnit;
  /** Number of identical areas (e.g. rooms). */
  quantity?: number;
  /** Optional price per square foot for a cost estimate. */
  pricePerSqFt?: number;
}

export interface SquareFootageResult {
  areaSqFt: number; // one unit
  totalSqFt: number; // × quantity
  totalSqM: number;
  totalSqYd: number;
  cost: number;
}

const SQFT_PER_SQM = 10.7639104;
const SQFT_PER_SQYD = 9;

export function calculateSquareFootage(input: SquareFootageInput): SquareFootageResult {
  const f = TO_FEET[input.unit] ?? 1;
  const lengthFt = Math.max(0, input.length || 0) * f;
  const widthFt = Math.max(0, input.width || 0) * f;
  const areaSqFt = lengthFt * widthFt;
  const qty = Math.max(1, Math.floor(input.quantity || 1));
  const totalSqFt = areaSqFt * qty;
  return {
    areaSqFt,
    totalSqFt,
    totalSqM: totalSqFt / SQFT_PER_SQM,
    totalSqYd: totalSqFt / SQFT_PER_SQYD,
    cost: totalSqFt * Math.max(0, input.pricePerSqFt || 0),
  };
}
