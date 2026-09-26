import { hz } from '../../../audio/synth';
import type { ItemView } from '../views';

/** How Turbo Trio (MK-65) looks and sounds: three flame-tipped rockets; see `./sim.ts`. */
export default {
  id: 'turbo-trio',
  icon: '<g stroke="#7a2e00" stroke-width="2"><path d="M8 50l6-24h8l6 24z" fill="#ff8c1a"/><path d="M36 50l6-24h8l6 24z" fill="#ff8c1a"/><path d="M22 40l6-26h8l6 26z" fill="#ffb703"/></g><g fill="#e63946"><path d="M12 52l6 8 6-8z"/><path d="M40 52l6 8 6-8z"/><path d="M26 42l6 8 6-8z"/></g><circle cx="32" cy="22" r="3" fill="#fff"/>',
  useSound: 'turbo-trio.use',
  sounds: {
    // A quick rising whistle over the boost whoosh.
    use: (synth, v) =>
      synth.tone(hz(67), 0.18, { type: 'square', slideTo: hz(79), volume: 0.12 * v }),
  },
} satisfies ItemView;
