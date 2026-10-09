// MK8 Players (MK-148): how many people race a VS Race on this screen, 1–4, before character
// select. Each tile shows its players' badges in their split-screen colours. OK records the count
// in the flow (P1 picks first) and goes on to character select; Back returns to the mode select.
// Only in a VS Race: the other modes are solo.
import { playerLabel, playerSlotColour } from '../../../input/slots';
import { flowPlayers, MAX_MK8_PLAYERS } from '../../localPlayers';
import { Menu, menuScreen, wideTile } from '../kit';
import type { Mk8ScreenFactory } from '../stack';
import type { Mk8Context, Mk8Screen } from './session';
import './players.css';

/** The tiles' details, by player count. */
const DETAILS = [
  'Race the CPUs on your own',
  'Split screen, top and bottom',
  'Split screen in quarters, the map in the fourth',
  'Split screen in quarters',
];

export function playersSelect(ctx: Mk8Context): Mk8ScreenFactory {
  return (stack) => {
    const { el, body } = menuScreen({
      name: 'players',
      title: 'VS Race',
      sub: 'Players · each picks a racer and kart in turn',
      hints: [
        { button: 'a', label: 'OK', onPress: () => menu.confirm() },
        { button: 'b', label: 'Back', onPress: () => stack.back() },
      ],
    });
    body.classList.add('mk8-players');
    const tiles = Array.from({ length: MAX_MK8_PLAYERS }, (_, i) => {
      const count = i + 1;
      const label = count === 1 ? '1 Player' : `${count} Players`;
      const tile = wideTile(label, DETAILS[i] ?? '', badges(count));
      tile.dataset.players = String(count);
      return tile;
    });
    const menu = new Menu({
      items: tiles,
      initial: flowPlayers({ mode: 'vs', players: ctx.flow.players }) - 1,
      sounds: stack.sounds,
      onConfirm: (index) => {
        ctx.flow.players = index + 1;
        ctx.flow.picking = 0;
        // Fewer players than last time: the extra picks go.
        ctx.flow.others = (ctx.flow.others ?? []).slice(0, index);
        stack.push(ctx.next('players'));
      },
    });
    const list = document.createElement('div');
    list.className = 'mk8-players-list';
    list.append(...tiles);
    body.append(list);
    return { el, onKey: (e) => menu.handleKey(e) };
  };
}

/** P1…Pn badges in the players' colours: a tile's picture. */
function badges(count: number): HTMLElement {
  const row = document.createElement('span');
  row.className = 'mk8-art mk8-players-badges';
  for (let slot = 0; slot < count; slot += 1) {
    const badge = document.createElement('span');
    badge.className = 'mk8-players-badge';
    badge.textContent = playerLabel(slot);
    badge.style.background = playerSlotColour(slot);
    row.append(badge);
  }
  return row;
}

/** The Players screen (MK-148); the `players` scenario start opens on it for a VS Race. */
export const screen: Mk8Screen = {
  id: 'players',
  build: playersSelect,
  starts: { players: { mode: 'vs', players: 2 } },
  skip: (flow) => flow.mode !== 'vs',
};
