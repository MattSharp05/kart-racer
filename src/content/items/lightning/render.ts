import type { ItemView } from '../render';

export default {
  id: 'lightning',
  icon: '<path d="M36 4L14 36h14l-6 24 28-36H34z" fill="#ffe066" stroke="#e09f3e" stroke-width="2"/>',
  useSound: null, // the sim's `lightning` event has its own sound
} satisfies ItemView;
