export const INTERIOR_CATEGORIES = ['Living', 'Bedroom', 'Office', 'Kitchen & dining', 'Bathroom', 'Utility', 'Decor'] as const;

type CatalogEntry = { category: typeof INTERIOR_CATEGORIES[number]; size: readonly [width: number, depth: number, height: number] };

export const INTERIOR_CATALOG = {
  Sofa: { category: 'Living', size: [2.42, 0.99, 0.86] },
  Armchair: { category: 'Living', size: [0.92, 0.94, 0.85] },
  'Coffee table': { category: 'Living', size: [1.24, 0.81, 0.53] },
  'Side table': { category: 'Living', size: [0.5, 0.5, 0.53] },
  TV: { category: 'Living', size: [1.38, 0.42, 1.39] },
  'Media console': { category: 'Living', size: [1.6, 0.49, 0.48] },
  Sideboard: { category: 'Living', size: [1.38, 0.55, 0.84] },
  Bed: { category: 'Bedroom', size: [1.65, 2.15, 1.05] },
  Nightstand: { category: 'Bedroom', size: [0.51, 0.42, 0.55] },
  Wardrobe: { category: 'Bedroom', size: [1.42, 0.61, 1.93] },
  Dresser: { category: 'Bedroom', size: [1.11, 0.52, 0.91] },
  Desk: { category: 'Office', size: [1.4, 0.72, 0.77] },
  'Desktop PC': { category: 'Office', size: [1.62, 0.74, 1.31] },
  'Office chair': { category: 'Office', size: [0.64, 0.65, 1.03] },
  Bookshelf: { category: 'Office', size: [0.9, 0.39, 1.77] },
  'Dining table': { category: 'Kitchen & dining', size: [1.63, 0.91, 0.76] },
  'Dining chair': { category: 'Kitchen & dining', size: [0.52, 0.58, 0.88] },
  'Kitchen island': { category: 'Kitchen & dining', size: [1.52, 0.85, 0.92] },
  'Kitchen cabinet': { category: 'Kitchen & dining', size: [1.21, 0.62, 0.9] },
  Refrigerator: { category: 'Kitchen & dining', size: [0.81, 0.77, 1.84] },
  Range: { category: 'Kitchen & dining', size: [0.77, 0.69, 0.91] },
  'Kitchen sink': { category: 'Kitchen & dining', size: [1.02, 0.62, 1.15] },
  Bathtub: { category: 'Bathroom', size: [1.69, 0.76, 0.54] },
  Shower: { category: 'Bathroom', size: [0.93, 0.93, 1.96] },
  Toilet: { category: 'Bathroom', size: [0.44, 0.73, 0.82] },
  Vanity: { category: 'Bathroom', size: [0.83, 0.57, 1.74] },
  'Washing machine': { category: 'Utility', size: [0.65, 0.68, 0.9] },
  Dryer: { category: 'Utility', size: [0.65, 0.68, 0.9] },
  Bench: { category: 'Utility', size: [1.2, 0.44, 0.46] },
  Rug: { category: 'Decor', size: [2.75, 2.01, 0.02] },
  Plant: { category: 'Decor', size: [0.62, 0.62, 1.35] },
  'Wall art': { category: 'Decor', size: [1.25, 0.06, 2.3] },
  Mirror: { category: 'Decor', size: [0.62, 0.12, 1.79] },
} as const satisfies Record<string, CatalogEntry>;

export type FurnitureKind = keyof typeof INTERIOR_CATALOG;
export const FURNITURE = Object.keys(INTERIOR_CATALOG) as FurnitureKind[];
export const FURNITURE_SCALE = { min: 0.5, max: 1.75 };
export const hasDisplay = (kind: FurnitureKind) => kind === 'TV' || kind === 'Desktop PC';
export const DEFAULT_DISPLAY = { enabled: true, brightness: 45, color: '#A9CCF5', count: 1 } as const;
export const getDisplay = (kind: FurnitureKind) => ({ ...DEFAULT_DISPLAY, count: kind === 'Desktop PC' ? 2 : 1 });
