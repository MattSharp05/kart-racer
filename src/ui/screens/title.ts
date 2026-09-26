import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './title.css';

export interface TitleProps {
  onPlay: () => void;
  /** Online rooms (MK-40). */
  onOnline?: () => void;
  onHowToPlay?: () => void;
  /** Opens Settings (MK-43), which holds the sound toggle. */
  onSettings?: () => void;
  /** The player's name and colour (MK-42), shown as a chip that opens the Nickname screen. */
  player?: { nickname: string; colour: string };
  onEditName?: () => void;
}

declare module '../router' {
  interface ScreenProps {
    title: TitleProps;
  }
}

/**
 * Title screen (MK-25): logo, Play and Online (MK-40), How to play and Settings (MK-43) over the
 * attract race, plus the player's name chip (MK-42).
 */
registerScreen('title', (panel, props) => {
  const { onPlay, onOnline, onHowToPlay, onSettings, player, onEditName } = props;
  const play = button('Play', onPlay, 'primary');
  const online = onOnline ? [button('Online', onOnline, 'online')] : [];
  panel.append(heading('h1', 'Kart Racer', 'logo'), row('actions', play, ...online));
  if (player && onEditName) panel.append(nameChip(player, onEditName));
  if (onHowToPlay) panel.append(button('How to play', onHowToPlay, 'secondary'));
  if (onSettings) panel.append(button('⚙ Settings', onSettings, 'secondary settings-button'));
  play.focus();
  return {
    onKey: (e) => {
      // Enter means Play unless a button has focus (it presses that button itself).
      if (e.key === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) onPlay();
    },
  };
});

/** "● Matt ✎" in the corner: tap to change name or colour (MK-42). */
function nameChip(player: { nickname: string; colour: string }, onEdit: () => void) {
  const chip = button('', onEdit, 'name-chip');
  chip.setAttribute('aria-label', `Racing as ${player.nickname}. Change name`);
  const dot = document.createElement('span');
  dot.className = 'name-chip-dot';
  dot.style.background = player.colour;
  const name = document.createElement('span');
  name.className = 'name-chip-name';
  name.textContent = player.nickname;
  const edit = document.createElement('span');
  edit.className = 'name-chip-edit';
  edit.textContent = '✎';
  chip.append(dot, name, edit);
  return chip;
}
