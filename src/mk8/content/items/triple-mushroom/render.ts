import type { ItemView } from '../../../../content/items/views';
import { tripleIcon } from '../looks';

/** Our mushroom's icon (`content/items/mushroom`). */
export const MUSHROOM =
  '<rect x="22" y="34" width="20" height="20" rx="6" fill="#fff3d6"/><path d="M8 36a24 22 0 0 1 48 0z" fill="#e63946"/><circle cx="22" cy="24" r="5" fill="#fff"/><circle cx="40" cy="22" r="6" fill="#fff"/>';

/** How Triple Mushrooms (MK-112) look in our HUD; see `./sim.ts`. */
export default {
  id: 'triple-mushroom',
  icon: tripleIcon(MUSHROOM, 3),
  // One mushroom per boost left.
  iconFor: (uses) => tripleIcon(MUSHROOM, uses),
  useSound: 'mushroom',
} satisfies ItemView;
