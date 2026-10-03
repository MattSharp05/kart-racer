// MK8 kart builder (MK-118, the approved mockup's screen 5): Body, Tires and Glider reels, each
// showing the previous, current and next part, and a stats panel with the racer, five bars from
// MK8's stat table (`content/stats.ts`, MK-102) that slide as parts change, and a 3D preview of the
// racer in the kart. ←→ pick a column (the focused one has the yellow frame), ↑↓ turn its reel;
// on touch the arrows, a tap on the part above or below, or a swipe along the reel. OK saves the
// loadout (prefs) and goes on to the engine class, or straight to course select in Time Trial
// (Online stops here until its rooms exist).
import {
  MK8_BODIES,
  MK8_GLIDERS,
  MK8_TIRES,
  type Mk8Part,
  type PartKind,
} from '../../content/parts';
import { MK8_RACERS } from '../../content/racers';
import { loadoutStats, type Mk8Stat } from '../../content/stats';
import { savedLoadout, saveLoadout, savedRacer } from '../../loadoutPrefs';
import { KartPreview } from '../../render/kartPreview';
import type { Loadout } from '../../../sim/types';
import { art, menuScreen, panel } from '../kit';
import { menuAction } from '../kit/nav';
import type { Mk8ScreenFactory } from '../stack';
import { cupSelect } from './cupSelect';
import { engineClass } from './engineClass';
import type { Mk8Context } from './session';
import './kartBuilder.css';

/** The racer the builder starts on with nothing chosen or saved (MK8's first). */
export const FIRST_RACER = 'mk8-mario';

/** The three reels, left to right. */
export const KART_COLUMNS: readonly {
  kind: PartKind;
  key: 'body' | 'tires' | 'glider';
  label: string;
  parts: readonly Mk8Part[];
}[] = [
  { kind: 'body', key: 'body', label: 'Body', parts: MK8_BODIES },
  { kind: 'tires', key: 'tires', label: 'Tires', parts: MK8_TIRES },
  { kind: 'glider', key: 'glider', label: 'Glider', parts: MK8_GLIDERS },
];

/** The bars, top to bottom (MK8's menu leaves mini-turbo out). */
export const SHOWN_STATS: readonly { stat: Mk8Stat; label: string }[] = [
  { stat: 'speed', label: 'Speed' },
  { stat: 'acceleration', label: 'Acceleration' },
  { stat: 'weight', label: 'Weight' },
  { stat: 'handling', label: 'Handling' },
  { stat: 'traction', label: 'Traction' },
];

/** The top of MK8's stat scale: a full bar. */
export const STAT_MAX = 5.75;

/** A bar's width for `value` on MK8's 0.75–5.75 scale, percent of the track. */
export function barPercent(value: number): number {
  return (Math.min(Math.max(value, 0), STAT_MAX) / STAT_MAX) * 100;
}

/** The index `step` parts on from `index` in a reel of `count` (reels wrap, as MK8's do). */
export function turnReel(index: number, step: number, count: number): number {
  return (((index + step) % count) + count) % count;
}

/**
 * Pack sprites of the parts (`ui/sprites.ts`). Slim tires and the Paper Glider stand in for the
 * mockup's Roller and Super Glider, which have no models; their sprite cells aren't cut yet, so
 * they draw a stand-in.
 */
const PART_SPRITES: Readonly<Record<string, string>> = {
  'standard-kart': 'v_b_standard',
  'pipe-frame': 'v_b_pipe',
  'mach-8': 'v_b_mach8',
  'cat-cruiser': 'v_b_cat',
  'b-dasher': 'v_b_bdasher',
  'sports-coupe': 'v_b_coupe',
  'standard-tires': 'v_t_standard',
  'monster-tires': 'v_t_monster',
  'slick-tires': 'v_t_slick',
  'cloud-glider': 'v_g_cloud',
  'peach-parasol': 'v_g_parasol',
};

/** Racer icons (`ui/sprites.ts` CHARACTER_SPRITES). */
const RACER_SPRITES: Readonly<Record<string, string>> = {
  'mk8-mario': 'c_mario',
  'mk8-luigi': 'c_luigi',
  'mk8-peach': 'c_peach',
  'mk8-daisy': 'c_daisy',
  'mk8-yoshi': 'c_yoshi',
  'mk8-toad': 'c_toad',
  'mk8-koopa-troopa': 'c_koopa',
  'mk8-shy-guy': 'c_shyguy',
  'mk8-donkey-kong': 'c_dk',
  'mk8-waluigi': 'c_waluigi',
  'mk8-bowser': 'c_bowser',
  'mk8-wario': 'c_wario',
};

/** A swipe along a reel this far (CSS px) turns it one part. */
const SWIPE_PX = 28;

/** The racer and parts the builder opens on: the chosen racer in the last saved parts. */
export function startingLoadout(ctx: Pick<Mk8Context, 'flow' | 'store'>): Loadout {
  const racer = ctx.flow.loadout?.racer ?? savedRacer(ctx.store) ?? FIRST_RACER;
  return savedLoadout(ctx.store, racer);
}

/** One reel: its column, the part picked, and its elements. */
interface Reel {
  column: (typeof KART_COLUMNS)[number];
  index: number;
  col: HTMLElement;
  /** The previous, current and next part's slots. */
  slots: HTMLElement[];
  name: HTMLElement;
}

const partAt = (reel: Reel, step = 0): Mk8Part => {
  const { parts } = reel.column;
  const part = parts[turnReel(reel.index, step, parts.length)];
  if (!part) throw new Error(`MK8: no ${reel.column.kind} parts`);
  return part;
};

export function kartBuilder(ctx: Mk8Context): Mk8ScreenFactory {
  return (stack) => {
    const loadout = startingLoadout(ctx);
    let focus = 0;
    /** Whether the builder is on show (the 3D preview loads and turns only then). */
    let onShow = false;

    // Online stops here until its rooms come with their own ticket (as the stand-ins did).
    const goesOn = ctx.flow.mode !== 'online';
    const confirm = () => {
      if (!goesOn) return;
      const chosen = current();
      stack.sounds.play('ui/decide');
      saveLoadout(ctx.store, chosen);
      ctx.flow.loadout = chosen;
      onShow = false;
      preview.pause();
      stack.push(ctx.flow.mode === 'time-trial' ? cupSelect(ctx) : engineClass(ctx));
    };
    const { el, body } = menuScreen({
      name: 'kart',
      title: 'Customize',
      sub: '↑↓ change part · ←→ switch column',
      hints: [
        ...(goesOn ? [{ button: 'a' as const, label: 'OK', onPress: confirm }] : []),
        { button: 'b', label: 'Back', onPress: () => stack.back() },
      ],
    });
    body.classList.add('mk8-kb');

    // ---- the reels ----
    const reels: Reel[] = KART_COLUMNS.map((column, c) => {
      const col = document.createElement('div');
      col.className = 'mk8-kb-col';
      col.dataset.column = column.kind;
      const title = document.createElement('h3');
      title.className = 'mk8-slant';
      title.textContent = column.label;
      const up = arrow('up', `Previous ${column.label.toLowerCase()}`);
      const down = arrow('down', `Next ${column.label.toLowerCase()}`);
      const strip = document.createElement('div');
      strip.className = 'mk8-kb-reel';
      const slots = [-1, 0, 1].map((offset) => {
        const slot = document.createElement('div');
        slot.className = offset === 0 ? 'mk8-kb-slot is-current' : 'mk8-kb-slot';
        slot.dataset.offset = String(offset);
        // A tap on the part above or below turns the reel to it.
        if (offset !== 0) slot.addEventListener('click', () => turn(c, offset));
        return slot;
      });
      strip.append(...slots);
      const name = document.createElement('div');
      name.className = 'mk8-kb-name';
      col.append(title, up, strip, down, name);
      col.addEventListener('mousedown', (e) => e.preventDefault());
      col.addEventListener('click', () => setFocus(c, true));
      for (const [button, step] of [
        [up, -1],
        [down, 1],
      ] as const) {
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          setFocus(c);
          turn(c, step);
        });
      }
      swipe(strip, (step) => {
        setFocus(c);
        turn(c, step);
      });
      const index = Math.max(
        0,
        column.parts.findIndex((p) => p.id === loadout[column.key]),
      );
      return { column, index, col, slots, name };
    });
    const pick = (kind: PartKind) => {
      const reel = reels.find((r) => r.column.kind === kind);
      if (!reel) throw new Error(`MK8: no ${kind} reel`);
      return partAt(reel).id;
    };
    const current = (): Loadout => ({
      racer: loadout.racer,
      body: pick('body'),
      tires: pick('tires'),
      glider: pick('glider'),
    });

    // ---- the stats panel ----
    const stats = panel('mk8-kb-stats');
    const who = document.createElement('div');
    who.className = 'mk8-kb-who';
    const racerName = MK8_RACERS.find((r) => r.id === loadout.racer)?.name ?? loadout.racer;
    const racerSprite = RACER_SPRITES[loadout.racer];
    const whoName = document.createElement('b');
    whoName.className = 'mk8-slant';
    whoName.textContent = racerName;
    who.dataset.racer = loadout.racer;
    who.append(art(racerSprite && ctx.sprites(racerSprite), racerName), whoName);
    const bars = SHOWN_STATS.map(({ stat, label }) => {
      const row = document.createElement('div');
      row.className = 'mk8-kb-stat';
      row.dataset.stat = stat;
      const name = document.createElement('span');
      name.textContent = label;
      const track = document.createElement('div');
      track.className = 'mk8-kb-bar';
      const fill = document.createElement('i');
      track.append(fill);
      row.append(name, track);
      return { stat, row, fill };
    });
    const strip = document.createElement('div');
    strip.className = 'mk8-kb-strip';
    const preview = new KartPreview(ctx.files, ctx.frozen);
    preview.el.append(strip);
    stats.append(who, ...bars.map((b) => b.row), preview.el);

    const columns = document.createElement('div');
    columns.className = 'mk8-kb-cols';
    columns.append(...reels.map((r) => r.col));
    body.append(columns, stats);

    // ---- drawing ----
    const partArt = (part: Mk8Part) => {
      const sprite = PART_SPRITES[part.id];
      return art(sprite && ctx.sprites(sprite), part.name);
    };
    const drawReel = (reel: Reel) => {
      reel.slots.forEach((slot, i) => {
        const part = partAt(reel, i - 1);
        slot.dataset.part = part.id;
        slot.replaceChildren(partArt(part));
      });
      const part = partAt(reel);
      reel.name.textContent = part.name;
      reel.col.dataset.part = part.id;
    };
    const drawStats = () => {
      const chosen = current();
      const values = loadoutStats(chosen);
      for (const { stat, row, fill } of bars) {
        row.dataset.value = String(values[stat]);
        fill.style.width = `${barPercent(values[stat])}%`;
      }
      // No pack: the parts in a row (the mockup's strip); the 3D kart covers it once loaded.
      strip.replaceChildren(
        ...reels.map((reel) => {
          const item = partArt(partAt(reel));
          item.dataset.kind = reel.column.kind;
          return item;
        }),
      );
      body.dataset.loadout = [chosen.racer, chosen.body, chosen.tires, chosen.glider].join(' ');
      if (onShow) void preview.show(chosen);
    };
    const setFocus = (c: number, sound = false) => {
      if (sound && c !== focus) stack.sounds.play('ui/cursor');
      focus = c;
      reels.forEach((reel, i) => {
        reel.col.classList.toggle('is-focused', i === c);
        if (i === c) reel.col.setAttribute('aria-current', 'true');
        else reel.col.removeAttribute('aria-current');
      });
      // MK8 opens the glider while you pick one.
      preview.setGliderOpen(reels[c]?.column.kind === 'glider');
    };
    const turn = (c: number, step: number) => {
      const reel = reels[c];
      if (!reel) return;
      reel.index = turnReel(reel.index, step, reel.column.parts.length);
      stack.sounds.play('ui/cursor');
      const slot = reel.slots[1];
      if (slot) {
        // Restart the slide even when the last one's class is still on.
        slot.classList.remove('is-turning-up', 'is-turning-down');
        void slot.offsetWidth;
        slot.classList.add(step > 0 ? 'is-turning-up' : 'is-turning-down');
      }
      drawReel(reel);
      drawStats();
    };

    const appear = () => {
      onShow = true;
      preview.resume();
      void preview.show(current());
    };
    reels.forEach(drawReel);
    setFocus(0);
    drawStats();
    // A scenario opening deeper in the menus pushes the next screen straight over this one (in
    // the same task): then the preview waits until Back shows the builder.
    queueMicrotask(() => {
      if (!el.hidden) appear();
    });

    return {
      el,
      onKey: (e) => {
        const action = menuAction(e.key);
        if (!action || action.kind === 'back') return false;
        e.preventDefault();
        if (action.kind === 'ok') confirm();
        else if (action.key === 'ArrowLeft' || action.key === 'ArrowRight') {
          const step = action.key === 'ArrowRight' ? 1 : -1;
          setFocus(turnReel(focus, step, reels.length), true);
        } else turn(focus, action.key === 'ArrowDown' ? 1 : -1);
        return true;
      },
      onShow: appear,
      dispose: () => preview.dispose(),
    };
  };
}

function arrow(direction: 'up' | 'down', label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.tabIndex = -1;
  button.className = `mk8-kb-arrow mk8-kb-${direction}`;
  button.setAttribute('aria-label', label);
  return button;
}

/** Calls `onTurn(±1)` for a vertical swipe along `reel`: up shows the next part, down the previous. */
function swipe(reel: HTMLElement, onTurn: (step: number) => void): void {
  let startY: number | undefined;
  let swiped = false;
  reel.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    swiped = false;
  });
  reel.addEventListener('pointermove', (e) => {
    if (startY === undefined) return;
    // Released somewhere we didn't hear: a move with no button down is no swipe.
    if (e.buttons === 0) {
      startY = undefined;
      return;
    }
    const dy = e.clientY - startY;
    if (Math.abs(dy) < SWIPE_PX) return;
    onTurn(dy < 0 ? 1 : -1);
    if (!swiped) {
      // A swipe: its release comes back here even off the reel. (Not on press: a captured
      // pointer's click would go to the reel, not the part tapped.)
      try {
        reel.setPointerCapture(e.pointerId);
      } catch {
        // Not an active pointer (a synthetic event): the button check above covers it.
      }
    }
    swiped = true;
    // A long swipe turns on, one part per SWIPE_PX.
    startY = e.clientY;
  });
  const end = () => (startY = undefined);
  reel.addEventListener('pointerup', end);
  reel.addEventListener('pointercancel', end);
  // The tap that ends a swipe doesn't also pick the slot under it.
  reel.addEventListener(
    'click',
    (e) => {
      if (swiped) {
        e.stopPropagation();
        swiped = false;
      }
    },
    true,
  );
  // Touch scrolling would take the gesture otherwise.
  reel.style.touchAction = 'none';
}
