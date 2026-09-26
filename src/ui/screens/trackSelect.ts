import type { TrackContent } from '../../content/tracks';
import type { TrackRecord } from '../../game/storage/records';
import { trackCard } from '../components/trackCard';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './trackSelect.css';

export interface TrackSelectProps {
  /** The tracks on offer, in menu order. */
  tracks: readonly TrackContent[];
  /** Selected at first (the first track if it isn't offered). */
  initial: string;
  /** The player's records on a track at the chosen engine class. */
  recordOf: (trackId: string) => TrackRecord;
  /** The engine class the records are for, e.g. "100cc". */
  classLabel: string;
  onChoose: (trackId: string) => void;
  onBack: () => void;
}

declare module '../router' {
  interface ScreenProps {
    trackSelect: TrackSelectProps;
  }
}

/**
 * Track select (MK-50): a card per track (outline, name, hazard, records). Arrow keys (or a tap)
 * pick, Enter or Race goes on, Esc goes back.
 */
registerScreen('trackSelect', (panel, props) => {
  const list = props.tracks;
  let index = Math.max(
    0,
    list.findIndex((t) => t.id === props.initial),
  );
  const grid = document.createElement('div');
  grid.className = 'track-grid';
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', 'Tracks');
  const cards = list.map((track, i) => trackCard(track, props.recordOf(track.id), () => select(i)));
  grid.append(...cards);

  const current = () => list[index];
  const render = () => {
    grid.dataset.track = current()?.id ?? '';
    cards.forEach((card, i) => {
      card.setAttribute('aria-checked', String(i === index));
      card.tabIndex = i === index ? 0 : -1;
    });
  };
  const select = (i: number) => {
    index = i;
    render();
    const card = cards[index];
    card?.focus();
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const choose = () => {
    const track = current();
    if (track) props.onChoose(track.id);
  };
  /** Cards per row as laid out now: 3 in the grid, all of them in the phones' single row. */
  const columns = () => {
    const top = cards[0]?.offsetTop;
    return Math.max(1, cards.filter((c) => c.offsetTop === top).length);
  };
  /** Left/right wrap through the list; up/down move a row and stop at the edges. */
  const move = (delta: number, wrap: boolean) => {
    const next = index + delta;
    if (wrap) select((next + list.length) % list.length);
    else if (next >= 0 && next < list.length) select(next);
  };
  render();

  const note = document.createElement('p');
  note.className = 'track-select-note';
  note.textContent = `Your records at ${props.classLabel}`;
  panel.append(
    row('track-select-head', heading('h2', 'Choose a track'), note),
    grid,
    row('actions', button('Back', props.onBack), button('Race!', choose, 'primary')),
  );
  select(index);
  return {
    onKey: (e) => {
      switch (e.key) {
        case 'ArrowLeft':
          move(-1, true);
          break;
        case 'ArrowRight':
          move(1, true);
          break;
        case 'ArrowUp':
          move(-columns(), false);
          break;
        case 'ArrowDown':
          move(columns(), false);
          break;
        case 'Enter': {
          // Enter on Back is Back's click, not a choice.
          const focused = document.activeElement;
          if (focused instanceof HTMLButtonElement && !cards.includes(focused)) return;
          choose();
          break;
        }
        case 'Escape':
          props.onBack();
          break;
        default:
          return;
      }
      e.preventDefault();
    },
  };
});
