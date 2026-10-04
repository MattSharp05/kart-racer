import { tuning } from '../../../../sim/tuning';
import type { KartState, SimEvent } from '../../../../sim/types';
import { mk8ItemSim } from '../sim';

export const COIN_ITEM = 'coin';

/**
 * Adds `count` coins to `kart` (MK-109's coins), never past `tuning.mk8.coins.max`, with a `coin`
 * event per coin (the pickup sound and sparkle; at the most it still plays, as on the track). A
 * kart on a track without coin lines starts from 0.
 */
export function gainCoins(kart: KartState, count: number, events: SimEvent[]): void {
  for (let i = 0; i < count; i += 1) {
    kart.coins = Math.min(tuning.mk8.coins.max, (kart.coins ?? 0) + 1);
    events.push({ type: 'coin', kartId: kart.id });
  }
}

/** The coin item (MK-126): `tuning.mk8.coinItemCoins` coins at once. Drawn by `./render.ts`. */
export default mk8ItemSim({
  id: COIN_ITEM,
  name: 'Coin',
  order: 400,
  onUse: (kart, _state, events) => gainCoins(kart, tuning.mk8.coinItemCoins, events),
});
