// MK8 cup and course select (MK-119, the approved mockup's screen 7): the cup emblems in a 2×2
// grid (the Mushroom Cup playable; Flower, Star and Special shown locked, "Later") and the
// selected cup's 4 course cards: preview art, course map, anti-gravity tag and Time Trial best
// ("—" until Time Trial records exist). Grand Prix: OK on a cup starts its GP (the cards preview
// its courses). VS Race and Time Trial: OK on a cup moves the cursor to its courses, and OK on a
// course starts it. Starting shows the course loading (progress bar), then the race. MK-130: each
// cup shows the best Grand Prix trophy won at this class, and in a Grand Prix the courses it skips
// (not drivable yet) say so. MK-131: each card shows the course's best Time Trial race at this
// class, and in VS Race and Time Trial a course not drivable yet is "Not installed" and can't start.
import { cupInfo, MK8_CUPS, type Mk8Course, type Mk8Cup } from '../../content/cups';
import { DEFAULT_ENGINE_CLASS, raceSetup } from '../../flow';
import { gpCourses } from '../../gp/grandPrix';
import { savedTrophy } from '../../gp/trophies';
import { courseRecord } from '../../modes/timeTrial';
import { formatTime } from '../../../ui/hud/format';
import { art, Menu, menuScreen, squareTile } from '../kit';
import type { Mk8ScreenFactory } from '../stack';
import type { Mk8Context, Mk8Screen } from './session';
import './cupSelect.css';

/** Shown where a course has no Time Trial best yet. */
export const NO_BEST_TIME = '—';
/** How long a locked cup shakes when chosen, ms (matches `mk8-refuse` in cupSelect.css). */
const REFUSE_MS = 300;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function cupSelect(ctx: Mk8Context): Mk8ScreenFactory {
  return (stack) => {
    const grandPrix = (ctx.flow.mode ?? 'grand-prix') === 'grand-prix';
    let phase: 'cup' | 'course' = 'cup';
    const { el: screen, body } = menuScreen({
      name: 'cup',
      title: 'Select a cup',
      sub: `${ctx.flow.engineClass ?? DEFAULT_ENGINE_CLASS}cc`,
      hints: [
        { button: 'a', label: grandPrix ? 'Start' : 'OK', onPress: () => active().confirm() },
        { button: 'b', label: 'Back', onPress: () => back() },
      ],
    });
    body.classList.add('mk8-cup');
    body.dataset.phase = phase;
    const title = screen.querySelector('.mk8-hdr h2');
    const okHint = screen.querySelector('.mk8-hint-a');
    const setOkLabel = (label: string) => {
      if (okHint?.lastChild) okHint.lastChild.textContent = label;
    };

    const engineClass = ctx.flow.engineClass ?? DEFAULT_ENGINE_CLASS;
    const cupTiles = MK8_CUPS.map((cup) => {
      const tile = squareTile(cup.locked ? `${cup.name} (later)` : cup.name, cupArt(ctx, cup));
      tile.classList.add('mk8-cup-tile');
      tile.dataset.cup = cup.id;
      if (cup.locked) {
        tile.classList.add('is-locked');
        tile.append(el('span', 'mk8-later', 'Later'));
      }
      // The best Grand Prix trophy won here at this class (MK-130).
      const trophy = savedTrophy(ctx.store, cup.id, engineClass);
      if (trophy) {
        const badge = el('span', 'mk8-cup-trophy');
        badge.dataset.trophy = trophy;
        badge.setAttribute('aria-label', `${trophy} trophy`);
        tile.append(badge);
      }
      return tile;
    });
    const cards = el('div', 'mk8-courses');
    let courseCards: HTMLButtonElement[] = [];

    const showCourses = (cup: Mk8Cup) => {
      // A locked cup previews nothing yet: its slots say "Later".
      const raced = cup.locked ? [] : gpCourses(cup.id);
      courseCards = cup.locked
        ? Array.from({ length: 4 }, () => lockedCard())
        : cup.courses.map((course) => {
            const card = courseCard(ctx, course, engineClass);
            // A Grand Prix skips the courses not drivable yet (MK-130); VS and Time Trial can't
            // start them (MK-131).
            if (!raced.includes(course.key)) {
              card.classList.add('is-skipped');
              card.append(el('span', 'mk8-skipped', 'Not installed'));
            }
            return card;
          });
      cards.classList.toggle('is-locked', cup.locked);
      cards.replaceChildren(...courseCards);
    };

    const start = (course: Mk8Course) => {
      ctx.flow.course = course.key;
      stack.push(courseLoading(ctx));
    };

    let courses: Menu | undefined;
    const cups = new Menu({
      items: cupTiles,
      columns: 2,
      initial: Math.max(
        0,
        MK8_CUPS.findIndex((c) => c.id === ctx.flow.cup),
      ),
      sounds: stack.sounds,
      moveSound: 'ui/course-roulette',
      onSelect: (index) => showCourses(cupAt(index)),
      canConfirm: (index) => !MK8_CUPS[index]?.locked,
      onRefuse: (index) => refuse(cupTiles[index]),
      onConfirm: (index) => {
        const cup = cupAt(index);
        ctx.flow.cup = cup.id;
        const firstKey = grandPrix ? gpCourses(cup.id)[0] : undefined;
        const first = cup.courses.find((c) => c.key === firstKey) ?? cup.courses[0];
        if (grandPrix) {
          if (first) start(first);
          return;
        }
        enterCourses();
      },
    });

    /** VS Race / Time Trial: the cursor moves to the chosen cup's courses. */
    const enterCourses = () => {
      phase = 'course';
      body.dataset.phase = phase;
      if (title) title.textContent = 'Select a course';
      setOkLabel('Start');
      cups.active = false;
      cupTiles[cups.index]?.classList.add('is-chosen');
      const cup = cupInfo(ctx.flow.cup ?? 'mushroom');
      courses = new Menu({
        items: courseCards,
        columns: 2,
        initial: Math.max(
          0,
          cup.courses.findIndex((c) => c.key === ctx.flow.course),
        ),
        sounds: stack.sounds,
        moveSound: 'ui/course-roulette',
        canConfirm: (index) => !courseCards[index]?.classList.contains('is-skipped'),
        onRefuse: (index) => refuse(courseCards[index]),
        onConfirm: (index) => {
          const course = cup.courses[index];
          if (course) start(course);
        },
      });
    };

    /** Back from the courses to the cups; from the cups, the screen before. */
    const back = () => {
      if (phase === 'cup') {
        stack.back();
        return;
      }
      stack.sounds.play('ui/back');
      phase = 'cup';
      body.dataset.phase = phase;
      if (title) title.textContent = 'Select a cup';
      setOkLabel('OK');
      if (courses) courses.active = false;
      courses = undefined;
      cups.active = true;
      cupTiles[cups.index]?.classList.remove('is-chosen');
      // Fresh cards without the course menu's selection.
      showCourses(cupAt(cups.index));
    };

    const active = () => courses ?? cups;

    const cupGrid = el('div', 'mk8-cups');
    cupGrid.append(...cupTiles);
    body.append(cupGrid, cards);
    return {
      el: screen,
      onKey: (e) => {
        if (phase === 'course' && (e.key === 'Escape' || e.key === 'Backspace')) {
          e.preventDefault();
          back();
          return true;
        }
        return active().handleKey(e);
      },
    };
  };
}

/** The cup at a grid index (the Mushroom Cup for one past the end). */
function cupAt(index: number): Mk8Cup {
  return MK8_CUPS[index] ?? cupInfo('mushroom');
}

/** A locked cup's shake (no decide sound: it can't be chosen). */
function refuse(tile: HTMLElement | undefined): void {
  if (!tile) return;
  tile.classList.remove('is-refused');
  void tile.offsetWidth;
  tile.classList.add('is-refused');
  window.setTimeout(() => tile.classList.remove('is-refused'), REFUSE_MS);
}

function cupArt(ctx: Mk8Context, cup: Mk8Cup): HTMLElement {
  const picture = art(ctx.sprites(cup.sprite), cup.name);
  if (picture.classList.contains('mk8-art-stand-in')) picture.dataset.cup = cup.id;
  return picture;
}

/** A course card: preview, anti-gravity tag, map, name and Time Trial best. */
function courseCard(ctx: Mk8Context, course: Mk8Course, engineClass: number): HTMLButtonElement {
  const card = el('button', 'mk8-tile mk8-course');
  card.type = 'button';
  card.dataset.course = course.key;
  card.tabIndex = -1;
  card.setAttribute('aria-label', course.name);
  const preview = ctx.sprites(`p_${course.key}`);
  if (preview) {
    const img = el('img', 'mk8-course-pv');
    img.src = preview;
    img.alt = '';
    img.draggable = false;
    card.append(img);
  } else {
    const standIn = el('span', 'mk8-course-pv mk8-course-pv-stand-in');
    standIn.dataset.course = course.key;
    card.append(standIn);
  }
  if (course.antiGravity) card.append(el('span', 'mk8-ag', 'Anti-gravity'));
  const map = ctx.sprites(`m_${course.key}`);
  if (map) {
    const img = el('img', 'mk8-course-map');
    img.src = map;
    img.alt = '';
    img.draggable = false;
    card.append(img);
  } else {
    card.append(el('span', 'mk8-course-map mk8-course-map-stand-in'));
  }
  const name = el('span', 'mk8-course-name');
  name.append(el('span', 'mk8-slant', course.name));
  const best = courseRecord(ctx.store, course.key, engineClass).race;
  const bestEl = el(
    'span',
    'mk8-course-best',
    `Best ${best ? formatTime(best.time) : NO_BEST_TIME}`,
  );
  if (best) bestEl.dataset.time = String(best.time);
  card.append(name, bestEl);
  return card;
}

function lockedCard(): HTMLButtonElement {
  const card = el('button', 'mk8-tile mk8-course is-locked');
  card.type = 'button';
  card.tabIndex = -1;
  card.setAttribute('aria-label', 'Later');
  card.append(el('span', 'mk8-later', 'Later'));
  return card;
}

/**
 * The course loading (MK-119): the course's preview, name and a progress bar while its pack files
 * and the item models load, then the race. Back cancels.
 */
export function courseLoading(ctx: Mk8Context): Mk8ScreenFactory {
  return (stack) => {
    const setup = raceSetup(ctx.flow);
    const course = cupInfo(setup.cup).courses.find((c) => c.key === setup.course);
    const name = course?.name ?? setup.course;
    let cancelled = false;
    const { el: screen, body } = menuScreen({
      name: 'course-loading',
      title: name,
      sub: `${setup.engineClass}cc`,
      hints: [{ button: 'b', label: 'Back', onPress: () => cancel() }],
    });
    const cancel = () => {
      // Not mid-wipe: the stack ignores Back then, and the race would never start.
      if (stack.transitioning) return;
      cancelled = true;
      stack.back();
    };
    body.classList.add('mk8-cload');
    const preview = ctx.sprites(`p_${setup.course}`);
    let picture: HTMLElement;
    if (preview) {
      const img = el('img', 'mk8-cload-pv');
      img.src = preview;
      img.alt = '';
      picture = img;
    } else {
      picture = el('span', 'mk8-cload-pv mk8-course-pv-stand-in');
      picture.dataset.course = setup.course;
    }
    const bar = el('div', 'mk8-cload-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    const fill = el('i', '');
    bar.append(fill);
    const label = el('p', 'mk8-cload-label', 'Loading…');
    body.append(picture, bar, label);
    const show = (fraction: number) => {
      const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
      fill.style.width = `${percent}%`;
      bar.setAttribute('aria-valuenow', String(percent));
    };
    show(0);
    ctx.loadCourse(setup.course, show).then(
      () => {
        if (cancelled) return;
        show(1);
        // Again: the course's own track is registered now if its pack files loaded (MK-105).
        ctx.startRace(raceSetup(ctx.flow));
      },
      (e: unknown) => {
        if (cancelled) return;
        label.textContent = `Couldn't load ${name}: ${e instanceof Error ? e.message : String(e)}`;
        label.classList.add('is-error');
      },
    );
    return {
      el: screen,
      onKey: (e) => {
        if (e.key !== 'Escape' && e.key !== 'Backspace') return false;
        e.preventDefault();
        cancel();
        return true;
      },
      dispose: () => {
        cancelled = true;
      },
    };
  };
}

/**
 * The cup/course select (MK-119), last before the race: the `cup` scenario start opens it for a
 * 150cc Grand Prix, `course` for a 150cc VS Race, `tt-course` for a Time Trial (MK-131).
 */
export const screen: Mk8Screen = {
  id: 'cup',
  build: cupSelect,
  starts: {
    cup: { mode: 'grand-prix', engineClass: 150 },
    course: { mode: 'vs', engineClass: 150 },
    // MK-131: a Time Trial's course select (its cards show the Time Trial bests).
    'tt-course': { mode: 'time-trial', engineClass: 150 },
  },
};
