// MK8 mode select (MK-116, the approved mockup's screen 3): Grand Prix, VS Race, Time Trial and
// Online as slanted tiles, the selected one's art in the side panel. OK records the mode in the
// flow and goes on to character select; Back returns to the title.
import { art, Menu, menuScreen, panel, wideTile } from '../kit';
import type { Mk8ScreenFactory } from '../stack';
import { MK8_MODES, modeInfo, type Mk8Context, type Mk8GameMode } from './session';
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
        stack.push(nextScreen(mode));
      },
    });
    body.append(div('mk8-modes-list', ...tiles), side);
    return { el, onKey: (e) => menu.handleKey(e) };
  };
}

/**
 * Where a mode leads: character select, which a later ticket builds. Until then a stand-in that
 * shows the mode it was given.
 */
function nextScreen(mode: Mk8GameMode): Mk8ScreenFactory {
  return (stack) => {
    const { el, body } = menuScreen({
      name: 'character-next',
      title: 'Choose your character',
      sub: modeInfo(mode).label,
      hints: [{ button: 'b', label: 'Back', onPress: () => stack.back() }],
    });
    body.classList.add('mk8-modes-next');
    body.dataset.mode = mode;
    const note = panel('mk8-modes-note');
    note.textContent = `${modeInfo(mode).label}: character select is on the way.`;
    body.append(note);
    return { el };
  };
}

function div(className: string, ...children: Node[]): HTMLDivElement {
  const node = document.createElement('div');
  node.className = className;
  node.append(...children);
  return node;
}
