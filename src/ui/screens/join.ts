import { isRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from '../../net/room';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import { statusLine } from './online';
import './online.css';

export interface JoinProps {
  onJoin: (code: string) => void;
  onBack: () => void;
  /** The code typed before (shown again after an error). */
  initial?: string;
  message?: string;
  busy?: string;
}

declare module '../router' {
  interface ScreenProps {
    join: JoinProps;
  }
}

/**
 * Join a room (MK-40): type the 4-character code. Typing is upper-cased and look-alikes (0/O, 1/I)
 * are ignored, since codes never contain them. Enter joins, Esc goes back.
 */
registerScreen('join', (panel, { onJoin, onBack, initial = '', message, busy }) => {
  const input = document.createElement('input');
  input.className = 'room-code-input';
  input.type = 'text';
  input.inputMode = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = ROOM_CODE_LENGTH;
  input.placeholder = 'CODE';
  input.setAttribute('autocapitalize', 'characters');
  input.setAttribute('aria-label', 'Room code');
  input.value = normalizeRoomCode(initial);
  input.disabled = busy !== undefined;
  const join = button('Join', () => submit(), 'primary');
  const update = () => (join.disabled = busy !== undefined || !isRoomCode(input.value));
  const submit = () => {
    if (!join.disabled) onJoin(input.value);
  };
  input.addEventListener('input', () => {
    const code = normalizeRoomCode(input.value);
    if (code !== input.value) input.value = code;
    update();
  });
  // Typing is for the code only: keep keys from the game's shortcuts (M mutes, arrows steer).
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') onBack();
  });
  update();
  panel.append(
    heading('h2', 'Join a room'),
    input,
    statusLine(message, busy),
    row('actions', join, button('Back', onBack)),
  );
  if (!busy) input.focus();
  return {
    onKey: (e) => {
      if (e.key === 'Escape') onBack();
    },
  };
});
