import { openAddControllers } from '../../remote/desktop';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './title.css';

export interface TitleProps {
  onPlay: () => void;
  /** MK8 Mode (MK-97): loads its own chunk and pack. */
  onMk8?: () => void;
  /** The button that starts with focus (default Play); the `mk8-entry` scenario picks MK8 Mode. */
  focus?: 'play' | 'mk8';
  /** Online rooms (MK-40). */
  onOnline?: () => void;
  onHowToPlay?: () => void;
  /** Opens Settings (MK-43), which holds the sound toggle. */
  onSettings?: () => void;
  /** Opens the leaderboards (MK-56). */
  onLeaderboards?: () => void;
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
  const { onPlay, onMk8, onOnline, onHowToPlay, onSettings, onLeaderboards, player, onEditName } =
    props;
  const play = button('Play', onPlay, 'primary');
  const mk8 = onMk8 ? mk8Button(onMk8) : undefined;
  const online = onOnline ? [button('Online', onOnline, 'online')] : [];
  panel.append(
    heading('h1', 'Kart Racer', 'logo'),
    row('actions', play, ...(mk8 ? [mk8] : []), ...online),
  );
  if (player && onEditName) panel.append(nameChip(player, onEditName));
  // How to play and Leaderboards (MK-56) share a line.
  const secondary = [
    ...(onHowToPlay ? [button('How to play', onHowToPlay, 'secondary')] : []),
    ...(onLeaderboards
      ? [button('🏆 Leaderboards', onLeaderboards, 'secondary leaderboards')]
      : []),
    // Phone controllers (MK-146); not on touch screens, which are the controllers.
    button('📱 Controllers', () => void openAddControllers(), 'secondary controllers-button'),
  ];
  if (secondary.length) panel.append(row('actions', ...secondary));
  if (onSettings) panel.append(button('⚙ Settings', onSettings, 'secondary settings-button'));
  (props.focus === 'mk8' && mk8 ? mk8 : play).focus();
  return {
    onKey: (e) => {
      // Enter means Play unless a button has focus (it presses that button itself).
      if (e.key === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) onPlay();
    },
  };
});

/** MK8 Mode (MK-97): red → blue, with a NEW badge, as in the v3 mockup. */
function mk8Button(onClick: () => void): HTMLButtonElement {
  const mk8 = button('MK8 Mode', onClick, 'mk8-mode');
  const badge = document.createElement('span');
  badge.className = 'mk8-new';
  badge.textContent = 'NEW';
  badge.setAttribute('aria-hidden', 'true');
  mk8.append(badge);
  return mk8;
}

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
