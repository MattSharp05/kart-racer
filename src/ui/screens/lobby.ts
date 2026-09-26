import { MAX_ROOM_PLAYERS, type RoomMember } from '../../net/room';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './lobby.css';

/** What the lobby shows of a room (a `net/room.ts` Room). */
export interface LobbyRoom {
  readonly code: string;
  readonly selfId: string;
  readonly members: readonly RoomMember[];
  onChange(listener: () => void): () => void;
}

export interface LobbyProps {
  room: LobbyRoom;
  /** The room link to share (`/?room=CODE`). */
  link: string;
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
 * Lobby (MK-40): the room code and link to share, and who's here, updating live. Host settings,
 * racer pick and Start are MK-47. Esc leaves the room.
 */
registerScreen('lobby', (panel, { room, link, onLeave }) => {
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
  const render = () => {
    count.textContent = `Players ${room.members.length}/${MAX_ROOM_PLAYERS} · AI fills the rest`;
    list.replaceChildren(...room.members.map((m) => playerRow(m, m.id === room.selfId)));
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
      row('lobby-list', count, list),
    ),
    row('actions', button('Leave room', onLeave)),
  );
  return {
    onKey: (e) => {
      if (e.key === 'Escape') onLeave();
    },
  };
});

function playerRow(member: RoomMember, isSelf: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.memberId = member.id;
  const dot = document.createElement('span');
  dot.className = 'player-dot';
  dot.style.background = member.colour;
  const name = document.createElement('span');
  name.className = 'player-name';
  name.textContent = member.nickname;
  li.append(dot, name);
  const tags = [member.isHost && '★ Host', isSelf && 'You'].filter((t): t is string => !!t);
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
