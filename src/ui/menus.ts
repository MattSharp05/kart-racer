import { KART_IDS, KARTS, type KartId } from '../sim/data/karts';
import type { EngineClass } from '../sim/tuning';
import { formatTime, ordinal } from './hud/format';

export interface ResultRowView {
  position: number;
  name: string;
  you: boolean;
  time?: number;
}

const STAT_LABELS = [
  ['speed', 'Speed'],
  ['acceleration', 'Acceleration'],
  ['handling', 'Handling'],
  ['weight', 'Weight'],
] as const;

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  if (className) el.className = className;
  el.addEventListener('click', onClick);
  return el;
}

/**
 * The menu screens (MK-25): title, kart select, engine class, pause and results. Plain DOM over the
 * 3D scene; every screen works with keyboard (arrows / Enter / Esc), mouse and touch.
 */
export class Menus {
  private readonly root = document.createElement('div');
  private keyHandler: ((e: KeyboardEvent) => void) | undefined;
  /** Name of the screen currently shown ('none' when racing). */
  current = 'none';
  /** Sound on/off (MK-26): a toggle button on the title and pause screens. */
  sound: { isMuted: () => boolean; toggle: () => void } | undefined;

  constructor() {
    this.root.className = 'menus';
    this.root.hidden = true;
    document.body.append(this.root);
    window.addEventListener('keydown', (e) => this.keyHandler?.(e));
  }

  hide(): void {
    this.current = 'none';
    this.root.hidden = true;
    this.root.replaceChildren();
    this.keyHandler = undefined;
  }

  showTitle(onPlay: () => void): void {
    const panel = this.open('title');
    const logo = document.createElement('h1');
    logo.className = 'logo';
    logo.textContent = 'Kart Racer';
    const play = button('Play', onPlay, 'primary');
    panel.append(logo, play);
    this.appendSoundToggle(panel);
    play.focus();
    this.keyHandler = (e) => {
      if (e.key === 'Enter' && document.activeElement !== play) onPlay();
    };
  }

  showKartSelect(
    initial: KartId,
    handlers: {
      onChange: (kart: KartId) => void;
      onChoose: (kart: KartId) => void;
      onBack: () => void;
    },
  ): void {
    const panel = this.open('kartSelect');
    let index = Math.max(0, KART_IDS.indexOf(initial));
    const title = document.createElement('h2');
    title.textContent = 'Choose your kart';
    const card = document.createElement('div');
    card.className = 'kart-card';
    const prev = button('‹', () => move(-1), 'arrow');
    prev.setAttribute('aria-label', 'Previous kart');
    const next = button('›', () => move(1), 'arrow');
    next.setAttribute('aria-label', 'Next kart');
    const info = document.createElement('div');
    info.className = 'kart-info';
    card.append(prev, info, next);
    const choose = button('Choose', () => handlers.onChoose(kart()), 'primary');
    const back = button('Back', handlers.onBack);
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(back, choose);
    panel.append(title, card, actions);

    const kart = () => KART_IDS[index] ?? 'maple';
    const render = () => {
      const def = KARTS[kart()];
      info.replaceChildren();
      const name = document.createElement('h3');
      name.textContent = def.name;
      const tagline = document.createElement('p');
      tagline.textContent = def.tagline;
      const stats = document.createElement('dl');
      stats.className = 'stats';
      for (const [key, label] of STAT_LABELS) {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.setAttribute('aria-label', `${label} ${def.stats[key]} of 5`);
        for (let i = 1; i <= 5; i += 1) {
          const pip = document.createElement('span');
          pip.className = i <= def.stats[key] ? 'pip on' : 'pip';
          dd.append(pip);
        }
        stats.append(dt, dd);
      }
      info.append(name, tagline, stats);
      info.dataset.kart = kart();
      handlers.onChange(kart());
    };
    const move = (delta: number) => {
      index = (index + delta + KART_IDS.length) % KART_IDS.length;
      render();
    };
    render();
    choose.focus();
    this.keyHandler = (e) => {
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'Escape') handlers.onBack();
    };
  }

  showCcSelect(
    initial: EngineClass,
    handlers: { onChoose: (cc: EngineClass) => void; onBack: () => void },
  ): void {
    const panel = this.open('ccSelect');
    const title = document.createElement('h2');
    title.textContent = 'Engine class';
    const options = document.createElement('div');
    options.className = 'actions cc';
    const labels: Record<EngineClass, string> = {
      50: '50cc · Easy',
      100: '100cc · Normal',
      150: '150cc · Fast',
    };
    const buttons = ([50, 100, 150] as const).map((cc) => {
      const b = button(labels[cc], () => handlers.onChoose(cc), cc === initial ? 'primary' : '');
      b.dataset.cc = String(cc);
      return b;
    });
    options.append(...buttons);
    const back = button('Back', handlers.onBack);
    panel.append(title, options, back);
    buttons[[50, 100, 150].indexOf(initial)]?.focus();
    this.keyHandler = (e) => {
      if (e.key === 'Escape') handlers.onBack();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          buttons[(i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
        next?.focus();
      }
    };
  }

  showPause(handlers: { onResume: () => void; onRestart: () => void; onQuit: () => void }): void {
    const panel = this.open('paused');
    const title = document.createElement('h2');
    title.textContent = 'Paused';
    const resume = button('Resume', handlers.onResume, 'primary');
    const actions = document.createElement('div');
    actions.className = 'actions column';
    actions.append(
      resume,
      button('Restart race', handlers.onRestart),
      button('Quit to title', handlers.onQuit),
    );
    panel.append(title, actions);
    this.appendSoundToggle(actions);
    resume.focus();
    this.keyHandler = (e) => {
      if (e.key === 'Escape') handlers.onResume();
    };
  }

  showResults(
    rows: ResultRowView[],
    bestNote: string,
    handlers: { onAgain: () => void; onChangeKart: () => void; onMenu: () => void },
  ): void {
    const panel = this.open('results');
    const you = rows.find((r) => r.you);
    const title = document.createElement('h2');
    title.textContent = you ? `You finished ${ordinal(you.position)}!` : 'Results';
    const list = document.createElement('ol');
    list.className = 'results';
    for (const row of rows) {
      const li = document.createElement('li');
      if (row.you) li.className = 'you';
      li.innerHTML = `<span>${ordinal(row.position)}</span><span></span><span>${row.time !== undefined ? formatTime(row.time) : '—'}</span>`;
      const nameCell = li.children[1];
      if (nameCell) nameCell.textContent = row.you ? `${row.name} (you)` : row.name;
      list.append(li);
    }
    panel.append(title, list);
    if (bestNote) {
      const note = document.createElement('p');
      note.className = 'best';
      note.textContent = bestNote;
      panel.append(note);
    }
    const again = button('Race again', handlers.onAgain, 'primary');
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(
      button('Menu', handlers.onMenu),
      button('Change kart', handlers.onChangeKart),
      again,
    );
    panel.append(actions);
    again.focus();
    this.keyHandler = undefined;
  }

  private appendSoundToggle(parent: HTMLElement): void {
    const sound = this.sound;
    if (!sound) return;
    const label = () => (sound.isMuted() ? '🔇 Sound off' : '🔊 Sound on');
    const refresh = () => {
      toggle.textContent = label();
      toggle.dataset.muted = String(sound.isMuted());
    };
    const toggle = button(
      label(),
      () => {
        sound.toggle();
        refresh();
      },
      'sound-toggle',
    );
    toggle.dataset.muted = String(sound.isMuted());
    parent.append(toggle);
    this.refreshSound = refresh;
  }

  /** Updates the sound button after the M key toggled mute. */
  refreshSound: () => void = () => {};

  private open(name: string): HTMLElement {
    this.current = name;
    this.root.hidden = false;
    this.root.replaceChildren();
    this.root.dataset.screen = name;
    const panel = document.createElement('div');
    panel.className = `menu-panel menu-${name}`;
    this.root.append(panel);
    return panel;
  }
}

/** Round pause button shown during races (touch-friendly; Esc does the same on keyboards). */
export function createPauseButton(onPause: () => void): HTMLButtonElement {
  const el = button('❚❚', onPause, 'pause-button');
  el.setAttribute('aria-label', 'Pause');
  document.body.append(el);
  return el;
}
