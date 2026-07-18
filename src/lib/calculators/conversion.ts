/**
 * Unit conversion across common categories. Factor-based (each unit stores its
 * multiplier to a base unit); temperature is handled specially. Pure + tested.
 */
export interface UnitDef {
  key: string;
  label: string;
  toBase: number; // value × toBase = base units
}

export interface UnitCategory {
  key: string;
  label: string;
  units: UnitDef[];
}

export const CATEGORIES: UnitCategory[] = [
  {
    key: 'length', label: 'Length',
    units: [
      { key: 'mm', label: 'Millimetres', toBase: 0.001 },
      { key: 'cm', label: 'Centimetres', toBase: 0.01 },
      { key: 'm', label: 'Metres', toBase: 1 },
      { key: 'km', label: 'Kilometres', toBase: 1000 },
      { key: 'in', label: 'Inches', toBase: 0.0254 },
      { key: 'ft', label: 'Feet', toBase: 0.3048 },
      { key: 'yd', label: 'Yards', toBase: 0.9144 },
      { key: 'mi', label: 'Miles', toBase: 1609.344 },
    ],
  },
  {
    key: 'mass', label: 'Weight / Mass',
    units: [
      { key: 'mg', label: 'Milligrams', toBase: 0.000001 },
      { key: 'g', label: 'Grams', toBase: 0.001 },
      { key: 'kg', label: 'Kilograms', toBase: 1 },
      { key: 't', label: 'Tonnes', toBase: 1000 },
      { key: 'oz', label: 'Ounces', toBase: 0.0283495 },
      { key: 'lb', label: 'Pounds', toBase: 0.453592 },
      { key: 'st', label: 'Stone', toBase: 6.35029 },
    ],
  },
  {
    key: 'volume', label: 'Volume',
    units: [
      { key: 'ml', label: 'Millilitres', toBase: 0.001 },
      { key: 'l', label: 'Litres', toBase: 1 },
      { key: 'm3', label: 'Cubic metres', toBase: 1000 },
      { key: 'tsp', label: 'Teaspoons (US)', toBase: 0.00492892 },
      { key: 'tbsp', label: 'Tablespoons (US)', toBase: 0.0147868 },
      { key: 'floz', label: 'Fluid ounces (US)', toBase: 0.0295735 },
      { key: 'cup', label: 'Cups (US)', toBase: 0.236588 },
      { key: 'pt', label: 'Pints (US)', toBase: 0.473176 },
      { key: 'qt', label: 'Quarts (US)', toBase: 0.946353 },
      { key: 'gal', label: 'Gallons (US)', toBase: 3.78541 },
    ],
  },
  {
    key: 'area', label: 'Area',
    units: [
      { key: 'cm2', label: 'Square centimetres', toBase: 0.0001 },
      { key: 'm2', label: 'Square metres', toBase: 1 },
      { key: 'ha', label: 'Hectares', toBase: 10000 },
      { key: 'km2', label: 'Square kilometres', toBase: 1000000 },
      { key: 'ft2', label: 'Square feet', toBase: 0.092903 },
      { key: 'ac', label: 'Acres', toBase: 4046.86 },
      { key: 'mi2', label: 'Square miles', toBase: 2589988.11 },
    ],
  },
  {
    key: 'speed', label: 'Speed',
    units: [
      { key: 'mps', label: 'Metres/second', toBase: 1 },
      { key: 'kmh', label: 'Kilometres/hour', toBase: 0.277778 },
      { key: 'mph', label: 'Miles/hour', toBase: 0.44704 },
      { key: 'knot', label: 'Knots', toBase: 0.514444 },
      { key: 'fps', label: 'Feet/second', toBase: 0.3048 },
    ],
  },
  {
    key: 'data', label: 'Digital storage',
    units: [
      { key: 'B', label: 'Bytes', toBase: 1 },
      { key: 'KB', label: 'Kilobytes (1000)', toBase: 1000 },
      { key: 'MB', label: 'Megabytes', toBase: 1e6 },
      { key: 'GB', label: 'Gigabytes', toBase: 1e9 },
      { key: 'TB', label: 'Terabytes', toBase: 1e12 },
      { key: 'KiB', label: 'Kibibytes (1024)', toBase: 1024 },
      { key: 'MiB', label: 'Mebibytes', toBase: 1048576 },
      { key: 'GiB', label: 'Gibibytes', toBase: 1073741824 },
    ],
  },
  {
    key: 'temperature', label: 'Temperature',
    units: [
      { key: 'C', label: 'Celsius', toBase: 1 },
      { key: 'F', label: 'Fahrenheit', toBase: 1 },
      { key: 'K', label: 'Kelvin', toBase: 1 },
    ],
  },
];

const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.key, c]));

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
  if (!cat) return NaN;

  if (categoryKey === 'temperature') {
    return fromCelsius(toCelsius(value, fromKey), toKey);
  }

  const from = cat.units.find((u) => u.key === fromKey);
  const to = cat.units.find((u) => u.key === toKey);
  if (!from || !to) return NaN;
  return (value * from.toBase) / to.toBase;
}
