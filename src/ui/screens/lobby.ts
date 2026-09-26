import {
  allReady,
  ENGINE_CLASSES,
  settingsOf,
  type LobbyContent,
  type LobbySettings,
} from '../../net/lobbyState';
import { MAX_ROOM_PLAYERS, type RoomMember } from '../../net/room';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './lobby.css';

/** A client in the lobby while the host races without it (MK-70: no joining mid-race). */
export const RACE_ON_MESSAGE = "A race is on. You'll be in the next one.";

/** What the lobby shows of a room (a `net/room.ts` Room). */
export interface LobbyRoom {
  readonly code: string;
  readonly selfId: string;
  readonly isHost: boolean;
  readonly members: readonly RoomMember[];
  onChange(listener: () => void): () => void;
}

/** A track or racer the lobby offers. */
export interface LobbyChoice {
  id: string;
  name: string;
}

export interface LobbyProps {
  room: LobbyRoom;
  /** The room link to share (`/?room=CODE`). */
  link: string;
  /** Why the last race didn't happen (shown until the next change). */
  message?: string;
  /** Tracks the host can pick and racers everyone can pick, in menu order. */
  tracks: readonly LobbyChoice[];
  racers: readonly LobbyChoice[];
  /** Host: new track, cc or items. */
  onSettings: (settings: LobbySettings) => void;
  onRacer: (racer: string) => void;
  onReady: (ready: boolean) => void;
  /** Host: start the race (only offered once everyone is ready). */
  onStart: () => void;
  onLeave: () => void;
}

declare module '../router' {
  interface ScreenProps {
    lobby: LobbyProps;
  }
}

/** How long "Link copied" shows before the button reads "Copy link" again, ms. */
const COPIED_MS = 2000;

/**
 * Lobby (MK-40, MK-47): the room code and link to share, who's here (with their racer and whether
 * they're ready), the host's track, cc and items (everyone else sees them update live), this
 * player's racer, and Ready (players) or Start (host, once everyone is ready). Esc leaves the room.
 */
registerScreen('lobby', (panel, props) => {
  const { room, link, onLeave } = props;
  const content: LobbyContent = {
    trackIds: props.tracks.map((t) => t.id),
    racerIds: props.racers.map((r) => r.id),
  };
  const self = () => room.members.find((m) => m.id === room.selfId);

  const code = document.createElement('p');
  code.className = 'room-code';
  code.dataset.code = room.code;
  code.textContent = room.code;
  code.setAttribute('aria-label', `Room code ${[...room.code].join(' ')}`);
  const linkText = document.createElement('p');
  linkText.className = 'room-link';
  linkText.textContent = link.replace(/^https?:\/\//, '');

  const count = document.createElement('p');
  count.className = 'lobby-count';
  const list = document.createElement('ul');
  list.className = 'lobby-players';
  list.setAttribute('aria-live', 'polite');

  // Race settings: the host edits them, everyone else sees the host's choice.
  const current = () => settingsOf(room.members, content);
  const track = select('Track', props.tracks, (trackId) =>
    props.onSettings({ ...current(), trackId }),
  );
  track.select.classList.add('lobby-track');
  const ccButtons = ENGINE_CLASSES.map((cc) => {
    const el = button(`${cc}cc`, () => props.onSettings({ ...current(), cc }));
    el.dataset.cc = String(cc);
    return el;
  });
  const cc = row('lobby-cc', ...ccButtons);
  cc.setAttribute('role', 'group');
  cc.setAttribute('aria-label', 'Engine class');
  const items = button('', () => props.onSettings({ ...current(), itemsOn: !current().itemsOn }));
  items.className = 'lobby-items';
  const racer = select('Racer', props.racers, (id) => props.onRacer(id));
  racer.select.classList.add('lobby-racer');

  const ready = button('Ready', () => props.onReady(!self()?.ready));
  ready.className = 'primary lobby-ready';
  const start = button('Start', () => {
    start.disabled = true;
    props.onStart();
  });
  start.className = 'primary lobby-start';
  const waiting = document.createElement('p');
  waiting.className = 'lobby-waiting';
  waiting.setAttribute('aria-live', 'polite');
  const message = document.createElement('p');
  message.className = 'lobby-message';
  // Only an alert when there's something to say (an empty alert clashes with the error banner's).
  if (props.message) message.setAttribute('role', 'alert');
  message.textContent = props.message ?? '';

  const render = () => {
    const me = self();
    const settings = current();
    const everyone = allReady(room.members);
    count.textContent = `Players ${room.members.length}/${MAX_ROOM_PLAYERS} · AI fills the rest`;
    list.replaceChildren(
      ...room.members.map((m) => playerRow(m, m.id === room.selfId, props.racers)),
    );
    // Controls are updated in place, so an open picker isn't closed by someone else's change.
    track.select.value = settings.trackId;
    track.select.disabled = !room.isHost;
    for (const el of ccButtons) {
      el.setAttribute('aria-pressed', String(el.dataset.cc === String(settings.cc)));
      el.disabled = !room.isHost;
    }
    items.textContent = `Items: ${settings.itemsOn ? 'On' : 'Off'}`;
    items.setAttribute('aria-pressed', String(settings.itemsOn));
    items.disabled = !room.isHost;
    if (me && content.racerIds.includes(me.racer)) racer.select.value = me.racer;
    ready.textContent = me?.ready ? '✓ Ready' : 'Ready';
    ready.setAttribute('aria-pressed', String(me?.ready === true));
    ready.hidden = room.isHost;
    start.hidden = !room.isHost;
    if (!room.members.some((m) => m.isHost && m.start)) start.disabled = !everyone;
    // A race is on without this device (it joined or came back mid-race, MK-70): the next one.
    const raceOn = !room.isHost && room.members.some((m) => m.isHost && m.start);
    waiting.textContent = raceOn
      ? RACE_ON_MESSAGE
      : room.isHost
        ? everyone
          ? ''
          : 'Waiting for everyone to be ready…'
        : me?.ready
          ? 'Waiting for the host to start…'
          : '';
  };
  render();
  const stop = room.onChange(() => {
    // The panel is gone once another screen shows: stop listening.
    if (panel.isConnected) render();
    else stop();
  });

  panel.append(
    heading('h2', 'Lobby'),
    row(
      'lobby-body',
      row('lobby-share', code, linkText, shareButton(room.code, link, linkText)),
      row('lobby-list', count, list, message, waiting),
      row('lobby-settings', track.label, cc, items, racer.label),
    ),
    row('actions', button('Leave room', onLeave), ready, start),
  );
  return {
    onKey: (e) => {
      if (e.key === 'Escape') onLeave();
    },
  };
});

/** A labelled `<select>` of `choices` calling `onChange` with the picked id. */
function select(
  text: string,
  choices: readonly LobbyChoice[],
  onChange: (id: string) => void,
): { label: HTMLLabelElement; select: HTMLSelectElement } {
  const label = document.createElement('label');
  label.className = 'lobby-select';
  const caption = document.createElement('span');
  caption.textContent = text;
  const el = document.createElement('select');
  el.setAttribute('aria-label', text);
  for (const choice of choices) el.append(new Option(choice.name, choice.id));
  el.addEventListener('change', () => onChange(el.value));
  label.append(caption, el);
  return { label, select: el };
}

function playerRow(
  member: RoomMember,
  isSelf: boolean,
  racers: readonly LobbyChoice[],
): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.memberId = member.id;
  li.dataset.ready = String(member.isHost || member.ready);
  const dot = document.createElement('span');
  dot.className = 'player-dot';
  dot.style.background = member.colour;
  const name = document.createElement('span');
  name.className = 'player-name';
  name.textContent = member.nickname;
  const racer = document.createElement('span');
  racer.className = 'player-racer';
  racer.textContent = racers.find((r) => r.id === member.racer)?.name ?? '';
  li.append(dot, name, racer);
  const tags = [
    member.isHost && '★ Host',
    isSelf && 'You',
    !member.isHost && (member.ready ? '✓ Ready' : '…'),
  ].filter((t): t is string => !!t);
  for (const text of tags) {
    const tag = document.createElement('span');
    tag.className = 'player-tag';
    tag.textContent = text;
    li.append(tag);
  }
  return li;
}

/** Phones share the link (Web Share API); everything else copies it. */
function shareButton(code: string, link: string, linkText: HTMLElement): HTMLButtonElement {
  const canShare = typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;
  const label = canShare ? 'Share link' : 'Copy link';
  let timer: number | undefined;
  const el = button(label, () => {
    if (canShare) {
      // Cancelling the share sheet rejects: nothing to do.
      navigator
        .share({ title: 'Kart Racer', text: `Race me! Room ${code}`, url: link })
        .catch(() => undefined);
      return;
    }
    const copied = () => {
      el.textContent = 'Link copied!';
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (el.textContent = label), COPIED_MS);
    };
    // No clipboard (http on a LAN IP, permission refused): select the link for a manual copy.
    const select = () => window.getSelection()?.selectAllChildren(linkText);
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(copied, select);
    else select();
  });
  el.className = 'primary share-link';
  return el;
}
