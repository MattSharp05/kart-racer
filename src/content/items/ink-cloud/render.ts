import { hz } from '../../../audio/synth';
import type { ItemView } from '../views';
import { inkOpacity } from './sim';
import './ink.css';

/** A circle of ink on the screen, in a 100×100 box stretched over the whole screen. */
export interface InkBlot {
  x: number;
  y: number;
  r: number;
}

/**
 * The big splats (x, y, radius). They sit in the top two thirds and the middle, clear of the
 * bottom corners where the touch stick and buttons are (MK-68 Mobile AC) and of the right edge
 * (the pause button).
 */
const SPLATS: readonly InkBlot[] = [
  { x: 24, y: 26, r: 18 },
  { x: 58, y: 20, r: 15 },
  { x: 44, y: 48, r: 17 },
  { x: 73, y: 29, r: 9 },
  { x: 12, y: 56, r: 9 },
  { x: 63, y: 46, r: 9 },
];
/** Droplets thrown out round each splat. */
const DROPLETS = 5;

/** Every blot of ink: each splat and its droplets (spread by a fixed pattern, not at random). */
export const INK_BLOTS: readonly InkBlot[] = SPLATS.flatMap((splat, i) => [
  splat,
  ...Array.from({ length: DROPLETS }, (_, k) => {
    const angle = i * 1.7 + k * 1.3;
    const distance = splat.r * (1.05 + 0.25 * (k % 2));
    return {
      x: splat.x + Math.cos(angle) * distance,
      y: splat.y + Math.sin(angle) * distance,
      r: splat.r * (0.22 + 0.08 * (k % 3)),
    };
  }),
]);

const round = (n: number) => Math.round(n * 10) / 10;

/** The splats as SVG: dark ink with a purple sheen and a highlight on each big splat. */
const INK_SVG = `<svg class="ink-cloud-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><g fill="#140f24">${INK_BLOTS.map(
  (b) => `<circle cx="${round(b.x)}" cy="${round(b.y)}" r="${round(b.r)}"/>`,
).join(
  '',
)}</g><g fill="#3d2a6b" opacity="0.6">${SPLATS.map((s) => `<circle cx="${s.x - s.r * 0.25}" cy="${s.y - s.r * 0.25}" r="${round(s.r * 0.45)}"/>`).join('')}</g></svg>`;

/** The icon's blots and drips (drawn twice: a pale outline, then the ink). */
const ICON_SHAPES =
  '<circle cx="24" cy="28" r="13"/><circle cx="38" cy="22" r="14"/><circle cx="46" cy="34" r="11"/><circle cx="30" cy="38" r="11"/><path d="M22 44v10a3 3 0 0 0 6 0V44zM38 44v6a3 3 0 0 0 6 0v-6z"/><circle cx="12" cy="18" r="3"/><circle cx="54" cy="16" r="2.5"/>';

/** How the Ink Cloud (MK-68) looks and sounds; see `./sim.ts`. */
export default {
  id: 'ink-cloud',
  // A dark ink cloud with drips, outlined so it reads on the slot.
  icon: `<g fill="#c9b8ff" stroke="#c9b8ff" stroke-width="5">${ICON_SHAPES}</g><g fill="#140f24">${ICON_SHAPES}</g><circle cx="33" cy="20" r="4" fill="#4b3585"/>`,
  useSound: 'ink-cloud.use',
  sounds: {
    // A squirt: a low bloop falling away, and a spray.
    use: (synth, v) => {
      synth.tone(hz(55), 0.18, { type: 'sine', slideTo: hz(43), volume: 0.28 * v });
      synth.whoosh(0.25, { volume: 0.2 * v, from: 1200, to: 300, q: 1, at: 0.05 });
    },
    // Ink hits a kart ahead: a wet splat.
    splat: (synth, v) => synth.whoosh(0.3, { volume: 0.3 * v, from: 450, to: 140, q: 0.8 }),
  },
  overlays: {
    // Ink over about 40% of your screen while you're inked, fading out as it wears off.
    'ink-cloud': { className: 'ink-cloud-splats', html: INK_SVG, opacity: inkOpacity },
  },
} satisfies ItemView;
