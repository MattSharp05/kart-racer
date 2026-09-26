import { racers, type RacerContent } from '../../content/racers';
import { RacerPreview } from '../../render/racerPreview';
import type { KartId } from '../../sim/data/karts';
import { racerCard, statBars } from './racerCard';
import './racerPicker.css';

/** Most cards in a grid row: 10 racers make 2 rows of 5 (phones in landscape). */
const MAX_COLUMNS = 5;

export interface RacerPickerOptions {
  /** Selected at first (the first racer if it isn't registered). */
  initial: KartId;
  /** The selection moved (card, arrow key). */
  onChange?: (racer: KartId) => void;
  /** Enter, or the owner's Choose button via `choose()`. */
  onChoose: (racer: KartId) => void;
  /** While true the 3D preview holds still (paused tests and QA links). */
  isPaused?: () => boolean;
}

export interface RacerPicker {
  /** Add this to the page. */
  readonly element: HTMLElement;
  selected(): KartId;
  /** Chooses the selected racer. */
  choose(): void;
  /** Focuses the selected card. */
  focus(): void;
  /** Arrow keys move the selection, Enter chooses. Returns whether it used the key. */
  onKey(e: KeyboardEvent): boolean;
  /** Frees the 3D preview (its WebGL context). The owner must call it when it goes away. */
  dispose(): void;
}

/**
 * Racer select (MK-51), the part the kart select screen and the online lobby share: the selected
 * racer's turntable, name, tagline and stat bars, next to a grid with a card per registered racer
 * (ADR 0007: new racers appear by registering, nothing here lists them).
 */
export function createRacerPicker(options: RacerPickerOptions): RacerPicker {
  const list: readonly RacerContent[] = racers.list();
  const first = list[0];
  if (!first) throw new Error('No racers registered');
  let index = Math.max(
    0,
    list.findIndex((r) => r.id === options.initial),
  );
  const columns = Math.min(MAX_COLUMNS, Math.max(1, Math.ceil(list.length / 2)));

  const element = document.createElement('div');
  element.className = 'racer-picker';

  const detail = document.createElement('div');
  detail.className = 'racer-detail';
  detail.setAttribute('aria-live', 'polite');
  const turntable = document.createElement('div');
  turntable.className = 'racer-stage';
  const name = document.createElement('h3');
  const tagline = document.createElement('p');
  tagline.className = 'racer-tagline';
  const stats = document.createElement('div');
  detail.append(turntable, name, tagline, stats);

  const grid = document.createElement('div');
  grid.className = 'racer-grid';
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', 'Racers');
  grid.style.setProperty('--racer-columns', String(columns));
  const cards = list.map((racer, i) => racerCard(racer, () => select(i)));
  grid.append(...cards);
  element.append(detail, grid);

  let preview: RacerPreview | undefined;
  try {
    preview = new RacerPreview(turntable, options.isPaused);
  } catch {
    // No WebGL here: the cards and stats still work.
    turntable.hidden = true;
  }

  const current = () => list[index] ?? first;
  const render = () => {
    const racer = current();
    element.dataset.racer = racer.id;
    name.textContent = racer.name;
    tagline.textContent = racer.tagline;
    stats.replaceChildren(statBars(racer.stats));
    cards.forEach((card, i) => {
      card.setAttribute('aria-checked', String(i === index));
      card.tabIndex = i === index ? 0 : -1;
    });
    preview?.show(racer.id);
  };
  const select = (i: number) => {
    const changed = i !== index;
    index = i;
    render();
    cards[index]?.focus();
    if (changed) options.onChange?.(current().id);
  };
  /** Left/right wrap through the list; up/down move a row and stop at the edges. */
  const move = (delta: number, wrap: boolean) => {
    const next = index + delta;
    if (wrap) select((next + list.length) % list.length);
    else if (next >= 0 && next < list.length) select(next);
  };
  render();

  return {
    element,
    selected: () => current().id,
    choose: () => options.onChoose(current().id),
    focus: () => cards[index]?.focus(),
    onKey(e) {
      switch (e.key) {
        case 'ArrowLeft':
          move(-1, true);
          break;
        case 'ArrowRight':
          move(1, true);
          break;
        case 'ArrowUp':
          move(-columns, false);
          break;
        case 'ArrowDown':
          move(columns, false);
          break;
        case 'Enter': {
          // Enter on another button (Back, Leave…) is that button's click, not a choice.
          const focused = document.activeElement;
          if (focused instanceof HTMLButtonElement && !cards.includes(focused)) return false;
          options.onChoose(current().id);
          break;
        }
        default:
          return false;
      }
      e.preventDefault();
      return true;
    },
    dispose: () => preview?.dispose(),
  };
}
