import { requestTiltPermission, tiltNeedsPermission } from '../../input/tiltMath';
import { NEUTRAL_INPUT, type InputFrame } from '../../sim/types';
import { REMOTE, REMOTE_PAD } from '../config';
import type { ControllerState } from '../controller';
import type { BuzzKind, RemoteButtons } from '../protocol';
import {
  calibratedNeutral,
  loadPadPrefs,
  padSteer,
  savePadPrefs,
  TiltSensor,
  type PadPrefs,
  type SteeringMode,
} from './steering';
import './remote.css';

/**
 * The phone controller's screen (MK-147): a white remote held sideways, D-pad on the left (item,
 * look back, and left/right for touch steering), Gas, Drift and Brake on the right, the player's
 * light and the status in the middle. Steering is tilt by default (turn the phone like a wheel;
 * iPhones ask for motion access through a Start tap) or touch, saved on the phone. The page's
 * wiring (`main.ts`) calls `read()` once per input packet.
 */
export interface RemoteView {
  /** The controls held right now. */
  read(): PadState;
  setStatus(state: ControllerState | 'invalid', player: number): void;
  /** The debug line (`&netdebug=1`), or null to hide it. */
  setDebug(text: string | null): void;
  /** Something happened to this player's kart: vibrate where the phone can, and flash. */
  buzz(kind: BuzzKind): void;
  /** The current steering mode. */
  readonly steering: SteeringMode;
}

export interface PadState {
  input: InputFrame;
  buttons: RemoteButtons;
}

type Control = 'left' | 'right' | 'gas' | 'brake' | 'item' | 'drift' | 'lookBack' | 'pause';

const STATUS: Record<ControllerState | 'invalid', string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  lost: 'Disconnected. Scan the code on the game screen again.',
  failed: "Couldn't connect. Check the game is showing its codes, then scan again.",
  invalid: 'This link is missing its code. Scan the QR code on the game screen.',
};

const NOTES = {
  denied:
    "Motion access was turned down, so you're steering by touch. To tilt, allow Motion & Orientation for this site, then reload.",
  failed: "Couldn't turn on tilt, so you're steering by touch.",
  noSensor: 'No tilt sensor found. Tap Steering to steer by touch.',
  level: 'Level set: hold it like this to go straight.',
} as const;

/** How long a buzz flashes the remote, ms. */
const FLASH_MS = 250;
/** How long a note like "Level set" stays, ms. */
const NOTE_MS = 2500;

export function createRemoteView(
  root: HTMLElement,
  onReconnect: () => void,
  storage: Storage | null = safeStorage(),
): RemoteView {
  const prefs: PadPrefs = loadPadPrefs(storage);
  const sensor = new TiltSensor();
  const held = new Map<Control, Set<number>>();
  /** Tilt needs a Start tap first (iPhone motion access) until it's given. */
  let tiltReady = !tiltNeedsPermission();
  let state: ControllerState | 'invalid' = 'connecting';
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  // Portrait: a hint to turn the phone (the remote is held sideways).
  const rotate = el('div', 'remote-rotate');
  rotate.append(
    el('div', 'remote-rotate-icon'),
    el('p', 'remote-rotate-text', 'Turn your phone sideways, like a remote in a steering wheel.'),
  );

  const body = el('div', 'remote-body');

  // Left: the D-pad.
  const dpad = el('div', 'remote-dpad remote-controls');
  dpad.append(
    controlButton('item', 'Item', 'remote-dpad-up', held),
    controlButton('left', '◀', 'remote-dpad-left', held, 'Steer left'),
    el('span', 'remote-dpad-hub'),
    controlButton('right', '▶', 'remote-dpad-right', held, 'Steer right'),
    controlButton('lookBack', 'Look back', 'remote-dpad-down', held),
  );

  // Middle: the player's light, status, steering meter and the small buttons.
  const middle = el('div', 'remote-middle');
  const leds = el('div', 'remote-leds');
  leds.setAttribute('aria-hidden', 'true');
  const ledEls = Array.from({ length: REMOTE.slots }, () => el('span', 'remote-led'));
  leds.append(...ledEls);
  const status = el('p', 'remote-status');
  status.setAttribute('role', 'status');
  const reconnect = el('button', 'remote-reconnect', 'Reconnect');
  reconnect.type = 'button';
  reconnect.hidden = true;
  reconnect.addEventListener('click', onReconnect);
  const gauge = el('div', 'remote-gauge remote-controls');
  gauge.setAttribute('aria-hidden', 'true');
  gauge.append(el('span', 'remote-gauge-needle'));
  const note = el('p', 'remote-note');
  note.setAttribute('aria-live', 'polite');
  const small = el('div', 'remote-small-row remote-controls');
  const pause = controlButton('pause', 'Pause', 'remote-small', held);
  const level = actionButton('level', 'Level', () => setLevel());
  const steeringToggle = actionButton('steering', '', () =>
    setSteering(prefs.steering === 'tilt' ? 'touch' : 'tilt', true),
  );
  small.append(pause, level, steeringToggle);
  const grille = el('div', 'remote-grille');
  grille.setAttribute('aria-hidden', 'true');
  middle.append(leds, status, reconnect, gauge, note, small, grille);

  // Right: Drift, Brake and the big Gas.
  const face = el('div', 'remote-face remote-controls');
  face.append(
    controlButton('drift', 'Drift', 'remote-round remote-round-small', held),
    controlButton('brake', 'Brake', 'remote-round remote-round-small', held),
    controlButton('gas', 'Gas', 'remote-round remote-gas', held),
  );
  body.append(dpad, middle, face);

  // Tilt on an iPhone: Start asks for motion access (only a tap can).
  const start = el('div', 'remote-start');
  start.setAttribute('role', 'dialog');
  start.setAttribute('aria-labelledby', 'remote-start-title');
  const startTitle = el('h1', 'remote-start-title', 'Tilt to steer');
  startTitle.id = 'remote-start-title';
  const startHelp = el(
    'p',
    'remote-start-help',
    'Hold your phone sideways like a steering wheel and tap Start. Level, it goes straight; tap Level any time to make the way you hold it straight.',
  );
  const startButton = actionButton('start', 'Start', () => void startTilt());
  startButton.classList.add('remote-start-button');
  const touchInstead = actionButton('touch-instead', 'Steer by touch instead', () =>
    setSteering('touch', true),
  );
  touchInstead.classList.add('remote-start-touch');
  start.append(startTitle, startHelp, startButton, touchInstead);

  const debug = el('pre', 'remote-debug');
  debug.dataset.testid = 'remote-debug';
  debug.hidden = true;
  root.append(body, start, rotate, debug);

  // No long-press menus, text selection or double-tap zoom while holding buttons.
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  // A touch the system took (Control Center, a notification, the app switcher) may never send its
  // pointerup: let go of everything rather than drive on by itself.
  const releaseAll = () => {
    for (const pointers of held.values()) pointers.clear();
    for (const node of root.querySelectorAll('.held')) node.classList.remove('held');
  };
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', releaseAll);

  function showNote(text: string, forMs?: number): void {
    clearTimeout(noteTimer);
    note.textContent = text;
    if (forMs) noteTimer = setTimeout(() => (note.textContent = ''), forMs);
  }

  function setLevel(): void {
    const angle = sensor.angle();
    if (angle === null) return;
    prefs.neutral = calibratedNeutral(angle);
    savePadPrefs(storage, prefs);
    showNote(NOTES.level, NOTE_MS);
  }

  function listen(): void {
    if (prefs.steering === 'tilt' && tiltReady) sensor.start(() => showNote(NOTES.noSensor));
    else sensor.stop();
  }

  function setSteering(mode: SteeringMode, save: boolean): void {
    prefs.steering = mode;
    if (save) savePadPrefs(storage, prefs);
    root.dataset.steering = mode;
    steeringToggle.textContent = mode === 'tilt' ? 'Steering: Tilt' : 'Steering: Touch';
    level.hidden = mode !== 'tilt';
    if (mode === 'tilt') showNote('');
    // The D-pad's left and right steer only by touch: drop a thumb resting there.
    for (const id of ['left', 'right'] as const) held.get(id)?.clear();
    for (const node of dpad.querySelectorAll('.held')) node.classList.remove('held');
    listen();
    updateStart();
  }

  async function startTilt(): Promise<void> {
    const answer = await requestTiltPermission();
    if (answer === 'granted') {
      tiltReady = true;
      showNote('');
      listen();
    } else {
      setSteering('touch', false);
      showNote(NOTES[answer]);
    }
    updateStart();
  }

  function updateStart(): void {
    start.hidden = !(prefs.steering === 'tilt' && !tiltReady && state !== 'invalid');
  }

  const down = (id: Control) => (held.get(id)?.size ?? 0) > 0;
  const steer = (): number => {
    if (prefs.steering === 'touch') return (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
    const angle = tiltReady ? sensor.angle() : null;
    return angle === null ? 0 : padSteer(angle, prefs.neutral);
  };

  setSteering(prefs.steering, false);

  return {
    get steering() {
      return prefs.steering;
    },
    read: () => {
      const steering = steer();
      gauge.style.setProperty('--steer', steering.toFixed(3));
      return {
        input: {
          ...NEUTRAL_INPUT,
          throttle: down('gas') ? 1 : 0,
          brake: down('brake') ? 1 : 0,
          steer: steering,
          drift: down('drift'),
          item: down('item'),
        },
        buttons: { lookBack: down('lookBack'), pause: down('pause') },
      };
    },
    setStatus: (next, player) => {
      state = next;
      root.dataset.state = next;
      const colour = REMOTE_PAD.slotColours[player - 1];
      if (colour) root.style.setProperty('--slot', colour);
      ledEls.forEach((led, i) => led.classList.toggle('lit', i === player - 1));
      status.textContent =
        next === 'connected' || next === 'connecting'
          ? `Player ${player} · ${STATUS[next]}`
          : STATUS[next];
      reconnect.hidden = next !== 'lost' && next !== 'failed';
      updateStart();
    },
    setDebug: (text) => {
      debug.hidden = text === null;
      if (text !== null) debug.textContent = text;
    },
    buzz: (kind) => {
      navigator.vibrate?.([...REMOTE_PAD.buzz[kind]]);
      clearTimeout(flashTimer);
      body.dataset.buzz = kind;
      flashTimer = setTimeout(() => delete body.dataset.buzz, FLASH_MS);
    },
  };
}

function actionButton(action: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'remote-small';
  button.dataset.action = action;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function controlButton(
  id: Control,
  label: string,
  className: string,
  held: Map<Control, Set<number>>,
  ariaLabel?: string,
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `remote-button ${className}`;
  el.textContent = label;
  el.dataset.control = id;
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  const pointers = new Set<number>();
  held.set(id, pointers);
  const press = (e: PointerEvent) => {
    e.preventDefault();
    pointers.add(e.pointerId);
    el.classList.add('held');
    // Keeps the press when the thumb slides off the button (fails for a pointer already gone).
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Released already: pointerup follows.
    }
  };
  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) el.classList.remove('held');
  };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
  return el;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
