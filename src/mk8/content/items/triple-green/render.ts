import type { ItemView } from '../../../../content/items/views';
import { ItemEntityRenderer } from '../../../../render/entities';
import { shellModel, tripleIcon } from '../looks';

/** Our green shell's icon (`content/items/green`). */
const SHELL = `<ellipse cx="32" cy="38" rx="22" ry="16" fill="#fff"/><path d="M12 36a20 18 0 0 1 40 0z" fill="#2a9d8f"/><path d="M22 24l10 12 10-12M32 36v-16" stroke="#fff" stroke-width="3" fill="none"/>`;

/** How Triple Green Shells (MK-112) look in our HUD and without a pack; see `./sim.ts`. */
export default {
  id: 'triple-green',
  icon: tripleIcon(SHELL, 3),
  // One shell per shell left.
  iconFor: (uses) => tripleIcon(SHELL, uses),
  useSound: 'shell',
  renderer: ItemEntityRenderer,
  entityModel: () => shellModel('#2a9d8f'),
} satisfies ItemView;
