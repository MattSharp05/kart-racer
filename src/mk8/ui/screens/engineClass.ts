// MK8 engine class select (MK-119, the approved mockup's screen 6): the 50/100/150/200cc shields
// in a row, 200cc with a NEW tag, each with its description. OK records the class in the flow
// and goes on to the cup/course select; Back returns to the screen before.
import type { EngineClass } from '../../../sim/tuning';
import { DEFAULT_ENGINE_CLASS } from '../../flow';
import { art, Menu, menuScreen } from '../kit';
import type { Mk8ScreenFactory } from '../stack';
import { cupSelect } from './cupSelect';
import { modeInfo, type Mk8Context } from './session';
import './engineClass.css';

/** MK8's engine classes, left to right. */
export const MK8_CLASSES: readonly {
  cc: EngineClass;
  label: string;
  detail: string;
  sprite: string;
  isNew?: boolean;
}[] = [
  { cc: 50, label: '50cc', detail: 'Easy', sprite: 'u_cc50' },
  { cc: 100, label: '100cc', detail: 'Normal', sprite: 'u_cc100' },
  { cc: 150, label: '150cc', detail: 'Hard', sprite: 'u_cc150' },
  { cc: 200, label: '200cc', detail: 'Very fast', sprite: 'u_cc200', isNew: true },
];

export function engineClass(ctx: Mk8Context): Mk8ScreenFactory {
  return (stack) => {
    const { el, body } = menuScreen({
      name: 'cc',
      title: modeInfo(ctx.flow.mode ?? 'grand-prix').label,
      sub: 'Select a class',
      hints: [
        { button: 'a', label: 'OK', onPress: () => menu.confirm() },
        { button: 'b', label: 'Back', onPress: () => stack.back() },
      ],
    });
    body.classList.add('mk8-cc');
    const shields = MK8_CLASSES.map((c) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'mk8-tile mk8-shield';
      tile.dataset.cc = String(c.cc);
      tile.setAttribute('aria-label', `${c.label}, ${c.detail}`);
      const url = ctx.sprites(c.sprite);
      const picture = url ? art(url, c.label) : standIn(c.cc);
      const name = document.createElement('b');
      name.className = 'mk8-slant';
      name.textContent = c.label;
      const detail = document.createElement('small');
      detail.textContent = c.detail;
      tile.append(picture, name, detail);
      if (c.isNew) {
        const tag = document.createElement('span');
        tag.className = 'mk8-new';
        tag.textContent = 'NEW';
        tile.append(tag);
      }
      return tile;
    });
    const initial = MK8_CLASSES.findIndex(
      (c) => c.cc === (ctx.flow.engineClass ?? DEFAULT_ENGINE_CLASS),
    );
    const menu = new Menu({
      items: shields,
      columns: shields.length,
      initial: Math.max(0, initial),
      sounds: stack.sounds,
      onConfirm: (index) => {
        ctx.flow.engineClass = MK8_CLASSES[index]?.cc ?? DEFAULT_ENGINE_CLASS;
        stack.push(cupSelect(ctx));
      },
    });
    const row = document.createElement('div');
    row.className = 'mk8-cc-row';
    row.append(...shields);
    body.append(row);
    return { el, onKey: (e) => menu.handleKey(e) };
  };
}

/** No pack: a shield shape with the class's number (our own drawing, not MK8's emblem). */
function standIn(cc: EngineClass): HTMLElement {
  const shield = document.createElement('span');
  shield.className = 'mk8-art mk8-shield-stand-in';
  shield.dataset.cc = String(cc);
  shield.textContent = String(cc);
  return shield;
}
