// MK8 mode select (MK-116, the approved mockup's screen 3): Grand Prix, VS Race, Time Trial and
// Online as slanted tiles, the selected one's art in the side panel. OK records the mode in the
// flow and goes on to character select (MK-117); Back returns to the title.
import { art, Menu, menuScreen, panel, wideTile } from '../kit';
import type { Mk8ScreenFactory } from '../stack';
import { characterSelect } from './characterSelect';
import { MK8_MODES, type Mk8Context } from './session';
import './modeSelect.css';

export function modeSelect(ctx: Mk8Context): Mk8ScreenFactory {
  return (stack) => {
    const { el, body } = menuScreen({
      name: 'modes',
      title: 'Single Player',
      hints: [
        { button: 'a', label: 'OK', onPress: () => menu.confirm() },
        { button: 'b', label: 'Back', onPress: () => stack.back() },
      ],
    });
    body.classList.add('mk8-modes');
    const tiles = MK8_MODES.map((m) => {
      const tile = wideTile(m.label, m.detail, art(ctx.sprites(m.sprite), m.label));
      tile.dataset.mode = m.id;
      return tile;
    });
    const side = panel('mk8-modes-side');
    side.setAttribute('aria-hidden', 'true');
    const show = (index: number) => {
      const mode = MK8_MODES[index] ?? MK8_MODES[0];
      const picture = art(ctx.sprites(mode.sprite), mode.label);
      picture.classList.add('mk8-modes-art');
      side.replaceChildren(picture);
    };
    const initial = MK8_MODES.findIndex((m) => m.id === ctx.flow.mode);
    const menu = new Menu({
      items: tiles,
      initial: Math.max(0, initial),
      sounds: stack.sounds,
      onSelect: show,
      onConfirm: (index) => {
        const mode = MK8_MODES[index]?.id ?? 'grand-prix';
        ctx.flow.mode = mode;
        stack.push(characterSelect(ctx));
      },
    });
    body.append(div('mk8-modes-list', ...tiles), side);
    return { el, onKey: (e) => menu.handleKey(e) };
  };
}

function div(className: string, ...children: Node[]): HTMLDivElement {
  const node = document.createElement('div');
  node.className = className;
  node.append(...children);
  return node;
}
