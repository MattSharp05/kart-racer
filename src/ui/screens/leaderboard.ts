import { colourHex, isColourId } from '../../game/profile';
import type { Board, BoardRow } from '../../records/leaderboard';
import { racerSwatch } from '../components/racerCard';
import { formatTime } from '../hud/format';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './leaderboard.css';

/** A track tab: its id and name (the registered, non-test tracks, MK-50). */
export interface LeaderboardTrack {
  id: string;
  name: string;
}

export interface LeaderboardProps {
  tracks: readonly LeaderboardTrack[];
  engineClasses: readonly number[];
  /** The board shown first (the race just run, or the last menu picks). */
  track: string;
  engineClass: number;
  /** One board with this device's row; null when the leaderboard is unavailable. */
  load(trackId: string, engineClass: number): Promise<Board | null>;
  onBack(): void;
}

declare module '../router' {
  interface ScreenProps {
    leaderboard: LeaderboardProps;
  }
}

const ms = (value: number) => formatTime(value / 1000);

/**
 * Leaderboards (MK-56, PRD v2 flow 4): track and engine class tabs over one board: the top 20
 * (rank, racer, nickname in the player's colour, race time, best lap) with your row pinned below
 * when you're further down. Loading, empty ("Be the first!") and unavailable states.
 */
registerScreen('leaderboard', (panel, props) => {
  const { tracks, engineClasses, load, onBack } = props;
  let trackId = tracks.some((t) => t.id === props.track) ? props.track : (tracks[0]?.id ?? '');
  let engineClass = engineClasses.includes(props.engineClass)
    ? props.engineClass
    : (engineClasses[0] ?? 0);
  /** Bumped on every tab change (and on close): a board that arrives late is dropped. */
  let request = 0;

  const trackTabs = tabs(
    'track-tabs',
    'Track',
    tracks.map((t) => ({ key: t.id, label: t.name })),
    (key) => select(key, engineClass),
  );
  const classTabs = tabs(
    'class-tabs',
    'Engine class',
    engineClasses.map((cc) => ({ key: String(cc), label: `${cc}cc` })),
    (key) => select(trackId, Number(key)),
  );
  const body = document.createElement('div');
  body.className = 'leaderboard-body';
  body.setAttribute('aria-live', 'polite');
  // Back, the title and the class tabs share the top line, so the list gets the height on phones.
  panel.append(
    row(
      'leaderboard-top',
      button('Back', onBack, 'back'),
      heading('h2', 'Leaderboards'),
      classTabs.element,
    ),
    trackTabs.element,
    body,
  );

  function select(track: string, cc: number): void {
    trackId = track;
    engineClass = cc;
    trackTabs.mark(trackId);
    classTabs.mark(String(engineClass));
    const mine = (request += 1);
    body.dataset.state = 'loading';
    body.replaceChildren(message('Loading…'));
    void load(trackId, engineClass).then((board) => {
      if (mine === request) show(board);
    });
  }

  function show(board: Board | null): void {
    if (!board) {
      body.dataset.state = 'offline';
      body.replaceChildren(
        message('Leaderboard unavailable'),
        message('Check your connection and try again later.', 'leaderboard-note'),
      );
    } else if (board.total === 0) {
      body.dataset.state = 'empty';
      body.replaceChildren(
        message('Be the first!'),
        message('No times on this board yet. Race it to set one.', 'leaderboard-note'),
      );
    } else {
      body.dataset.state = 'board';
      body.replaceChildren(...boardView(board));
    }
  }

  select(trackId, engineClass);
  trackTabs.focus(trackId);

  const move = (step: number) => {
    const index = tracks.findIndex((t) => t.id === trackId);
    const next = tracks[(index + step + tracks.length) % tracks.length];
    if (next) {
      select(next.id, engineClass);
      trackTabs.focus(next.id);
    }
  };
  return {
    onKey: (e) => {
      if (e.key === 'Escape' || e.key === 'Backspace') onBack();
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
      else return;
      e.preventDefault();
    },
    dispose: () => {
      request += 1;
    },
  };
});

interface Tabs {
  element: HTMLElement;
  /** Marks the selected tab. */
  mark(key: string): void;
  focus(key: string): void;
}

/** A row of tab buttons (`aria-selected` marks the chosen one). */
function tabs(
  className: string,
  label: string,
  items: { key: string; label: string }[],
  onPick: (key: string) => void,
): Tabs {
  const element = document.createElement('div');
  element.className = `leaderboard-tabs ${className}`;
  element.setAttribute('role', 'tablist');
  element.setAttribute('aria-label', label);
  const buttons = items.map(({ key, label: text }) => {
    const tab = button(text, () => onPick(key), 'tab');
    tab.setAttribute('role', 'tab');
    tab.dataset.key = key;
    return tab;
  });
  element.append(...buttons);
  return {
    element,
    mark(key) {
      for (const tab of buttons) {
        const selected = tab.dataset.key === key;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      }
    },
    focus(key) {
      const tab = buttons.find((b) => b.dataset.key === key);
      tab?.focus({ preventScroll: true });
      tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
  };
}

function message(text: string, className = 'leaderboard-message'): HTMLElement {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

/** The header, the scrolling top list and, if you're outside it, your row pinned under it. */
function boardView(board: Board): HTMLElement[] {
  const head = document.createElement('div');
  head.className = 'leaderboard-row leaderboard-head';
  head.setAttribute('aria-hidden', 'true');
  for (const text of ['#', '', 'Name', 'Time', 'Best lap']) {
    const cell = document.createElement('span');
    cell.textContent = text;
    head.append(cell);
  }
  const list = document.createElement('ol');
  list.className = 'leaderboard-list';
  list.append(...board.top.map((r) => boardRow(r, 'li')));
  const views: HTMLElement[] = [head, list];
  const inTop = board.top.some((r) => r.you);
  if (board.you && !inTop) {
    const pinned = boardRow(board.you, 'div');
    pinned.classList.add('pinned');
    views.push(pinned);
  }
  const total = message(
    `${board.total} ${board.total === 1 ? 'racer' : 'racers'}`,
    'leaderboard-note leaderboard-total',
  );
  views.push(total);
  return views;
}

function boardRow(r: BoardRow, tag: 'li' | 'div'): HTMLElement {
  const el = document.createElement(tag);
  el.className = r.you ? 'leaderboard-row you' : 'leaderboard-row';
  el.dataset.rank = String(r.rank);
  if (r.colour && isColourId(r.colour))
    el.style.setProperty('--player-colour', colourHex(r.colour));
  const rank = document.createElement('span');
  rank.className = 'rank';
  rank.textContent = String(r.rank);
  const racer = racerSwatch(r.racer ?? '');
  racer.classList.add('racer');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = r.you ? `${r.nickname} (you)` : r.nickname;
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = ms(r.raceMs);
  const lap = document.createElement('span');
  lap.className = 'lap';
  lap.textContent = ms(r.bestLapMs);
  el.append(rank, racer, name, time, lap);
  return el;
}
