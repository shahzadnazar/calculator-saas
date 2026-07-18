/**
 * Volume of common 3D shapes. Pure and unit-tested.
 */
export type VolumeShapeKey =
  | 'cube' | 'box' | 'sphere' | 'cylinder' | 'cone' | 'pyramid' | 'capsule';

export interface VolumeShape {
  key: VolumeShapeKey;
  label: string;
  inputs: { key: string; label: string }[];
}

export const VOLUME_SHAPES: VolumeShape[] = [
  { key: 'cube', label: 'Cube', inputs: [{ key: 'side', label: 'Side' }] },
  { key: 'box', label: 'Box (rectangular)', inputs: [{ key: 'length', label: 'Length' }, { key: 'width', label: 'Width' }, { key: 'height', label: 'Height' }] },
  { key: 'sphere', label: 'Sphere', inputs: [{ key: 'radius', label: 'Radius' }] },
  { key: 'cylinder', label: 'Cylinder', inputs: [{ key: 'radius', label: 'Radius' }, { key: 'height', label: 'Height' }] },
  { key: 'cone', label: 'Cone', inputs: [{ key: 'radius', label: 'Radius' }, { key: 'height', label: 'Height' }] },
  { key: 'pyramid', label: 'Pyramid (rectangular base)', inputs: [{ key: 'length', label: 'Base length' }, { key: 'width', label: 'Base width' }, { key: 'height', label: 'Height' }] },
  { key: 'capsule', label: 'Capsule', inputs: [{ key: 'radius', label: 'Radius' }, { key: 'height', label: 'Cylinder height' }] },
];

export function calculateVolume(shape: VolumeShapeKey, d: Record<string, number>): number {
  const v = (k: string) => Math.max(0, d[k] || 0);
  const PI = Math.PI;
  switch (shape) {
    case 'cube': return v('side') ** 3;
    case 'box': return v('length') * v('width') * v('height');
    case 'sphere': return (4 / 3) * PI * v('radius') ** 3;
    case 'cylinder': return PI * v('radius') ** 2 * v('height');
    case 'cone': return (1 / 3) * PI * v('radius') ** 2 * v('height');
    case 'pyramid': return (1 / 3) * v('length') * v('width') * v('height');
    case 'capsule': return PI * v('radius') ** 2 * ((4 / 3) * v('radius') + v('height'));
    default: return NaN;
  }
}
