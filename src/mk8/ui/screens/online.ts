// MK8 Mode's Online (MK-132): after character select and the kart builder, one tile that opens the
// game's rooms (create or join, then the lobby) as MK8 rooms, racing the kart just built. The cc
// and course are the room host's picks in the lobby, so the flow ends here.
import { DEFAULT_LOADOUT } from '../../flow';
import { art, Menu, menuScreen, wideTile } from '../kit';
import type { Mk8ScreenFactory } from '../stack';
import type { Mk8Context, Mk8Screen } from './session';

export function online(ctx: Mk8Context): Mk8ScreenFactory {
  return (stack) => {
    const { el, body } = menuScreen({
      name: 'online',
      title: 'Online',
      sub: 'Race friends in a room',
      hints: [
        { button: 'a', label: 'OK', onPress: () => menu.confirm() },
        { button: 'b', label: 'Back', onPress: () => stack.back() },
      ],
    });
    const rooms = wideTile(
      'Rooms',
      ctx.openRoom ? "Create a room, or join a friend's with its code" : 'Not available here',
      art(ctx.sprites('i_star'), 'Rooms'),
    );
    rooms.dataset.mode = 'rooms';
    rooms.disabled = !ctx.openRoom;
    const menu = new Menu({
      items: [rooms],
      sounds: stack.sounds,
      onConfirm: () => ctx.openRoom?.(ctx.flow.loadout ?? DEFAULT_LOADOUT),
    });
    body.append(rooms);
    return { el, onKey: (e) => menu.handleKey(e) };
  };
}

/** Online's rooms tile (MK-132), only for Online; the `online` scenario start opens on it. */
export const screen: Mk8Screen = {
  id: 'online',
  build: online,
  starts: { online: { mode: 'online' } },
  skip: (flow) => flow.mode !== 'online',
};
