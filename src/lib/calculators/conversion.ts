/**
 * Unit conversion. Pure and unit-tested.
 *
 * Every unit stores its factor to the category's base unit, so a conversion is one multiply and one
 * divide. Temperature is the exception — it has an offset as well as a scale — and is handled apart.
 *
 * TWO THINGS MATTER MORE HERE THAN ANYWHERE ELSE ON THE SITE.
 *
 * First, the factors are the EXACT definitions, not rounded ones. Most of these units are defined
 * exactly in terms of the metre and the kilogram, so a truncated factor is simply wrong. It also
 * shows: a cup is defined as sixteen tablespoons, and a converter that answers 15.999946 looks
 * broken to anyone who knows that, however small the error is in relative terms.
 *
 * Second, a converter spans orders of magnitude that a calculator does not. One byte in gigabytes,
 * one milligram in tonnes, one second in years — all are real questions, and all of them round to
 * "0" under ordinary fixed-decimal formatting. `formatConverted` works in significant figures and
 * falls back to exponent notation at the extremes.
 */

export interface UnitDef {
  key: string;
  label: string;
  /** value × toBase = base units. */
  toBase: number;
  /** A note shown beside the unit where its name alone is ambiguous. */
  note?: string;
}

export interface UnitCategory {
  key: string;
  label: string;
  /** What the factors are relative to, for the record. */
  base: string;
  units: UnitDef[];
  /**
   * The pair to offer on arrival — the conversion people actually come for.
   *
   * Taking the first two units instead would open Length on micrometres to millimetres, which is
   * nobody's question. Units stay in size order because that is the order to READ them in; what to
   * offer first is a different decision and is made here.
   */
  defaults: [from: string, to: string];
}

/* Exact definitions, spelled out so the arithmetic can be checked against a standard. */
const IN_M = 0.0254; // the international inch, exact
const FT_M = 0.3048; // exact
const YD_M = 0.9144; // exact
const MI_M = 1609.344; // exact
const IN2_M2 = 0.00064516; // exact
const FT2_M2 = 0.09290304; // exact
const YD2_M2 = 0.83612736; // exact
const MI2_M2 = 2589988.110336; // exact
const AC_M2 = 4046.8564224; // exact
const LB_KG = 0.45359237; // the international avoirdupois pound, exact
const GAL_L = 3.785411784; // the US liquid gallon: 231 cubic inches, exact
const IMP_GAL_L = 4.54609; // the imperial gallon, exact
const LBF_N = 4.4482216152605; // pound-force, exact

export const CATEGORIES: UnitCategory[] = [
  {
    key: 'length',
    defaults: ['m', 'ft'],
    label: 'Length',
    base: 'metre',
    units: [
      { key: 'um', label: 'Micrometres', toBase: 1e-6 },
      { key: 'mm', label: 'Millimetres', toBase: 0.001 },
      { key: 'cm', label: 'Centimetres', toBase: 0.01 },
      { key: 'm', label: 'Metres', toBase: 1 },
      { key: 'km', label: 'Kilometres', toBase: 1000 },
      { key: 'in', label: 'Inches', toBase: IN_M },
      { key: 'ft', label: 'Feet', toBase: FT_M },
      { key: 'yd', label: 'Yards', toBase: YD_M },
      { key: 'mi', label: 'Miles', toBase: MI_M },
      { key: 'nmi', label: 'Nautical miles', toBase: 1852 },
    ],
  },
  {
    key: 'mass',
    defaults: ['kg', 'lb'],
    label: 'Weight / Mass',
    base: 'kilogram',
    units: [
      { key: 'mg', label: 'Milligrams', toBase: 1e-6 },
      { key: 'g', label: 'Grams', toBase: 0.001 },
      { key: 'kg', label: 'Kilograms', toBase: 1 },
      { key: 't', label: 'Tonnes', toBase: 1000, note: 'metric' },
      { key: 'oz', label: 'Ounces', toBase: LB_KG / 16 },
      { key: 'lb', label: 'Pounds', toBase: LB_KG },
      { key: 'st', label: 'Stone', toBase: LB_KG * 14 },
      { key: 'ton_us', label: 'Tons (US, short)', toBase: LB_KG * 2000 },
      { key: 'ton_uk', label: 'Tons (UK, long)', toBase: LB_KG * 2240 },
    ],
  },
  {
    key: 'volume',
    defaults: ['l', 'gal'],
    label: 'Volume',
    base: 'litre',
    units: [
      { key: 'ml', label: 'Millilitres', toBase: 0.001 },
      { key: 'l', label: 'Litres', toBase: 1 },
      { key: 'm3', label: 'Cubic metres', toBase: 1000 },
      { key: 'tsp', label: 'Teaspoons (US)', toBase: GAL_L / 768 },
      { key: 'tbsp', label: 'Tablespoons (US)', toBase: GAL_L / 256 },
      { key: 'floz', label: 'Fluid ounces (US)', toBase: GAL_L / 128 },
      { key: 'cup', label: 'Cups (US)', toBase: GAL_L / 16 },
      { key: 'pt', label: 'Pints (US)', toBase: GAL_L / 8 },
      { key: 'qt', label: 'Quarts (US)', toBase: GAL_L / 4 },
      { key: 'gal', label: 'Gallons (US)', toBase: GAL_L },
      // An imperial pint is a fifth larger than a US one, and an imperial gallon a fifth larger
      // again. Offering only the US set silently gives a British visitor the wrong answer.
      { key: 'floz_uk', label: 'Fluid ounces (UK)', toBase: IMP_GAL_L / 160 },
      { key: 'pt_uk', label: 'Pints (UK)', toBase: IMP_GAL_L / 8 },
      { key: 'qt_uk', label: 'Quarts (UK)', toBase: IMP_GAL_L / 4 },
      { key: 'gal_uk', label: 'Gallons (UK)', toBase: IMP_GAL_L },
    ],
  },
  {
    key: 'area',
    defaults: ['m2', 'ft2'],
    label: 'Area',
    base: 'square metre',
    units: [
      { key: 'cm2', label: 'Square centimetres', toBase: 0.0001 },
      { key: 'm2', label: 'Square metres', toBase: 1 },
      { key: 'ha', label: 'Hectares', toBase: 10_000 },
      { key: 'km2', label: 'Square kilometres', toBase: 1e6 },
      { key: 'in2', label: 'Square inches', toBase: IN2_M2 },
      { key: 'ft2', label: 'Square feet', toBase: FT2_M2 },
      { key: 'yd2', label: 'Square yards', toBase: YD2_M2 },
      { key: 'ac', label: 'Acres', toBase: AC_M2 },
      { key: 'mi2', label: 'Square miles', toBase: MI2_M2 },
    ],
  },
  {
    key: 'speed',
    defaults: ['kmh', 'mph'],
    label: 'Speed',
    base: 'metre per second',
    units: [
      { key: 'mps', label: 'Metres/second', toBase: 1 },
      { key: 'kmh', label: 'Kilometres/hour', toBase: 1000 / 3600 },
      { key: 'mph', label: 'Miles/hour', toBase: MI_M / 3600 },
      { key: 'knot', label: 'Knots', toBase: 1852 / 3600 },
      { key: 'fps', label: 'Feet/second', toBase: FT_M },
    ],
  },
  {
    key: 'time',
    defaults: ['h', 'min'],
    label: 'Time',
    base: 'second',
    units: [
      { key: 'ms', label: 'Milliseconds', toBase: 0.001 },
      { key: 's', label: 'Seconds', toBase: 1 },
      { key: 'min', label: 'Minutes', toBase: 60 },
      { key: 'h', label: 'Hours', toBase: 3600 },
      { key: 'day', label: 'Days', toBase: 86_400 },
      { key: 'week', label: 'Weeks', toBase: 604_800 },
      { key: 'month', label: 'Months', toBase: 2_629_800, note: 'average, 1/12 year' },
      { key: 'year', label: 'Years', toBase: 31_557_600, note: 'Julian, 365.25 days' },
    ],
  },
  {
    key: 'energy',
    defaults: ['kcal', 'kJ'],
    label: 'Energy',
    base: 'joule',
    units: [
      { key: 'J', label: 'Joules', toBase: 1 },
      { key: 'kJ', label: 'Kilojoules', toBase: 1000 },
      { key: 'cal', label: 'Calories', toBase: 4.184, note: 'thermochemical' },
      { key: 'kcal', label: 'Kilocalories', toBase: 4184, note: 'the food Calorie' },
      { key: 'Wh', label: 'Watt-hours', toBase: 3600 },
      { key: 'kWh', label: 'Kilowatt-hours', toBase: 3.6e6 },
      { key: 'BTU', label: 'British thermal units', toBase: 1055.05585262, note: 'international' },
    ],
  },
  {
    key: 'pressure',
    defaults: ['bar', 'psi'],
    label: 'Pressure',
    base: 'pascal',
    units: [
      { key: 'Pa', label: 'Pascals', toBase: 1 },
      { key: 'kPa', label: 'Kilopascals', toBase: 1000 },
      { key: 'bar', label: 'Bar', toBase: 100_000 },
      { key: 'psi', label: 'Pounds/square inch', toBase: LBF_N / IN2_M2 },
      { key: 'atm', label: 'Atmospheres', toBase: 101_325 },
      { key: 'mmHg', label: 'Millimetres of mercury', toBase: 133.322387415 },
    ],
  },
  {
    key: 'power',
    defaults: ['kW', 'hp'],
    label: 'Power',
    base: 'watt',
    units: [
      { key: 'W', label: 'Watts', toBase: 1 },
      { key: 'kW', label: 'Kilowatts', toBase: 1000 },
      { key: 'MW', label: 'Megawatts', toBase: 1e6 },
      { key: 'hp', label: 'Horsepower', toBase: 550 * FT_M * LBF_N, note: 'mechanical' },
      { key: 'BTUh', label: 'BTU/hour', toBase: 1055.05585262 / 3600 },
    ],
  },
  {
    key: 'angle',
    defaults: ['deg', 'rad'],
    label: 'Angle',
    base: 'degree',
    units: [
      { key: 'deg', label: 'Degrees', toBase: 1 },
      { key: 'rad', label: 'Radians', toBase: 180 / Math.PI },
      { key: 'grad', label: 'Gradians', toBase: 0.9 },
      { key: 'turn', label: 'Turns', toBase: 360 },
      { key: 'arcmin', label: 'Arcminutes', toBase: 1 / 60 },
      { key: 'arcsec', label: 'Arcseconds', toBase: 1 / 3600 },
    ],
  },
  {
    key: 'data',
    defaults: ['GB', 'GiB'],
    label: 'Digital storage',
    base: 'byte',
    units: [
      { key: 'B', label: 'Bytes', toBase: 1 },
      { key: 'KB', label: 'Kilobytes', toBase: 1000, note: 'decimal, 1000' },
      { key: 'MB', label: 'Megabytes', toBase: 1e6 },
      { key: 'GB', label: 'Gigabytes', toBase: 1e9 },
      { key: 'TB', label: 'Terabytes', toBase: 1e12 },
      { key: 'KiB', label: 'Kibibytes', toBase: 1024, note: 'binary, 1024' },
      { key: 'MiB', label: 'Mebibytes', toBase: 1024 ** 2 },
      { key: 'GiB', label: 'Gibibytes', toBase: 1024 ** 3 },
      { key: 'TiB', label: 'Tebibytes', toBase: 1024 ** 4 },
    ],
  },
  {
    key: 'temperature',
    defaults: ['C', 'F'],
    label: 'Temperature',
    base: 'degree Celsius',
    units: [
      { key: 'C', label: 'Celsius', toBase: 1 },
      { key: 'F', label: 'Fahrenheit', toBase: 1 },
      { key: 'K', label: 'Kelvin', toBase: 1 },
    ],
  },
];

const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.key, c]));

export const getCategory = (key: string): UnitCategory | undefined => CATEGORY_MAP.get(key);
export const getUnit = (categoryKey: string, unitKey: string): UnitDef | undefined =>
  CATEGORY_MAP.get(categoryKey)?.units.find((u) => u.key === unitKey);

/* ------------------------------------------------------------------ */
/* Temperature, the one category with an offset                        */
/* ------------------------------------------------------------------ */

function toCelsius(value: number, unit: string): number {
  if (unit === 'F') return ((value - 32) * 5) / 9;
  if (unit === 'K') return value - 273.15;
  return value;
}
function fromCelsius(celsius: number, unit: string): number {
  if (unit === 'F') return (celsius * 9) / 5 + 32;
  if (unit === 'K') return celsius + 273.15;
  return celsius;
}

/** Convert `value` from one unit to another within a category. */
export function convert(value: number, fromKey: string, toKey: string, categoryKey: string): number {
  const cat = CATEGORY_MAP.get(categoryKey);
  if (!cat || !Number.isFinite(value)) return Number.NaN;

  if (categoryKey === 'temperature') {
    if (!cat.units.some((u) => u.key === fromKey) || !cat.units.some((u) => u.key === toKey)) {
      return Number.NaN;
    }
    return fromCelsius(toCelsius(value, fromKey), toKey);
  }

  const from = cat.units.find((u) => u.key === fromKey);
  const to = cat.units.find((u) => u.key === toKey);
  if (!from || !to) return Number.NaN;
  if (from.key === to.key) return value;
  return (value * from.toBase) / to.toBase;
}

/** The same quantity in every unit of its category, in the category's own order. */
export function convertToAll(
  value: number,
  fromKey: string,
  categoryKey: string,
): { unit: UnitDef; value: number }[] {
  const cat = CATEGORY_MAP.get(categoryKey);
  if (!cat) return [];
  return cat.units.map((unit) => ({ unit, value: convert(value, fromKey, unit.key, categoryKey) }));
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * A converted value, readable across the whole range a converter has to cover.
 *
 * Fixed decimals cannot do this job: six of them turn one byte in gigabytes into "0" and one
 * milligram in tonnes into "0" as well, which is not a rounding error but a wrong answer. So this
 * works in SIGNIFICANT figures, keeps thousands separators where they help, and drops to exponent
 * notation only once a number is too small or too large to read any other way.
 */
export function formatConverted(value: number, significant = 10): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';

  const magnitude = Math.abs(value);
  if (magnitude < 1e-9 || magnitude >= 1e18) {
    // Trim the mantissa's trailing zeros: 1.5000e-12 reads worse than 1.5e-12.
    return value
      .toExponential(Math.max(0, significant - 1))
      .replace(/\.?0+e/, 'e')
      .replace('e+', 'e');
  }

  // An exact whole number is printed in full. Rounding 1,099,511,627,776 bytes to ten significant
  // figures would give 1,099,511,628,000 — a wrong answer to an exactly answerable question.
  if (Number.isInteger(value) && magnitude <= Number.MAX_SAFE_INTEGER) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  const rounded = Number(value.toPrecision(significant));
  // Below one, significant figures need decimals to survive; above it, they do not.
  const decimals = magnitude >= 1 ? Math.max(0, significant - 1 - Math.floor(Math.log10(magnitude))) : 20;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: Math.min(20, decimals) });
}
