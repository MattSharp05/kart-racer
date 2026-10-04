// MK8 VS Race settings (MK-131, PRD v3 flow 2): before the course select, the race's rules as MK8
// shows them, one row each with ◀ value ▶: the engine class, the items (normal, none, or mushrooms,
// shells or bananas only) and the CPU's difficulty. Up/Down pick a row, Left/Right (or the arrows,
// on touch) change it, OK records the rules in the flow and goes on to the cups; Back returns.
import type { EngineClass } from '../../../sim/tuning';
import { DEFAULT_ENGINE_CLASS } from '../../flow';
import {
  DEFAULT_VS_RULES,
  VS_CPU_CHOICES,
  VS_ITEM_CHOICES,
  type VsCpu,
  type VsItems,
} from '../../modes/vsRace';
import { Menu, menuScreen } from '../kit';
import type { Mk8ScreenFactory } from '../stack';
import { MK8_CLASSES } from './engineClass';
import type { Mk8Context, Mk8Screen } from './session';
import './vsSettings.css';

/** One row of the screen: its choices and the flow value it sets. */
interface SettingRow {
  id: 'cc' | 'items' | 'cpu';
  label: string;
  choices: readonly { label: string }[];
  index: number;
}

export function vsSettings(ctx: Mk8Context): Mk8ScreenFactory {
  return (stack) => {
    const { el, body } = menuScreen({
      name: 'vs',
      title: 'VS Race',
      sub: 'Rules',
      hints: [
        { button: 'a', label: 'OK', onPress: () => menu.confirm() },
        { button: 'b', label: 'Back', onPress: () => stack.back() },
      ],
    });
    body.classList.add('mk8-vs');
    const rules = { ...DEFAULT_VS_RULES, ...ctx.flow.vs };
    const cc = ctx.flow.engineClass ?? DEFAULT_ENGINE_CLASS;
    const rows: SettingRow[] = [
      {
        id: 'cc',
        label: 'Class',
        choices: MK8_CLASSES,
        index: Math.max(
          0,
          MK8_CLASSES.findIndex((c) => c.cc === cc),
        ),
      },
      {
        id: 'items',
        label: 'Items',
        choices: VS_ITEM_CHOICES,
        index: Math.max(
          0,
          VS_ITEM_CHOICES.findIndex((c) => c.id === rules.items),
        ),
      },
      {
        id: 'cpu',
        label: 'CPU',
        choices: VS_CPU_CHOICES,
        index: Math.max(
          0,
          VS_CPU_CHOICES.findIndex((c) => c.id === rules.cpu),
        ),
      },
    ];

    const values: HTMLElement[] = [];
    const tiles = rows.map((row, r) => {
      const tile = document.createElement('div');
      tile.className = 'mk8-tile mk8-vs-row';
      tile.dataset.row = row.id;
      const name = document.createElement('b');
      name.className = 'mk8-slant mk8-vs-label';
      name.textContent = row.label;
      const value = document.createElement('span');
      value.className = 'mk8-vs-value';
      values.push(value);
      tile.append(
        name,
        arrow('◀', 'Previous', () => change(r, -1)),
        value,
      );
      tile.append(arrow('▶', 'Next', () => change(r, 1)));
      return tile;
    });

    const show = (r: number) => {
      const row = rows[r];
      const value = values[r];
      const tile = tiles[r];
      if (!row || !value || !tile) return;
      value.textContent = row.choices[row.index]?.label ?? '';
      tile.dataset.value = String(row.index);
    };
    const change = (r: number, by: number) => {
      const row = rows[r];
      if (!row) return;
      menu.select(r, false);
      const n = row.choices.length;
      row.index = (row.index + by + n) % n;
      show(r);
      stack.sounds.play('ui/cursor');
    };

    const menu = new Menu({
      items: tiles,
      sounds: stack.sounds,
      onConfirm: () => {
        const [ccRow, itemsRow, cpuRow] = rows;
        ctx.flow.engineClass = (MK8_CLASSES[ccRow?.index ?? 0]?.cc ?? cc) as EngineClass;
        ctx.flow.vs = {
          items: (VS_ITEM_CHOICES[itemsRow?.index ?? 0]?.id ?? 'on') as VsItems,
          cpu: (VS_CPU_CHOICES[cpuRow?.index ?? 0]?.id ?? 'normal') as VsCpu,
        };
        stack.push(ctx.next('vs'));
      },
    });
    rows.forEach((_, r) => show(r));
    const list = document.createElement('div');
    list.className = 'mk8-vs-rows';
    list.append(...tiles);
    body.append(list);
    return {
      el,
      onKey: (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          change(menu.index, e.key === 'ArrowLeft' ? -1 : 1);
          return true;
        }
        return menu.handleKey(e);
      },
    };
  };
}

/** A ◀ / ▶ button: changes its row's value without the row's tap (which would confirm). */
function arrow(symbol: string, label: string, onPress: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.tabIndex = -1;
  button.className = 'mk8-vs-arrow';
  button.textContent = symbol;
  button.setAttribute('aria-label', label);
  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onPress();
  });
  return button;
}

/**
 * The VS Race settings (MK-131), only in a VS Race, where they take the engine class screen's
 * place; the `vs-settings` scenario start opens on it.
 */
export const screen: Mk8Screen = {
  id: 'vs',
  build: vsSettings,
  starts: { 'vs-settings': { mode: 'vs' } },
  skip: (flow) => flow.mode !== 'vs',
};
