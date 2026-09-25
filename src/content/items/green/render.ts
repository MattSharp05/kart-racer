import { ShellRenderer } from '../../../render/shells';
import type { ItemView } from '../render';

export default {
  id: 'green',
  icon: `<ellipse cx="32" cy="38" rx="22" ry="16" fill="#fff"/><path d="M12 36a20 18 0 0 1 40 0z" fill="#2a9d8f"/><path d="M22 24l10 12 10-12M32 36v-16" stroke="#fff" stroke-width="3" fill="none"/>`,
  useSound: 'shell',
  renderer: ShellRenderer,
} satisfies ItemView;
