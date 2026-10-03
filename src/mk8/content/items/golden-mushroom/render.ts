import type { ItemView } from '../../../../content/items/views';

/** How the Golden Mushroom (MK-112) looks in our HUD: a gold mushroom; see `./sim.ts`. */
export default {
  id: 'golden-mushroom',
  icon: '<rect x="22" y="34" width="20" height="20" rx="6" fill="#fff3d6"/><path d="M8 36a24 22 0 0 1 48 0z" fill="#f4b400" stroke="#a66f00" stroke-width="2"/><circle cx="22" cy="24" r="5" fill="#fff6c2"/><circle cx="40" cy="22" r="6" fill="#fff6c2"/>',
  useSound: 'mushroom',
} satisfies ItemView;
