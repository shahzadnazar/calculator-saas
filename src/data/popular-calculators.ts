/**
 * Curated popular calculators — for EMPTY-STATE search recommendations ONLY.
 *
 * Deliberately SEPARATE from search ranking metadata: popularity must never
 * influence organic relevance, and relevance must never depend on this list.
 * The order here is the display order. This is an editorial/traffic judgement,
 * never derived from affiliate value, ad value, sponsorship or CPC.
 */
import { getLiveCalculators } from '@data/calculators';

export const POPULAR_CALCULATOR_IDS: readonly string[] = [
  'math/scientific-calculator',
  'finance/mortgage-calculator',
  'health/bmi-calculator',
  'math/percent-calculator',
  'finance/loan-calculator',
  'everyday/age-calculator',
];

/** Popular ids filtered to live calculators, preserving the curated order. */
export function getPopularCalculatorIds(): string[] {
  const live = new Set(getLiveCalculators().map((c) => `${c.category}/${c.slug}`));
  return POPULAR_CALCULATOR_IDS.filter((id) => live.has(id));
}
