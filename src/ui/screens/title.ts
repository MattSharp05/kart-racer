import { registerScreen } from '../router';
import { button, heading } from './common';
import './title.css';

export interface TitleProps {
  onPlay: () => void;
  onHowToPlay?: () => void;
  /** Opens Settings (MK-43), which now holds the sound toggle. */
  onSettings?: () => void;
}

declare module '../router' {
  interface ScreenProps {
    title: TitleProps;
  }
}

/** Title screen (MK-25): logo, Play, How to play and Settings (MK-43) over the attract race. */
registerScreen('title', (panel, { onPlay, onHowToPlay, onSettings }) => {
  const play = button('Play', onPlay, 'primary');
  panel.append(heading('h1', 'Kart Racer', 'logo'), play);
  if (onHowToPlay) panel.append(button('How to play', onHowToPlay, 'secondary'));
  if (onSettings) panel.append(button('⚙ Settings', onSettings, 'secondary settings-button'));
  play.focus();
  return {
    onKey: (e) => {
      if (e.key === 'Enter' && document.activeElement !== play) onPlay();
    },
  };
});
