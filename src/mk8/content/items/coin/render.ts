import type { ItemView } from '../../../../content/items/views';

/** A gold coin with a slot: the coin item's HUD icon (ours, not the pack's sprite). */
export const COIN_ICON =
  '<ellipse cx="32" cy="32" rx="18" ry="24" fill="#f6c21c" stroke="#a66f00" stroke-width="3"/><ellipse cx="32" cy="32" rx="12" ry="18" fill="none" stroke="#ffe680" stroke-width="2"/><rect x="29" y="20" width="6" height="24" rx="3" fill="#a66f00"/>';

/**
 * How the coin item (MK-126) looks in our HUD; its `coin` events play the pickup sound and sparkle
 * (MK-109), so it has no use sound of its own. See `./sim.ts`.
 */
export default {
  id: 'coin',
  icon: COIN_ICON,
  useSound: null,
} satisfies ItemView;
