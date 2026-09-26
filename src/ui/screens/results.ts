import { formatTime, ordinal } from '../hud/format';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './results.css';

export interface ResultRowView {
  position: number;
  name: string;
  you: boolean;
  time?: number;
}

/** One record line: "Race record 2:33.120", flagged when this race just set it. */
export interface RecordLineView {
  label: string;
  time: number;
  isNew: boolean;
  /** The record this race beat, if there was one. */
  previous?: number;
}

export interface ResultsProps {
  rows: ResultRowView[];
  /** The track's records after the local player's finish (MK-44); absent without a finish. */
  records?: RecordLineView[];
  /**
   * This race's leaderboard submit (MK-56): resolves to your rank once the backend has taken a
   * personal best, or null (not a best, not sent, unavailable).
   */
  submitted?: Promise<number | null>;
  onAgain: () => void;
  onChangeKart: () => void;
  onMenu: () => void;
  /** Opens this track's leaderboard (MK-56). */
  onLeaderboard?: () => void;
}

declare module '../router' {
  interface ScreenProps {
    results: ResultsProps;
  }
}

/** Results (MK-25): finishing order with times, the local player highlighted, then what next. */
registerScreen('results', (panel, { rows, records, submitted, ...handlers }) => {
  const you = rows.find((r) => r.you);
  const list = document.createElement('ol');
  list.className = 'results';
  for (const result of rows) {
    const li = document.createElement('li');
    if (result.you) li.className = 'you';
    li.innerHTML = `<span>${ordinal(result.position)}</span><span></span><span>${result.time !== undefined ? formatTime(result.time) : '—'}</span>`;
    const nameCell = li.children[1];
    if (nameCell) nameCell.textContent = result.you ? `${result.name} (you)` : result.name;
    list.append(li);
  }
  panel.append(heading('h2', you ? `You finished ${ordinal(you.position)}!` : 'Results'), list);
  if (records?.length) panel.append(recordsBlock(records));
  const status = document.createElement('p');
  status.className = 'leaderboard-status';
  status.setAttribute('role', 'status');
  if (submitted) panel.append(status);
  const again = button('Race again', handlers.onAgain, 'primary');
  const leaderboard = handlers.onLeaderboard
    ? [button('See leaderboard', handlers.onLeaderboard)]
    : [];
  panel.append(
    row(
      'actions',
      button('Menu', handlers.onMenu),
      button('Change kart', handlers.onChangeKart),
      ...leaderboard,
      again,
    ),
  );
  again.focus();
  let shown = true;
  void submitted?.then((rank) => {
    if (shown && rank !== null) status.textContent = `Submitted — you're #${rank}`;
  });
  return {
    dispose: () => {
      shown = false;
    },
  };
});

/** "New record!" when this race set one, then each record with the previous best it beat. */
function recordsBlock(records: RecordLineView[]): HTMLElement {
  const block = document.createElement('div');
  block.className = 'records';
  if (records.some((r) => r.isNew)) block.append(heading('h3', 'New record!', 'new-record'));
  for (const record of records) {
    const line = document.createElement('p');
    line.className = record.isNew ? 'record new' : 'record';
    const was = record.previous !== undefined ? ` (was ${formatTime(record.previous)})` : '';
    line.textContent = `${record.isNew ? '★ ' : ''}${record.label} ${formatTime(record.time)}${record.isNew ? was : ''}`;
    block.append(line);
  }
  return block;
}
