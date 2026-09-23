import type { ItemId } from '../../sim/types';

export const ITEM_NAMES: Record<ItemId, string> = {
  mushroom: 'Mushroom',
  banana: 'Banana',
  green: 'Green shell',
  red: 'Red shell',
  star: 'Star',
  lightning: 'Lightning',
};

export const ITEM_ORDER: ItemId[] = ['mushroom', 'banana', 'green', 'red', 'star', 'lightning'];

const shell = (fill: string) =>
  `<ellipse cx="32" cy="38" rx="22" ry="16" fill="#fff"/><path d="M12 36a20 18 0 0 1 40 0z" fill="${fill}"/><path d="M22 24l10 12 10-12M32 36v-16" stroke="#fff" stroke-width="3" fill="none"/>`;

/** Simple original SVG icons for each item (64×64 viewBox). */
const ICONS: Record<ItemId, string> = {
  mushroom:
    '<rect x="22" y="34" width="20" height="20" rx="6" fill="#fff3d6"/><path d="M8 36a24 22 0 0 1 48 0z" fill="#e63946"/><circle cx="22" cy="24" r="5" fill="#fff"/><circle cx="40" cy="22" r="6" fill="#fff"/>',
  banana:
    '<path d="M14 18c4 22 18 34 38 30-4 6-14 9-24 5C16 48 10 34 14 18z" fill="#ffd23f" stroke="#b38600" stroke-width="2"/><rect x="11" y="12" width="6" height="8" rx="2" fill="#6b4f1d"/>',
  green: shell('#2a9d8f'),
  red: shell('#e63946'),
  star: '<path d="M32 6l7.6 16.4 17.9 2.1-13.2 12.3 3.5 17.7L32 45.6 16.2 54.5l3.5-17.7L6.5 24.5l17.9-2.1z" fill="#ffd166" stroke="#e09f3e" stroke-width="2"/><circle cx="26" cy="30" r="2.5" fill="#333"/><circle cx="38" cy="30" r="2.5" fill="#333"/>',
  lightning:
    '<path d="M36 4L14 36h14l-6 24 28-36H34z" fill="#ffe066" stroke="#e09f3e" stroke-width="2"/>',
};

export function itemIcon(item: ItemId): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${ICONS[item]}</svg>`;
}
