export const CEILING_FINISHES = ['Plain plaster', 'Wallpaper', 'Stencils', 'Pressed tin', '3D panels'] as const;
export type CeilingFinish = typeof CEILING_FINISHES[number];

export const CEILING_CATALOG = {
  'Ceiling fan': { category: 'Fans', size: [1.2, 1.2], color: '#916445' },
  'Hanging plant': { category: 'Natural', size: [0.72, 0.72], color: '#B67854' },
  'Wooden beam': { category: 'Natural', size: [2.35, 0.24], color: '#895B3C' },
  Wreath: { category: 'Natural', size: [0.96, 0.96], color: '#557447' },
  'Paper lantern': { category: 'Party', size: [0.56, 0.56], color: '#E5A665' },
  'Pom-pom': { category: 'Party', size: [0.58, 0.58], color: '#D891A5' },
  'Disco ball': { category: 'Party', size: [0.52, 0.52], color: '#AFBCD0' },
  Garland: { category: 'Party', size: [2.05, 0.26], color: '#BC7953' },
  'Draped curtains': { category: 'Fabrics', size: [1.68, 0.23], color: '#BF9E86' },
  'Tented fabric': { category: 'Fabrics', size: [2.2, 1.38], color: '#D9BB9A' },
  Tapestry: { category: 'Fabrics', size: [1.06, 0.2], color: '#9D6551' },
} as const;

export type CeilingDecorKind = keyof typeof CEILING_CATALOG;
export const CEILING_DECOR = Object.keys(CEILING_CATALOG) as CeilingDecorKind[];
export const CEILING_DECOR_SCALE = { min: 0.45, max: 1.6 };
export const CEILING_DECOR_DRAG_TYPE = 'application/x-room-paint-ceiling-decor';
export type CeilingDecor = { id: string; kind: CeilingDecorKind; x: number; z: number; rotation: number; scale: number; color: string };
