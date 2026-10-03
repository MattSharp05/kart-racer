// MK8 UI kit (MK-104): the pieces every MK8 Mode screen is built from, after the approved mockup.
// Striped menu background, the blue header band with its slanted title, the bottom button bar
// (A OK / B Back, tappable), slanted tiles and square tiles with the pulsing yellow selection
// frame, and the blue nameplate. Styles are in kit.css, all scoped under `.mk8`.
import './kit.css';

export { Menu, SELECTED_CLASS, type MenuOptions } from './menu';

/** The MK8 colours (kit.css has the same values as `--mk8-*` custom properties). */
export const TOKENS = {
  blue: '#1663d6',
  'blue-deep': '#0b2f7a',
  sky: '#3fb7f0',
  yellow: '#ffd21f',
  'yellow-deep': '#f59b00',
  red: '#e3262e',
  navy: '#14204a',
  white: '#fbfcff',
  grey: '#e6e9f1',
  line: '#c9cfdd',
  bar: '#151b33',
} as const;

export type TokenName = keyof typeof TOKENS;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Text in MK8's 8° slant (headings, names). */
export function slanted(text: string, className = ''): HTMLSpanElement {
  return el('span', `mk8-slant ${className}`.trim(), text);
}

/** The blue header band with its slanted title (and an optional subtitle). */
export function header(title: string, sub?: string): HTMLElement {
  const band = el('div', 'mk8-hdr');
  band.append(el('h2', 'mk8-slant', title));
  if (sub) band.append(el('span', 'mk8-sub mk8-slant', sub));
  return band;
}

/** A button-bar hint: the pad button it stands for, its label and what a tap does. */
export interface Hint {
  button: 'a' | 'b';
  label: string;
  onPress: () => void;
}

/** The bottom bar: A / B hints that are also buttons on touch. */
export function buttonBar(hints: readonly Hint[]): HTMLElement {
  const bar = el('div', 'mk8-bar');
  for (const hint of hints) {
    const press = el('button', `mk8-hint mk8-hint-${hint.button}`);
    press.type = 'button';
    press.tabIndex = -1;
    press.append(el('i', `mk8-btn mk8-btn-${hint.button}`, hint.button.toUpperCase()), hint.label);
    press.addEventListener('mousedown', (e) => e.preventDefault());
    press.addEventListener('click', hint.onPress);
    bar.append(press);
  }
  return bar;
}

export interface MenuScreenOptions {
  /** Used for the `mk8-scr-<name>` class (tests, per-screen CSS). */
  name: string;
  title: string;
  sub?: string;
  hints: readonly Hint[];
}

/** A menu screen: striped background, header band, body, button bar. */
export function menuScreen(options: MenuScreenOptions): { el: HTMLElement; body: HTMLElement } {
  const screen = el('section', `mk8-scr mk8-menu-bg mk8-scr-${options.name}`);
  const body = el('div', 'mk8-body');
  screen.append(header(options.title, options.sub), body, buttonBar(options.hints));
  return { el: screen, body };
}

/** A tile's picture: a sprite URL, or (no pack) a stand-in with the label's initial. */
export function art(url: string | undefined, label: string): HTMLElement {
  if (url) {
    const img = el('img', 'mk8-art');
    img.src = url;
    img.alt = '';
    img.draggable = false;
    return img;
  }
  return el('span', 'mk8-art mk8-art-stand-in', label.charAt(0));
}

/** The wide slanted tile of mode lists (Grand Prix, Time Trials, ...). */
export function wideTile(label: string, detail: string, picture: HTMLElement): HTMLButtonElement {
  const tile = el('button', 'mk8-tile mk8-wide');
  tile.type = 'button';
  const text = el('span', 'mk8-wide-text');
  text.append(el('b', '', label), el('small', '', detail));
  tile.append(picture, text);
  tile.setAttribute('aria-label', label);
  return tile;
}

/** The square blue tile of character and cup grids. */
export function squareTile(label: string, picture: HTMLElement): HTMLButtonElement {
  const tile = el('button', 'mk8-tile mk8-square');
  tile.type = 'button';
  tile.append(picture);
  tile.setAttribute('aria-label', label);
  return tile;
}

/** The blue slanted nameplate (character and course names). */
export function nameplate(
  name: string,
  detail = '',
): {
  el: HTMLElement;
  set(name: string, detail?: string): void;
} {
  const plate = el('div', 'mk8-nameplate');
  const b = el('b', 'mk8-slant');
  const small = el('small', '');
  plate.append(b, small);
  const set = (n: string, d = '') => {
    b.textContent = n;
    small.textContent = d;
  };
  set(name, detail);
  return { el: plate, set };
}

/** A white rounded panel (side art, stats). */
export function panel(className = ''): HTMLElement {
  return el('div', `mk8-panel ${className}`.trim());
}
