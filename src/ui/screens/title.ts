import { registerScreen } from '../router';
import { appendSoundToggle, button, heading, type SoundControl } from './common';
import './title.css';

export interface TitleProps {
  onPlay: () => void;
  onHowToPlay?: () => void;
  sound?: SoundControl;
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
 * Title screen (MK-25): logo, Play, How to play and the sound toggle over the attract race, plus
 * the player's name chip (MK-42).
 */
registerScreen('title', (panel, { onPlay, onHowToPlay, sound, player, onEditName }) => {
  const play = button('Play', onPlay, 'primary');
  panel.append(heading('h1', 'Kart Racer', 'logo'), play);
  if (player && onEditName) panel.append(nameChip(player, onEditName));
  if (onHowToPlay) panel.append(button('How to play', onHowToPlay, 'secondary'));
  const refresh = appendSoundToggle(panel, sound);
  play.focus();
  return {
    refresh,
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
