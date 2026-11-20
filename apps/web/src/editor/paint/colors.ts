import { HEX_COLOR } from '@studio/model';

export type ColorChip = { name: string; hex: string };

export const PALETTE: ColorChip[] = [
  { name: 'Linen White', hex: '#F0E9DC' },
  { name: 'Oat Milk', hex: '#E5D6BF' },
  { name: 'Warm Sand', hex: '#CFB598' },
  { name: 'Clay Rose', hex: '#BC8B7B' },
  { name: 'Terracotta', hex: '#A66C54' },
  { name: 'Walnut', hex: '#766354' },
  { name: 'Soft Sage', hex: '#A4AB94' },
  { name: 'Olive Grove', hex: '#7E876B' },
  { name: 'Forest Moss', hex: '#536653' },
  { name: 'Blue Haze', hex: '#A2ADB2' },
  { name: 'Slate Blue', hex: '#748894' },
  { name: 'Charcoal', hex: '#535756' },
];
const EXTRA: ColorChip[] = [
  { name: 'Warm Plaster', hex: '#EAE4D8' },
  { name: 'Mushroom', hex: '#B7A89A' },
  { name: 'Buttermilk', hex: '#F4E3AE' },
  { name: 'Dried Lavender', hex: '#ABA0B7' },
  { name: 'Rosewater', hex: '#E5BBB2' },
  { name: 'Deep Teal', hex: '#386B69' },
  { name: 'Nightfall', hex: '#3D4B60' },
  { name: 'Brick Dust', hex: '#974E3C' },
];

const catalog = [...PALETTE, ...EXTRA];

export function colorFor(hex: string): ColorChip {
  return catalog.find(item => item.hex.toUpperCase() === hex.toUpperCase()) ?? { name: 'Custom color', hex: hex.toUpperCase() };
}

export function findColors(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return catalog.filter(color => color.name.toLowerCase().includes(q) || color.hex.toLowerCase().startsWith('#' + q.replace(/^#/, '')));
}

export function resolveColor(input: string): string | undefined {
  const query = input.trim().toLowerCase();
  const match = catalog.find(color => color.name.toLowerCase() === query);
  if (match) return match.hex;
  const hex = '#' + query.replace(/^#/, '');
  if (HEX_COLOR.test(hex)) return hex.toUpperCase();
  if (/^#[\da-f]{3}$/i.test(hex)) return '#' + [...hex.slice(1)].map(digit => digit.repeat(2)).join('').toUpperCase();
  if (!/^[a-z]+$/.test(query) || !CSS.supports('color', query) || ['transparent', 'currentcolor'].includes(query)) return;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return;
  context.fillStyle = '#000001';
  context.fillStyle = query;
  if (context.fillStyle !== '#000001' && HEX_COLOR.test(context.fillStyle)) return context.fillStyle.toUpperCase();
}

export function relatedColors(hex: string): ColorChip[] {
  const base = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const shades = [
    ['Pale', 0.72, 255], ['Light', 0.49, 255], ['Soft', 0.24, 255],
    ['Original', 0, 255], ['Deep', 0.20, 22], ['Dark', 0.39, 22],
  ] as const;
  return shades.map(([name, amount, target]) => ({
    name, hex: '#' + base.map(channel => Math.round(channel + (target - channel) * amount)
      .toString(16).padStart(2, '0')).join('').toUpperCase(),
  }));
}
