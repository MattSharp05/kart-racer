import type { ItemView } from '../../../../content/items/views';
import { ItemEntityRenderer } from '../../../../render/entities';
import { shellModel, tripleIcon } from '../looks';

/** Our red shell's icon (`content/items/red`). */
const SHELL = `<ellipse cx="32" cy="38" rx="22" ry="16" fill="#fff"/><path d="M12 36a20 18 0 0 1 40 0z" fill="#e63946"/><path d="M22 24l10 12 10-12M32 36v-16" stroke="#fff" stroke-width="3" fill="none"/>`;

/** How Triple Red Shells (MK-112) look in our HUD and without a pack; see `./sim.ts`. */
export default {
  id: 'triple-red',
  icon: tripleIcon(SHELL, 3),
  // One shell per shell left.
  iconFor: (uses) => tripleIcon(SHELL, uses),
  useSound: 'shell',
  renderer: ItemEntityRenderer,
  entityModel: () => shellModel('#e63946'),
} satisfies ItemView;
