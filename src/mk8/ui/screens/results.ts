// MK8 race results (MK-121, the approved mockup's screen 9): the course in the header band, then the
// finishing order as slanted rows sliding in one after another (place, racer icon, name, race
// time; the player's row yellow). In a Grand Prix a second phase follows: each row's points
// (+15, +12…) count up into its total and the rows re-sort into the standings. Then the choices
// (Next / Retry / Quit, by mode) show at the side. A (Enter, the bar's OK) skips the animation.
// Reduced motion, or a page opened paused (tests), shows the end at once. Not a menu-flow screen
// (no `screen` export): `raceScreens.ts` shows it in its own MK8 stack.
import { formatTime } from '../../../ui/hud/format';
import type { Mk8ResultChoice, Mk8ResultRow, Mk8StandingRow } from '../../results';
import { art, buttonBar, header, Menu } from '../kit';
import { menuAction } from '../kit/nav';
import type { SpriteSource } from '../kit/styleGuide';
import type { Mk8ScreenFactory } from '../stack';
import { CHARACTER_GRID } from './characterSelect';
import './results.css';

/** Each row's slide-in starts this long after the one above, ms (the mockup's 70). */
export const ROW_STAGGER_MS = 70;
/** A row's slide-in, ms; matches `mk8-res-in` in results.css. */
const ROW_IN_MS = 400;
/** One point of the count-up, ms (the mockup's 45). */
const COUNT_STEP_MS = 45;
/** The rows' move into the standings, ms; matches `.mk8-res-row.moving` in results.css. */
const RESORT_MS = 450;
/** A beat between the phases, ms. */
const BEAT_MS = 300;

export interface ResultsChoice {
  id: Mk8ResultChoice;
  label: string;
  onPress: () => void;
}

export interface ResultsOptions {
  title: string;
  sub: string;
  /** The race's rows, leader first. */
  rows: readonly Mk8ResultRow[];
  /** A Grand Prix: the standings after this race (the points phase). */
  standings?: readonly Mk8StandingRow[];
  choices: readonly ResultsChoice[];
  sprites: SpriteSource;
  /** Show the end straight away (reduced motion, tests). */
  instant: boolean;
}

/** Where the screen is: rows sliding in, points counting up, rows re-sorting, done. */
export type ResultsPhase = 'rows' | 'points' | 'standings' | 'done';

/** Each MK8 racer's icon by racer id (`mk8-mario` → `c_mario`). */
const ICONS = new Map(CHARACTER_GRID.map((c) => [c.racer.id, c.icon]));

export function resultsScreen(options: ResultsOptions): Mk8ScreenFactory {
  return (stack) => {
    const el = document.createElement('section');
    el.className = 'mk8-scr mk8-menu-bg mk8-scr-results';
    const body = document.createElement('div');
    body.className = 'mk8-body mk8-res';
    const table = document.createElement('div');
    table.className = 'mk8-res-table';
    table.setAttribute('role', 'list');
    const gp = options.standings !== undefined;
    table.classList.toggle('mk8-res-gp', gp);

    const rowEls = new Map<number, HTMLElement>();
    const totals = new Map<number, HTMLElement>();
    options.rows.forEach((row, i) => {
      const line = document.createElement('div');
      line.className = 'mk8-res-row';
      line.setAttribute('role', 'listitem');
      line.dataset.kart = String(row.kartId);
      line.classList.toggle('is-you', row.you);
      line.style.animationDelay = `${i * ROW_STAGGER_MS}ms`;
      const place = cell('span', 'mk8-res-n', String(row.position));
      const icon = ICONS.get(row.racer);
      const picture = art(icon && options.sprites(icon), row.name);
      picture.classList.add('mk8-res-icon');
      const name = cell('span', 'mk8-res-name', row.name);
      const time = cell('span', 'mk8-res-time', row.time !== undefined ? formatTime(row.time) : '');
      line.append(place, picture, name, time);
      const standing = options.standings?.find((s) => s.kartId === row.kartId);
      if (standing) {
        line.append(cell('span', 'mk8-res-plus', `+${standing.gained}`));
        const pts = cell('span', 'mk8-res-pts', String(standing.before));
        totals.set(row.kartId, pts);
        line.append(pts);
      }
      rowEls.set(row.kartId, line);
      table.append(line);
    });

    const choiceTiles = options.choices.map((choice) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'mk8-tile mk8-res-choice';
      tile.dataset.choice = choice.id;
      const label = document.createElement('b');
      label.textContent = choice.label;
      tile.append(label);
      return tile;
    });
    const choiceList = document.createElement('div');
    choiceList.className = 'mk8-res-choices';
    choiceList.append(...choiceTiles);
    const menu = new Menu({
      items: choiceTiles,
      sounds: stack.sounds,
      onConfirm: (index) => options.choices[index]?.onPress(),
    });
    menu.active = false;
    body.append(table, choiceList);

    let phase: ResultsPhase = 'rows';
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const setPhase = (next: ResultsPhase) => {
      phase = next;
      el.dataset.phase = next;
      if (next === 'done') menu.active = true;
    };

    /** Rows in standings order, renumbered, totals in: the Grand Prix's end. */
    const showStandings = () => {
      for (const s of options.standings ?? []) {
        const line = rowEls.get(s.kartId);
        if (!line) continue;
        const n = line.querySelector('.mk8-res-n');
        if (n) n.textContent = String(s.place);
        const pts = totals.get(s.kartId);
        if (pts) pts.textContent = String(s.total);
        table.append(line);
      }
    };

    /** Skips to the end (A during the animation, or no animation at all). */
    const finish = () => {
      for (const timer of timers) clearTimeout(timer);
      timers.length = 0;
      table.classList.add('is-settled');
      for (const line of rowEls.values()) line.classList.remove('moving');
      if (gp) showStandings();
      setPhase('done');
    };

    /** The points phase: +N shows, totals count up, then the rows move into the standings. */
    const countUp = () => {
      setPhase('points');
      const standings = options.standings ?? [];
      let steps = 0;
      for (const s of standings) {
        const pts = totals.get(s.kartId);
        if (!pts) continue;
        for (let v = 1; v <= s.gained; v++) {
          later(v * COUNT_STEP_MS, () => (pts.textContent = String(s.before + v)));
        }
        steps = Math.max(steps, s.gained);
      }
      later(steps * COUNT_STEP_MS + BEAT_MS, resort);
    };

    /** The rows glide from their race places to their standings places (FLIP). */
    const resort = () => {
      setPhase('standings');
      const from = new Map([...rowEls].map(([id, line]) => [id, line.getBoundingClientRect().top]));
      showStandings();
      for (const [id, line] of rowEls) {
        const dy = (from.get(id) ?? 0) - line.getBoundingClientRect().top;
        line.classList.remove('moving');
        line.style.transform = `translateY(${dy}px)`;
      }
      void table.offsetWidth;
      for (const line of rowEls.values()) {
        line.classList.add('moving');
        line.style.transform = '';
      }
      later(RESORT_MS, finish);
    };

    const ok = () => {
      if (phase === 'done') menu.confirm();
      else finish();
    };
    el.append(
      header(options.title, options.sub),
      body,
      buttonBar([{ button: 'a', label: 'OK', onPress: ok }]),
    );

    if (options.instant) finish();
    else {
      setPhase('rows');
      const slidIn = (options.rows.length - 1) * ROW_STAGGER_MS + ROW_IN_MS;
      later(slidIn + BEAT_MS, () => {
        table.classList.add('is-settled');
        if (gp) countUp();
        else setPhase('done');
      });
    }

    return {
      el,
      onKey: (e) => {
        const action = menuAction(e.key);
        // No going back from the results: only the choices leave them.
        if (action?.kind === 'back') {
          e.preventDefault();
          return true;
        }
        if (action?.kind === 'ok' && phase !== 'done') {
          e.preventDefault();
          finish();
          return true;
        }
        return phase === 'done' ? menu.handleKey(e) : action !== undefined;
      },
      dispose: () => {
        for (const timer of timers) clearTimeout(timer);
      },
    };
  };
}

function cell(tag: 'span', className: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
