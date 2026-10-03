// MK8 character select (MK-117, the approved mockup's screen 4): the 12 racers' icons in a 4×3
// grid (blue tiles, yellow and P1-badged when selected) and, on the left, the selected racer in
// the Standard Kart turning slowly on a 3D stage, with the name plate and weight class. Moving the
// selection plays the name-appear sound and the racer's select voice line (silent until the pack
// has it); OK records the racer in the loadout and remembers it for next time, then goes on to
// the kart builder; Back returns to the mode select. Without a pack (or WebGL) the portrait is
// the racer's icon, or a stand-in initial.
import { MK8_RACERS } from '../../content/racers';
import { mk8RacerView } from '../../content/racers/render';
import type { WeightClass } from '../../content/racers/weightClass';
import { DEFAULT_LOADOUT } from '../../flow';
import { savedLoadout, savedRacer, saveLoadout } from '../../loadoutPrefs';
import { RacerPreview } from '../../render/preview';
import { art, Menu, menuScreen, nameplate, panel, squareTile } from '../kit';
import type { CHARACTER_SPRITES } from '../sprites';
import type { Mk8ScreenFactory } from '../stack';
import { kartBuilder } from './kartBuilder';
import type { Mk8Context } from './session';
import './characterSelect.css';

/** The grid's width (the mockup's 4 across). */
export const GRID_COLUMNS = 4;

/** Each racer's icon, by the pipeline's model id. */
const ICONS: Readonly<Record<string, (typeof CHARACTER_SPRITES)[number]>> = {
  mario: 'c_mario',
  luigi: 'c_luigi',
  peach: 'c_peach',
  daisy: 'c_daisy',
  yoshi: 'c_yoshi',
  toad: 'c_toad',
  'koopa-troopa': 'c_koopa',
  'shy-guy': 'c_shyguy',
  bowser: 'c_bowser',
  'donkey-kong': 'c_dk',
  wario: 'c_wario',
  waluigi: 'c_waluigi',
};

const WEIGHT_LABELS: Readonly<Record<WeightClass, string>> = {
  light: 'Light weight',
  medium: 'Medium weight',
  heavy: 'Heavy weight',
};

/** The racers in the grid's order (MK8's roster order, Mario first). */
export const CHARACTER_GRID = [...MK8_RACERS]
  .sort((a, b) => a.order - b.order)
  .map((racer) => {
    const view = mk8RacerView(racer.id);
    const icon = ICONS[view.model];
    if (!icon) throw new Error(`No icon for MK8 racer ${racer.id}`);
    return { racer, view, icon, weight: WEIGHT_LABELS[racer.weightClass] };
  });

/** What tests read (`window.__mk8.preview`): the 3D portrait's racer and how fast it came. */
export interface PreviewHooks {
  /** The racer on the 3D stage; undefined while the 2D portrait shows. */
  shown(): string | undefined;
  /** Milliseconds from the last move to its racer on the 3D stage (undefined until one is). */
  latency(): number | undefined;
  step(ticks: number): void;
}

export function characterSelect(ctx: Mk8Context): Mk8ScreenFactory {
  return (stack) => {
    const { el, body } = menuScreen({
      name: 'char',
      title: 'Choose your character',
      hints: [
        { button: 'a', label: 'OK', onPress: () => menu.confirm() },
        { button: 'b', label: 'Back', onPress: () => stack.back() },
      ],
    });
    body.classList.add('mk8-char');

    const portrait = panel('mk8-char-portrait');
    const still = document.createElement('div');
    still.className = 'mk8-char-still';
    const plate = nameplate('');
    portrait.append(still, plate.el);
    // Made once the pack's first racer is loaded: no pack, no WebGL context.
    let preview: RacerPreview | undefined;

    const tiles = CHARACTER_GRID.map(({ racer, icon }) => {
      const tile = squareTile(racer.name, art(ctx.sprites(icon), racer.name));
      tile.classList.add('mk8-char-tile');
      tile.dataset.racer = racer.id;
      const badge = document.createElement('span');
      badge.className = 'mk8-p1';
      badge.textContent = 'P1';
      tile.append(badge);
      return tile;
    });

    let selectedAt = 0;
    let latency: number | undefined;
    const show3d = (index: number) => {
      const entry = CHARACTER_GRID[index];
      if (!entry || !preview) return;
      const since = selectedAt;
      void preview.show(entry.view).then((ok) => {
        if (!ok || menu.index !== index) return;
        portrait.classList.add('has-3d');
        if (since) latency = performance.now() - since;
      });
    };
    const show = (index: number) => {
      const entry = CHARACTER_GRID[index] ?? CHARACTER_GRID[0];
      if (!entry) return;
      const picture = art(ctx.sprites(entry.icon), entry.racer.name);
      still.replaceChildren(picture);
      plate.set(entry.racer.name, entry.weight);
      // Restart the pop.
      plate.el.classList.remove('pop');
      void plate.el.offsetWidth;
      plate.el.classList.add('pop');
      portrait.classList.remove('has-3d');
      portrait.dataset.racer = entry.racer.id;
    };

    const remembered = ctx.flow.loadout?.racer ?? savedRacer(ctx.store);
    const initial = CHARACTER_GRID.findIndex(
      (c) => c.racer.id === (remembered ?? DEFAULT_LOADOUT.racer),
    );
    let opened = false;
    const menu = new Menu({
      items: tiles,
      columns: GRID_COLUMNS,
      initial: Math.max(0, initial),
      sounds: stack.sounds,
      moveSound: 'ui/name-appear',
      onSelect: (index) => {
        show(index);
        // The opening selection is quiet; every move after it speaks.
        if (opened) {
          selectedAt = performance.now();
          const entry = CHARACTER_GRID[index];
          if (entry) stack.sounds.voice?.(entry.view.model, 'select');
        }
        show3d(index);
      },
      onConfirm: (index) => {
        const racer = CHARACTER_GRID[index]?.racer.id ?? DEFAULT_LOADOUT.racer;
        // MK8 keeps your kart parts when you change racer (the saved ones, else its defaults).
        const loadout = savedLoadout(ctx.store, racer);
        ctx.flow.loadout = loadout;
        saveLoadout(ctx.store, loadout);
        stack.push(kartBuilder(ctx));
      },
    });

    opened = true;

    const grid = document.createElement('div');
    grid.className = 'mk8-char-grid';
    grid.append(...tiles);
    body.append(portrait, grid);

    let hooks: PreviewHooks | undefined;
    let closed = false;
    const open3d = () => {
      if (preview || closed) return;
      const made = new RacerPreview({ file: ctx.packFile, frozen: ctx.frozen });
      if (!made.available) {
        made.dispose();
        return;
      }
      preview = made;
      portrait.prepend(made.canvas);
      hooks = {
        shown: () => (portrait.classList.contains('has-3d') ? made.shown : undefined),
        latency: () => latency,
        step: (ticks) => made.step(ticks),
      };
      window.__mk8 = { sounds: [], ...window.__mk8, preview: hooks };
      show3d(menu.index);
    };
    const first = CHARACTER_GRID[menu.index];
    void ctx
      .loadCharacters(first?.view.model ?? '', open3d)
      .then(() => {
        if (closed) return;
        open3d();
        show3d(menu.index);
        return preview?.warm(CHARACTER_GRID.map((c) => c.view));
      })
      .catch(() => {
        // No pack or a file missing: the 2D portrait stays.
      });

    return {
      el,
      onKey: (e) => menu.handleKey(e),
      onShow: () => preview?.resume(),
      dispose: () => {
        closed = true;
        if (hooks && window.__mk8?.preview === hooks) delete window.__mk8.preview;
        preview?.dispose();
      },
    };
  };
}
