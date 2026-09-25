import type { ItemView } from '../render';

export default {
  id: 'star',
  icon: '<path d="M32 6l7.6 16.4 17.9 2.1-13.2 12.3 3.5 17.7L32 45.6 16.2 54.5l3.5-17.7L6.5 24.5l17.9-2.1z" fill="#ffd166" stroke="#e09f3e" stroke-width="2"/><circle cx="26" cy="30" r="2.5" fill="#333"/><circle cx="38" cy="30" r="2.5" fill="#333"/>',
  useSound: null, // the sim's `star` event has its own sound
} satisfies ItemView;
