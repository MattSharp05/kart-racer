import { registerScreen } from '../router';
import { appendSoundToggle, button, heading, type SoundControl } from './common';
import './title.css';

export interface TitleProps {
  onPlay: () => void;
  onHowToPlay?: () => void;
  sound?: SoundControl;
}

declare module '../router' {
  interface ScreenProps {
    title: TitleProps;
  }
}

/** Title screen (MK-25): logo, Play, How to play and the sound toggle over the attract race. */
registerScreen('title', (panel, { onPlay, onHowToPlay, sound }) => {
  const play = button('Play', onPlay, 'primary');
  panel.append(heading('h1', 'Kart Racer', 'logo'), play);
  if (onHowToPlay) panel.append(button('How to play', onHowToPlay, 'secondary'));
  const refresh = appendSoundToggle(panel, sound);
  play.focus();
  return {
    refresh,
    onKey: (e) => {
      if (e.key === 'Enter' && document.activeElement !== play) onPlay();
    },
  };
});
