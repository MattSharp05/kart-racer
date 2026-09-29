import { hz } from '../../../audio/synth';
import type { ItemView } from '../views';

/** The icon's three rockets: the two outer ones, and the taller one in the middle. */
const OUTLINE = '<g stroke="#7a2e00" stroke-width="2">';
const LEFT = {
  body: '<path d="M8 50l6-24h8l6 24z" fill="#ff8c1a"/>',
  flame: '<path d="M12 52l6 8 6-8z"/>',
};
const RIGHT = {
  body: '<path d="M36 50l6-24h8l6 24z" fill="#ff8c1a"/>',
  flame: '<path d="M40 52l6 8 6-8z"/>',
};
const MIDDLE = {
  body: '<path d="M22 40l6-26h8l6 26z" fill="#ffb703"/>',
  flame: '<path d="M26 42l6 8 6-8z"/>',
  tip: '<circle cx="32" cy="22" r="3" fill="#fff"/>',
};

/** Rockets for `uses` boosts left (MK-65 QA round 2): 3 → all three, 2 → the outer two, 1 → the middle one. */
function rockets(uses: number): string {
  const shown = uses >= 3 ? [LEFT, RIGHT, MIDDLE] : uses === 2 ? [LEFT, RIGHT] : [MIDDLE];
  const tip = shown.includes(MIDDLE) ? MIDDLE.tip : '';
  return `${OUTLINE}${shown.map((r) => r.body).join('')}</g><g fill="#e63946">${shown.map((r) => r.flame).join('')}</g>${tip}`;
}

/** How Turbo Trio (MK-65) looks and sounds: three flame-tipped rockets; see `./sim.ts`. */
export default {
  id: 'turbo-trio',
  icon: rockets(3),
  // The slot shows one rocket per boost left, instead of a "×n" badge.
  iconFor: rockets,
  useSound: 'turbo-trio.use',
  sounds: {
    // A quick rising whistle over the boost whoosh.
    use: (synth, v) =>
      synth.tone(hz(67), 0.18, { type: 'square', slideTo: hz(79), volume: 0.12 * v }),
  },
} satisfies ItemView;
