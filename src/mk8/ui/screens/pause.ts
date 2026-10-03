// MK8 pause menu (MK-121): Esc or the pause button in an MK8 race stops the sim and shows this over
// the frozen race: the course and engine class in the header band, then Continue, Restart and Quit
// (to MK8 Mode's menus) as slanted tiles with the pulsing frame. The pause sound plays as it opens
// and the unpause sound when the race goes on (Continue, Esc, or B). Not a menu-flow screen (no
// `screen` export): `raceScreens.ts` shows it in its own MK8 stack.
import { buttonBar, header, Menu } from '../kit';
import { menuAction } from '../kit/nav';
import type { Mk8ScreenFactory } from '../stack';
import './pause.css';

export interface PauseOptions {
  /** The header band: the course's name… */
  title: string;
  /** …and the engine class. */
  sub: string;
  onContinue: () => void;
  /** Absent when the race can't restart. */
  onRestart?: () => void;
  onQuit: () => void;
  /** Asked before quitting (MK-130: mid-Grand Prix), its yes quitting. */
  quitConfirm?: Mk8ScreenFactory;
}

/** The options, top to bottom. */
export type PauseOption = 'continue' | 'restart' | 'quit';

const LABELS: Record<PauseOption, string> = {
  continue: 'Continue',
  restart: 'Restart',
  quit: 'Quit',
};

export function pauseMenu(options: PauseOptions): Mk8ScreenFactory {
  return (stack) => {
    const el = document.createElement('section');
    el.className = 'mk8-scr mk8-scr-pause';
    const body = document.createElement('div');
    body.className = 'mk8-body mk8-pause';
    const ids: PauseOption[] = [
      'continue',
      ...(options.onRestart ? ['restart' as const] : []),
      'quit',
    ];
    const tiles = ids.map((id) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'mk8-tile mk8-pause-opt';
      tile.dataset.option = id;
      const label = document.createElement('b');
      label.textContent = LABELS[id];
      tile.append(label);
      return tile;
    });
    const list = document.createElement('div');
    list.className = 'mk8-pause-list';
    list.append(...tiles);
    body.append(list);

    let closed = false;
    const resume = () => {
      if (closed) return;
      closed = true;
      stack.sounds.play('race/unpause');
      options.onContinue();
    };
    const run: Record<PauseOption, () => void> = {
      continue: resume,
      restart: () => options.onRestart?.(),
      quit: () => {
        if (options.quitConfirm) stack.push(options.quitConfirm);
        else options.onQuit();
      },
    };
    const menu = new Menu({
      items: tiles,
      sounds: stack.sounds,
      onConfirm: (index) => {
        const id = ids[index];
        if (id) run[id]();
      },
      // Continue plays the unpause sound rather than the menu's decide: it goes through onRefuse.
      canConfirm: (index) => ids[index] !== 'continue',
      onRefuse: resume,
    });
    el.append(
      header(options.title, options.sub),
      body,
      buttonBar([
        { button: 'a', label: 'OK', onPress: () => menu.confirm() },
        { button: 'b', label: 'Continue', onPress: resume },
      ]),
    );
    stack.sounds.play('race/pause');
    return {
      el,
      onKey: (e) => {
        if (menuAction(e.key)?.kind === 'back') {
          e.preventDefault();
          resume();
          return true;
        }
        return menu.handleKey(e);
      },
    };
  };
}
