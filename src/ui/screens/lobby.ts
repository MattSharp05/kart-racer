import type { TrackContent } from '../../content/tracks';
import {
  allReady,
  ENGINE_CLASSES,
  kartOf,
  settingsOf,
  type LobbyContent,
  type LobbySettings,
} from '../../net/lobbyState';
import { MAX_ROOM_PLAYERS, type RoomMember } from '../../net/room';
import { createRacerPicker, type RacerPicker } from '../components/racerPicker';
import { trackCard } from '../components/trackCard';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './lobby.css';
import './trackSelect.css';

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
  /** Tracks the host can pick (as cards, MK-78) and racers everyone can pick, in menu order. */
  tracks: readonly TrackContent[];
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
 * The track shows as its card (MK-78); the host's opens the track cards over the lobby.
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
  // The track (MK-78): the host's pick as its card. The host's opens the cards to choose another.
  let trackPicker: { overlay: HTMLElement; onKey: (e: KeyboardEvent) => boolean } | undefined;
  const closeTrackPicker = () => {
    trackPicker?.overlay.remove();
    trackPicker = undefined;
    trackSlot.querySelector('button')?.focus();
  };
  const openTrackPicker = () => {
    if (trackPicker || !room.isHost) return;
    const choice = trackChoice(props.tracks, current().trackId, (trackId) => {
      props.onSettings({ ...current(), trackId });
      closeTrackPicker();
    });
    const overlay = row(
      'lobby-track-overlay',
      row(
        'lobby-track-panel',
        heading('h2', 'Choose a track'),
        choice.grid,
        row(
          'actions',
          button('Back', closeTrackPicker),
          button('Choose', choice.choose, 'primary'),
        ),
      ),
    );
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Choose a track');
    panel.append(overlay);
    trackPicker = { overlay, onKey: choice.onKey };
    choice.focus();
  };
  const trackSlot = document.createElement('div');
  trackSlot.className = 'lobby-track';
  /** The shown card, rebuilt when the host's track changes. */
  let shownTrack = '';
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
  // This player's racer: the racer select (MK-51) opens over the lobby, which keeps updating.
  let picker: { overlay: HTMLElement; picker: RacerPicker } | undefined;
  const closePicker = () => {
    picker?.picker.dispose();
    picker?.overlay.remove();
    picker = undefined;
    racer.focus();
  };
  const openPicker = () => {
    if (picker) return;
    const choice = createRacerPicker({
      initial: self()?.racer ?? '',
      onChoose: (id) => {
        props.onRacer(id);
        closePicker();
      },
    });
    const overlay = row(
      'lobby-racer-overlay',
      row(
        'lobby-racer-panel',
        heading('h2', 'Choose your racer'),
        choice.element,
        row('actions', button('Back', closePicker), button('Choose', choice.choose, 'primary')),
      ),
    );
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Choose your racer');
    panel.append(overlay);
    picker = { overlay, picker: choice };
    choice.focus();
  };
  const racer = button('', openPicker, 'lobby-racer');
  racer.setAttribute('aria-haspopup', 'dialog');

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
    const chosen = props.tracks.find((t) => t.id === settings.trackId);
    if (chosen && chosen.id !== shownTrack) {
      const focused = trackSlot.contains(document.activeElement);
      const card = trackCard(chosen, null, openTrackPicker);
      card.setAttribute('aria-checked', 'true');
      card.removeAttribute('role');
      card.setAttribute('aria-haspopup', 'dialog');
      card.setAttribute('aria-label', `Track: ${chosen.name}${room.isHost ? '. Change' : ''}`);
      card.disabled = !room.isHost;
      trackSlot.replaceChildren(card);
      trackSlot.dataset.track = chosen.id;
      shownTrack = chosen.id;
      if (focused) card.focus();
    }
    for (const el of ccButtons) {
      el.setAttribute('aria-pressed', String(el.dataset.cc === String(settings.cc)));
      el.disabled = !room.isHost;
    }
    items.textContent = `Items: ${settings.itemsOn ? 'On' : 'Off'}`;
    items.setAttribute('aria-pressed', String(settings.itemsOn));
    items.disabled = !room.isHost;
    const mine = props.racers.find((r) => r.id === me?.racer);
    racer.textContent = `Racer: ${mine?.name ?? '…'}`;
    racer.dataset.racer = mine?.id ?? '';
    racer.setAttribute('aria-label', `Racer: ${mine?.name ?? 'none'}. Change`);
    ready.textContent = me?.ready ? '✓ Ready' : 'Ready';
    ready.setAttribute('aria-pressed', String(me?.ready === true));
    ready.hidden = room.isHost;
    start.hidden = !room.isHost;
    if (!room.members.some((m) => m.isHost && m.start)) start.disabled = !everyone;
    // A race is on without this device (it joined or came back mid-race, MK-70): the next one.
    const hostStart = room.members.find((m) => m.isHost)?.start;
    const raceOn = !room.isHost && hostStart !== undefined && kartOf(hostStart, room.selfId) < 0;
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
      row('lobby-settings', trackSlot, cc, items, racer),
    ),
    row('actions', button('Leave room', onLeave), ready, start),
  );
  return {
    onKey: (e) => {
      if (trackPicker) {
        if (trackPicker.onKey(e)) e.preventDefault();
        else if (e.key === 'Escape') closeTrackPicker();
      } else if (picker) {
        if (!picker.picker.onKey(e) && e.key === 'Escape') closePicker();
      } else if (e.key === 'Escape') onLeave();
    },
    dispose: () => picker?.picker.dispose(),
  };
});

/**
 * The track cards to choose from (MK-78), `initial` selected: a tap or the arrow keys select, a
 * tap on the selected card, Enter or `choose` picks it. `onKey` says whether it took the key.
 */
function trackChoice(
  tracks: readonly TrackContent[],
  initial: string,
  onPick: (trackId: string) => void,
): {
  grid: HTMLElement;
  choose: () => void;
  focus: () => void;
  onKey: (e: KeyboardEvent) => boolean;
} {
  let index = Math.max(
    0,
    tracks.findIndex((t) => t.id === initial),
  );
  const grid = document.createElement('div');
  grid.className = 'track-grid';
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', 'Tracks');
  const choose = () => {
    const track = tracks[index];
    if (track) onPick(track.id);
  };
  const select = (i: number) => {
    index = (i + tracks.length) % tracks.length;
    grid.dataset.track = tracks[index]?.id ?? '';
    cards.forEach((card, n) => {
      card.setAttribute('aria-checked', String(n === index));
      card.tabIndex = n === index ? 0 : -1;
    });
    cards[index]?.focus();
    cards[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const cards = tracks.map((track, i) =>
    trackCard(track, null, () => (i === index ? choose() : select(i))),
  );
  grid.append(...cards);
  return {
    grid,
    choose,
    focus: () => select(index),
    onKey: (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') select(index - 1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') select(index + 1);
      else if (e.key === 'Enter' && cards.includes(document.activeElement as HTMLButtonElement))
        choose();
      else return false;
      return true;
    },
  };
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
