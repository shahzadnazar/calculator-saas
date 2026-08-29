/**
 * The shown working, shared by the area and volume calculators.
 *
 * Both reference calculators answer the same way: the formula, then the formula with the entered
 * numbers substituted, then — sometimes — the multiple of π, then the answer. That shape, the
 * number format and the rule for when the π line is worth printing live here once, because the two
 * calculators have to agree: a visitor who checks one against the other must not find them
 * disagreeing in the eleventh digit or showing their working differently.
 */

/** One line of the shown working. */
export interface FormulaStep {
  /**
   * `step` (default) is a line of the working. `note` is prose the reference prints above a
   * result. `heading` is a small label like "Steps:" that introduces a group.
   */
  kind?: 'step' | 'note' | 'heading';
  /** The label on the left, only on the first line of a formula ("Volume", "s", "Height (h)"). */
  label?: string;
  /**
   * Text printed before the figure, on a line that states its own working inline — the cube's
   * `Volume = 5³ = 125`. Kept separate so `expression` stays the figure alone and the fleet's
   * result-value contract reads a number, not a sentence.
   */
  lead?: string;
  /** The expression on the right of the equals sign. */
  expression: string;
  /** The unit shown after this line, when the line is a quantity rather than an expression. */
  unit?: string;
  /** True for a headline answer, so a view can weight it. There may be more than one. */
  final?: boolean;
}

/**
 * A figure as the reference prints it: fourteen significant figures, trailing zeros stripped.
 *
 * The area calculator's triangle is what pins this down — ten decimal places would print
 * 666.5852814907 where the reference prints 666.58528149067.
 */
export function formatSignificant(value: number): string {
  return formatDigits(value, 14);
}

/**
 * The same rule at a chosen number of significant figures.
 *
 * Area and volume print fourteen; the triangle solver prints five, because a solved triangle is a
 * page of twenty derived figures and fourteen digits on each would bury the answer rather than
 * sharpen it. Both are the reference's own choices, verified against its printed output.
 */
export function formatDigits(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  return String(Number(value.toPrecision(digits)));
}

/**
 * Is this coefficient worth printing as an exact multiple of π?
 *
 * The reference prints `= 900π`, `= 3388π`, `= 160π` and `= 22.5π`, but prints no π line at all for
 * a cone (887.333…), a capsule (366.666…) or a conical frustum (46.666…). So the test is not
 * "is it a whole number" — the tube's 22.5 disproves that — but "does it write out exactly and
 * briefly". A coefficient that terminates within four decimals does; a recurring third does not,
 * and printing 887.33333333333π would be noise dressed as precision.
 */
export function isCleanCoefficient(coefficient: number): boolean {
  if (!Number.isFinite(coefficient) || coefficient === 0) return false;
  const scaled = coefficient * 1e4;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

/**
 * The multiple of π on its own line, when it is worth showing.
 *
 * A bare 1 is skipped as well, since "1π" reads as a mistake rather than as a simplification.
 */
export function piStep(coefficient: number): FormulaStep[] {
  if (!isCleanCoefficient(coefficient) || coefficient === 1) return [];
  return [{ expression: `${formatSignificant(coefficient)}π` }];
}
