import { registerScreen } from '../router';
import { appendSoundToggle, button, heading, type SoundControl } from './common';
import './pause.css';

export interface PauseProps {
  onResume: () => void;
  /** Absent online (MK-55): the race is everyone's, so it can't restart. */
  onRestart?: () => void;
  onQuit: () => void;
  onHowToPlay?: () => void;
  /** Opens Settings (MK-43); Back returns to this menu with the race still paused. */
  onSettings?: () => void;
  sound?: SoundControl;
  /** A line under the heading: online, "Race continues" (the menu doesn't stop the race, MK-55). */
  note?: string;
}

declare module '../router' {
  interface ScreenProps {
    paused: PauseProps;
  }
}

/**
 * Pause menu (MK-25): Resume (or Esc), Restart, How to play, Settings (MK-43), Quit and the
 * sound toggle (it stays here as the in-race mute button). Online (MK-55) it has no Restart and a
 * "Race continues" note: the race goes on underneath.
 */
registerScreen('paused', (panel, handlers) => {
  const resume = button('Resume', handlers.onResume, 'primary');
  const actions = document.createElement('div');
  actions.className = 'actions column';
  actions.append(
    resume,
    ...(handlers.onRestart ? [button('Restart race', handlers.onRestart)] : []),
    ...(handlers.onHowToPlay ? [button('How to play', handlers.onHowToPlay)] : []),
    ...(handlers.onSettings ? [button('⚙ Settings', handlers.onSettings, 'settings-button')] : []),
    button('Quit to title', handlers.onQuit),
  );
  panel.append(heading('h2', 'Paused'));
  if (handlers.note) {
    const note = document.createElement('p');
    note.className = 'pause-note';
    note.textContent = handlers.note;
    panel.append(note);
  }
  panel.append(actions);
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
