import { formatTime, ordinal } from '../hud/format';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './onlineResults.css';

/** One kart's line: place, name (a person's nickname, or the racer for AI), racer, time. */
export interface OnlineResultRowView {
  position: number;
  name: string;
  racer: string;
  you: boolean;
  /** Driven by a person: highlighted in their colour. */
  human: boolean;
  colour?: string;
  /** Race time, s; absent for a kart still racing. */
  time?: number;
}

export interface OnlineResultsProps {
  rows: OnlineResultRowView[];
  /** The host's final standings are in (every person finished): the same on every device. */
  final: boolean;
  /** This device is the host: it picks Race again or Next track (the others follow). */
  host: boolean;
  /** Part of a room (not a bare `?net=local` race): the others wait for the host's choice. */
  inRoom: boolean;
  /** Host: the same settings again. */
  onAgain?: () => void;
  /** Host: back to the lobby's track picker. */
  onNextTrack?: () => void;
  /** Opens the track's leaderboard (only offered once that screen exists). */
  onLeaderboard?: () => void;
  /** Back to the title, leaving the room. */
  onLeave: () => void;
}

declare module '../router' {
  interface ScreenProps {
    onlineResults: OnlineResultsProps;
  }
}

/**
 * Online results (MK-55, PRD v2 core steps 5–6): all 8 karts with the people highlighted in their
 * colours, from the host's standings. The host then picks Race again or Next track; everyone else
 * sees "Waiting for host…" and follows. Leave goes back to the title.
 */
registerScreen('onlineResults', (panel, props) => {
  const { rows, final, host, inRoom } = props;
  const you = rows.find((r) => r.you && r.time !== undefined);
  const list = document.createElement('ol');
  list.className = 'online-results';
  list.dataset.final = String(final);
  for (const result of rows) {
    const li = document.createElement('li');
    li.classList.toggle('human', result.human);
    li.classList.toggle('you', result.you);
    if (result.colour) li.style.setProperty('--player-colour', result.colour);
    const cells = [
      ordinal(result.position),
      result.you ? `${result.name} (you)` : result.name,
      result.human ? result.racer : '',
      result.time !== undefined ? formatTime(result.time) : '—',
    ];
    li.append(
      ...cells.map((text, i) => {
        const cell = document.createElement('span');
        cell.className = ['place', 'name', 'racer', 'time'][i] ?? '';
        cell.textContent = text;
        return cell;
      }),
    );
    list.append(li);
  }

  const status = document.createElement('p');
  status.className = 'online-results-status';
  status.setAttribute('role', 'status');
  if (!final) status.textContent = 'Waiting for everyone to finish…';
  else if (inRoom && !host) status.textContent = 'Waiting for host…';

  const actions: HTMLButtonElement[] = [button('Leave', props.onLeave)];
  if (props.onLeaderboard) actions.push(button('View leaderboard', props.onLeaderboard));
  let focus = actions[0];
  if (host && props.onNextTrack) actions.push(button('Next track', props.onNextTrack));
  if (host && props.onAgain) {
    focus = button('Race again', props.onAgain, 'primary');
    actions.push(focus);
  }
  // The host's choices wait for the final results (someone may still be racing).
  for (const action of actions.slice(1)) action.disabled = !final;
  if (!final) focus = actions[0];

  panel.append(
    heading('h2', you ? `You finished ${ordinal(you.position)}!` : 'Results'),
    list,
    status,
    row('actions', ...actions),
  );
  focus?.focus();
  return {};
});
