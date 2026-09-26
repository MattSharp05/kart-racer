import type { ItemContent } from '..';
import { applyEffect, hasEffect } from '../../../sim/items/effects';
import {
  blockItems,
  hitKarts,
  spawnEntity,
  targetAhead,
  touchKarts,
} from '../../../sim/items/entities';

/** Ticks per second (the sim runs at 60 Hz). */
const S = 60;
/** The shield lasts this long and blocks this many hits. */
export const SHIELD_TICKS = 6 * S;
export const SHIELD_HITS = 1;
/** Driving through the puddle inks your screen this long. */
export const INK_TICKS = 3 * S;

/**
 * Test kit (MK-52): the worked example of the item framework, and the template for new items.
 * Dev only (`testOnly`: never handed out; `?scenario=item-framework-test` gives it). It has 3 uses:
 * 1. a homing bolt (an entity chasing the nearest kart, bouncing off walls, blocked by items),
 * 2. a boomerang (flies out, comes back to you, knocks over everyone on the way),
 * 3. a shield on you (a kart effect that blocks one hit) plus an ink puddle behind you (an area
 *    that puts an ink effect on whoever drives through: the overlay on their screen).
 * Its look, sounds and overlays are in `./render.ts`.
 */
export default {
  id: 'test-kit',
  name: 'Test kit',
  order: 1000,
  testOnly: true,
  // Never in the roulette (new real items also start at 0 until their tickets set their odds).
  odds: [0, 0, 0, 0, 0, 0, 0, 0],
  uses: 3,
  // `kart.item.uses` is already lowered here: 2 left = the first use.
  onUse: (kart, state, events) => {
    if (kart.item.uses === 2) spawnEntity(state, 'test-kit-bolt', kart);
    else if (kart.item.uses === 1) spawnEntity(state, 'test-kit-boomerang', kart);
    else {
      applyEffect(kart, 'test-kit-shield', SHIELD_TICKS, state, events, { data: [SHIELD_HITS] });
      spawnEntity(state, 'test-kit-puddle', kart);
    }
  },
  // AI: don't waste a use while shielded.
  aiUse: (kart) => !hasEffect(kart, 'test-kit-shield'),
  effects: [
    {
      id: 'test-kit-shield',
      // Blocks a hit and uses one charge (data[0]); ends when the charges run out.
      onHit: (kart, effect, _hit, events) => {
        effect.data[0] = (effect.data[0] ?? 0) - 1;
        if (effect.data[0] <= 0) effect.ticksLeft = 0;
        events.push({ type: 'itemFx', kartId: kart.id, item: 'test-kit', fx: 'pop' });
        return true;
      },
    },
    // Nothing to simulate: its view draws ink on the inked player's screen while it lasts.
    { id: 'test-kit-ink' },
  ],
  entities: [
    {
      id: 'test-kit-bolt',
      movement: { type: 'homing', target: targetAhead, turnRate: 4, followTrackBeyond: 25 },
      speed: 1.4,
      lifeTicks: 8 * S,
      radius: 1.6,
      spawnDistance: 2.5,
      walls: 'bounce',
      maxBounces: 2,
      ownerImmuneTicks: 18,
      collide: [blockItems, hitKarts()],
    },
    {
      id: 'test-kit-boomerang',
      movement: { type: 'returning', outTicks: S, turnRate: 5 },
      speed: 1.25,
      lifeTicks: 6 * S,
      radius: 1.6,
      spawnDistance: 2.5,
      walls: 'ghost',
      ownerImmuneTicks: 18,
      collide: [hitKarts({ pierce: true })],
    },
    {
      id: 'test-kit-puddle',
      movement: { type: 'area' },
      speed: 0,
      lifeTicks: 10 * S,
      radius: 2.5,
      spawnDistance: -3,
      walls: 'ghost',
      ownerImmuneTicks: S,
      collide: [
        touchKarts((entity, kart, { state, events }) => {
          applyEffect(kart, 'test-kit-ink', INK_TICKS, state, events, { by: entity.ownerId });
          events.push({ type: 'itemFx', kartId: kart.id, item: 'test-kit', fx: 'splat' });
          return true;
        }),
      ],
    },
  ],
} satisfies ItemContent;
