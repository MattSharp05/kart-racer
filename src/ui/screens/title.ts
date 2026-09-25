import { registerScreen } from '../router';
import { appendSoundToggle, button, heading, row, type SoundControl } from './common';
import './title.css';

export interface TitleProps {
  onPlay: () => void;
  /** Online rooms (MK-40). */
  onOnline?: () => void;
  onHowToPlay?: () => void;
  sound?: SoundControl;
}

declare module '../router' {
  interface ScreenProps {
    title: TitleProps;
  }
}

/** Title screen (MK-25): logo, Play, How to play and the sound toggle over the attract race. */
registerScreen('title', (panel, { onPlay, onOnline, onHowToPlay, sound }) => {
  const play = button('Play', onPlay, 'primary');
  const online = onOnline ? [button('Online', onOnline, 'online')] : [];
  panel.append(heading('h1', 'Kart Racer', 'logo'), row('actions', play, ...online));
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
