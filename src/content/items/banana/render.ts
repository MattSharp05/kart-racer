import { BananaRenderer } from '../../../render/bananas';
import type { ItemView } from '../render';

export default {
  id: 'banana',
  icon: '<path d="M14 18c4 22 18 34 38 30-4 6-14 9-24 5C16 48 10 34 14 18z" fill="#ffd23f" stroke="#b38600" stroke-width="2"/><rect x="11" y="12" width="6" height="8" rx="2" fill="#6b4f1d"/>',
  useSound: 'banana',
  renderer: BananaRenderer,
} satisfies ItemView;
