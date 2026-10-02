// MK8 Mode's first screens (MK-97): the loading bar, "pack not installed" and the placeholder the
// UI tickets replace. They live in MK8 Mode's own chunk and register with the shared router when
// it loads.
import { registerScreen, type ScreenHandle } from '../../ui/router';
import { button, heading } from '../../ui/screens/common';
import './loading.css';

/** A load's progress, 0–1, that the loading screen follows while it's shown. */
export class Progress {
  private listener: ((fraction: number) => void) | undefined;
  constructor(public fraction = 0) {}

  set(fraction: number): void {
    this.fraction = fraction;
    this.listener?.(fraction);
  }

  /** The screen showing it; `undefined` stops following. */
  follow(listener: ((fraction: number) => void) | undefined): void {
    this.listener = listener;
    listener?.(this.fraction);
  }
}

export interface Mk8LoadingProps {
  /** What is loading, e.g. "Loading MK8 Mode". */
  label: string;
  progress: Progress;
  onBack: () => void;
}

export interface Mk8NotInstalledProps {
  onBack: () => void;
}

export interface Mk8PlaceholderProps {
  onBack: () => void;
}

declare module '../../ui/router' {
  interface ScreenProps {
    mk8Loading: Mk8LoadingProps;
    mk8NotInstalled: Mk8NotInstalledProps;
    mk8Placeholder: Mk8PlaceholderProps;
  }
}

/** The MK8 header band (the mockup's blue, slanted bar) and the panel's MK8 look. */
function frame(panel: HTMLElement, title: string): HTMLElement {
  panel.classList.add('mk8-screen');
  const header = document.createElement('div');
  header.className = 'mk8-header';
  header.append(heading('h2', title));
  const body = document.createElement('div');
  body.className = 'mk8-body';
  panel.append(header, body);
  return body;
}

/** Back button in the footer; Escape or Backspace press it too. */
function backFooter(panel: HTMLElement, onBack: () => void): HTMLButtonElement {
  const back = button('Back', onBack, 'mk8-back');
  const footer = document.createElement('div');
  footer.className = 'mk8-footer';
  footer.append(back);
  panel.append(footer);
  back.focus();
  return back;
}

const backKeys =
  (onBack: () => void): ScreenHandle['onKey'] =>
  (e) => {
    if (e.key === 'Escape' || e.key === 'Backspace') onBack();
  };

registerScreen('mk8Loading', (panel, { label, progress, onBack }) => {
  const body = frame(panel, 'MK8 Mode');
  const text = document.createElement('p');
  text.className = 'mk8-loading-label';
  text.textContent = label;
  const bar = document.createElement('div');
  bar.className = 'mk8-progress';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', label);
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  const fill = document.createElement('i');
  bar.append(fill);
  const percent = document.createElement('span');
  percent.className = 'mk8-progress-percent';
  // Following before the bar is in the page: a load already part-way shows there at once.
  progress.follow((fraction) => {
    const value = Math.round(fraction * 100);
    fill.style.width = `${value}%`;
    bar.setAttribute('aria-valuenow', String(value));
    percent.textContent = `${value} %`;
  });
  body.append(text, bar, percent);
  backFooter(panel, onBack);
  return { onKey: backKeys(onBack), dispose: () => progress.follow(undefined) };
});

/** The commands that build the pack (ADR 0009: Nintendo files are local only). */
const BUILD_STEPS: [string, string][] = [
  ['Put the raw files in', '.mk8-raw/'],
  ['Build the pack:', 'pnpm mk8:build'],
  ['Run the game locally:', 'pnpm dev'],
];

registerScreen('mk8NotInstalled', (panel, { onBack }) => {
  const body = frame(panel, 'MK8 pack not installed');
  const intro = document.createElement('p');
  intro.textContent =
    "MK8 Mode's models, sprites and sounds aren't part of the game. Build them on your computer:";
  const steps = document.createElement('ol');
  steps.className = 'mk8-steps';
  for (const [text, command] of BUILD_STEPS) {
    const item = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = command;
    item.append(`${text} `, code);
    steps.append(item);
  }
  const more = document.createElement('p');
  more.className = 'mk8-note';
  more.textContent = 'Then open MK8 Mode again. Details: tools/mk8/README.md.';
  body.append(intro, steps, more);
  backFooter(panel, onBack);
  return { onKey: backKeys(onBack) };
});

registerScreen('mk8Placeholder', (panel, { onBack }) => {
  const body = frame(panel, 'MK8 Mode');
  const text = document.createElement('p');
  text.textContent = 'The MK8 pack is loaded. Its menus and races are on the way.';
  body.append(text);
  backFooter(panel, onBack);
  return { onKey: backKeys(onBack) };
});
