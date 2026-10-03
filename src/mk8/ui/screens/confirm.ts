// MK8 confirm prompt (MK-130): "Quit the Grand Prix?" over the pause menu or the standings. The two
// answers as slanted tiles, the safe one (stay) selected first; B / Esc stays too. Not a menu-flow
// screen (no `screen` export): the pause menu and the results push it on their own stack.
import { buttonBar, header, Menu } from '../kit';
import { menuAction } from '../kit/nav';
import type { Mk8ScreenFactory } from '../stack';
import './confirm.css';

export interface ConfirmOptions {
  /** The question, in the header band. */
  title: string;
  /** What answering yes loses. */
  detail: string;
  /** The yes tile's label ("Quit"). */
  yes: string;
  /** The no tile's label ("Keep racing"). */
  no: string;
  onYes: () => void;
}

export function confirmScreen(options: ConfirmOptions): Mk8ScreenFactory {
  return (stack) => {
    const el = document.createElement('section');
    el.className = 'mk8-scr mk8-scr-confirm';
    const body = document.createElement('div');
    body.className = 'mk8-body mk8-confirm';
    const detail = document.createElement('p');
    detail.className = 'mk8-confirm-detail';
    detail.textContent = options.detail;
    const answers = (['no', 'yes'] as const).map((id) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'mk8-tile mk8-confirm-opt';
      tile.dataset.answer = id;
      const label = document.createElement('b');
      label.textContent = options[id];
      tile.append(label);
      return tile;
    });
    const list = document.createElement('div');
    list.className = 'mk8-confirm-list';
    list.append(...answers);
    body.append(detail, list);
    const stay = () => stack.back();
    const menu = new Menu({
      items: answers,
      sounds: stack.sounds,
      onConfirm: (index) => (index === 1 ? options.onYes() : stay()),
    });
    el.append(
      header(options.title),
      body,
      buttonBar([
        { button: 'a', label: 'OK', onPress: () => menu.confirm() },
        { button: 'b', label: 'Back', onPress: stay },
      ]),
    );
    return {
      el,
      onKey: (e) => (menuAction(e.key)?.kind === 'back' ? false : menu.handleKey(e)),
    };
  };
}

/** The Grand Prix's quit prompt (MK-130). */
export function confirmQuitGp(onYes: () => void): Mk8ScreenFactory {
  return confirmScreen({
    title: 'Quit the Grand Prix?',
    detail: 'Your points so far will be lost.',
    yes: 'Quit',
    no: 'Keep racing',
    onYes,
  });
}
