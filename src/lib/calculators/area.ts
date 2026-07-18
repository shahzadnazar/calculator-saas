/**
 * Area of common 2D shapes. Pure and unit-tested.
 */
export type AreaShapeKey =
  | 'rectangle' | 'square' | 'triangle' | 'circle' | 'trapezoid' | 'parallelogram' | 'ellipse';

export interface ShapeInput {
  key: string;
  label: string;
}
export interface AreaShape {
  key: AreaShapeKey;
  label: string;
  inputs: ShapeInput[];
}

export const AREA_SHAPES: AreaShape[] = [
  { key: 'rectangle', label: 'Rectangle', inputs: [{ key: 'length', label: 'Length' }, { key: 'width', label: 'Width' }] },
  { key: 'square', label: 'Square', inputs: [{ key: 'side', label: 'Side' }] },
  { key: 'triangle', label: 'Triangle', inputs: [{ key: 'base', label: 'Base' }, { key: 'height', label: 'Height' }] },
  { key: 'circle', label: 'Circle', inputs: [{ key: 'radius', label: 'Radius' }] },
  { key: 'trapezoid', label: 'Trapezoid', inputs: [{ key: 'a', label: 'Base a' }, { key: 'b', label: 'Base b' }, { key: 'height', label: 'Height' }] },
  { key: 'parallelogram', label: 'Parallelogram', inputs: [{ key: 'base', label: 'Base' }, { key: 'height', label: 'Height' }] },
  { key: 'ellipse', label: 'Ellipse', inputs: [{ key: 'a', label: 'Semi-axis a' }, { key: 'b', label: 'Semi-axis b' }] },
];

export function calculateArea(shape: AreaShapeKey, d: Record<string, number>): number {
  const v = (k: string) => Math.max(0, d[k] || 0);
  switch (shape) {
    case 'rectangle': return v('length') * v('width');
    case 'square': return v('side') ** 2;
    case 'triangle': return 0.5 * v('base') * v('height');
    case 'circle': return Math.PI * v('radius') ** 2;
    case 'trapezoid': return 0.5 * (v('a') + v('b')) * v('height');
    case 'parallelogram': return v('base') * v('height');
    case 'ellipse': return Math.PI * v('a') * v('b');
    default: return NaN;
  }
}
