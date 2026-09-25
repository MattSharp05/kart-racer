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

export interface ResultsProps {
  rows: ResultRowView[];
  /** "New best lap!" etc., or ''. */
  bestNote: string;
  onAgain: () => void;
  onChangeKart: () => void;
  onMenu: () => void;
}

declare module '../router' {
  interface ScreenProps {
    results: ResultsProps;
  }
}

/** Results (MK-25): finishing order with times, the local player highlighted, then what next. */
registerScreen('results', (panel, { rows, bestNote, ...handlers }) => {
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
  if (bestNote) {
    const note = document.createElement('p');
    note.className = 'best';
    note.textContent = bestNote;
    panel.append(note);
  }
  const again = button('Race again', handlers.onAgain, 'primary');
  panel.append(
    row(
      'actions',
      button('Menu', handlers.onMenu),
      button('Change kart', handlers.onChangeKart),
      again,
    ),
  );
  again.focus();
  return {};
});
