// Local multiplayer in MK8 Mode (MK-148): a VS Race for 2–4 people on one screen. The Players
// screen sets how many; then each player picks a racer and a kart in turn on this device (P1's
// picks are `Mk8Flow.loadout`, P2–P4's `Mk8Flow.others`), and the race seats them in its first
// karts with MK8 CPUs filling the grid (`modes/vsField.ts`). Pure: no DOM.
import { MAX_PLAYERS } from '../input/slots';
import type { Loadout } from '../sim/types';
import type { Mk8Flow } from './ui/screens/session';

/** Most people in one MK8 VS Race on this screen: the game's split-screen limit (MK-145). */
export const MAX_MK8_PLAYERS = MAX_PLAYERS;

/** People racing: the Players screen's choice in a VS Race, else 1 (other modes are solo). */
export function flowPlayers(flow: Pick<Mk8Flow, 'mode' | 'players'>): number {
  if (flow.mode !== 'vs') return 1;
  const players = Math.round(flow.players ?? 1);
  return Math.min(Math.max(players, 1), MAX_MK8_PLAYERS);
}

/** The player slot picking a racer and kart now (0 = P1). */
export function pickingSlot(flow: Pick<Mk8Flow, 'picking'>): number {
  return flow.picking ?? 0;
}

/** Player `slot`'s loadout so far: P1's is `loadout`, the others' `others[slot - 1]`. */
export function slotLoadout(flow: Mk8Flow, slot: number): Loadout | undefined {
  return slot === 0 ? flow.loadout : flow.others?.[slot - 1];
}

/** Records player `slot`'s pick. */
export function setSlotLoadout(flow: Mk8Flow, slot: number, loadout: Loadout): void {
  if (slot === 0) {
    flow.loadout = loadout;
    return;
  }
  const others = [...(flow.others ?? [])];
  others[slot - 1] = loadout;
  flow.others = others;
}

/** Whether a player after `slot` still has to pick (the kart builder then goes back to the racers). */
export function nextPicker(flow: Mk8Flow, slot: number): number | undefined {
  return slot + 1 < flowPlayers(flow) ? slot + 1 : undefined;
}

/**
 * P2–P4's loadouts for the race (every player after P1 who picked), in slot order; empty in a
 * solo race. A player who hasn't picked (a scenario starting late) gets P1's racer's neighbour in
 * `fallback`.
 */
export function otherLoadouts(flow: Mk8Flow, fallback: (slot: number) => Loadout): Loadout[] {
  const players = flowPlayers(flow);
  return Array.from({ length: players - 1 }, (_, i) => flow.others?.[i] ?? fallback(i + 1));
}
