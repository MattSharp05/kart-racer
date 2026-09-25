import { registerScreen } from '../router';
import { appendSoundToggle, button, heading, type SoundControl } from './common';
import './pause.css';

export interface PauseProps {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onHowToPlay?: () => void;
  sound?: SoundControl;
}

declare module '../router' {
  interface ScreenProps {
    paused: PauseProps;
  }
}

/** Pause menu (MK-25): Resume (or Esc), Restart, How to play, Quit and the sound toggle. */
registerScreen('paused', (panel, handlers) => {
  const resume = button('Resume', handlers.onResume, 'primary');
  const actions = document.createElement('div');
  actions.className = 'actions column';
  actions.append(
    resume,
    button('Restart race', handlers.onRestart),
    ...(handlers.onHowToPlay ? [button('How to play', handlers.onHowToPlay)] : []),
    button('Quit to title', handlers.onQuit),
  );
  panel.append(heading('h2', 'Paused'), actions);
  const refresh = appendSoundToggle(actions, handlers.sound);
  resume.focus();
  return {
    refresh,
    onKey: (e) => {
      if (e.key === 'Escape') handlers.onResume();
    },
  };
});

/** Round pause button shown during races (touch-friendly; Esc does the same on keyboards). */
export function createPauseButton(onPause: () => void): HTMLButtonElement {
  const el = button('❚❚', onPause, 'pause-button');
  el.setAttribute('aria-label', 'Pause');
  document.body.append(el);
  return el;
}
