import type { InputFrame } from '../sim/types';

/**
 * Phone controller packets (MK-146, ADR 0013): a phone and the desktop it drives exchange these
 * over one `Transport` (WebRTC data channel in production, BroadcastChannel for `?net=local`).
 * Delivery is unordered and lossy like UDP, so inputs carry a sequence number and the desktop
 * keeps only the newest (`SequenceFilter`); Hello repeats until Welcome.
 *
 * Every packet starts with its type byte:
 * - Hello (phone → desktop): the slot (0-based) the phone's QR code named.
 * - Welcome (desktop → phone): the slot it got.
 * - Input (phone → desktop): seq u32, steer i8 (±127), throttle u8, brake u8, button flags u8.
 * - Ping / Pong (either way): the sender's clock, f64 ms; Pong echoes it back.
 * - Bye (phone → desktop): the page is closing.
 * - Buzz (desktop → phone, MK-147): something to feel (`BUZZ_KINDS`), one byte; the phone vibrates.
 *
 * The input's button flags (MK-147) also carry look back and pause, which aren't kart controls
 * (`InputFrame`): pause is held while pressed, so a lost packet doesn't lose the press.
 */
export const REMOTE_MSG = {
  hello: 1,
  welcome: 2,
  input: 3,
  ping: 4,
  pong: 5,
  bye: 6,
  buzz: 7,
} as const;

/** What a phone feels (MK-147): its kart was hit by an item, or got a mini-turbo. */
export const BUZZ_KINDS = ['hit', 'turbo'] as const;
export type BuzzKind = (typeof BUZZ_KINDS)[number];

/** The phone's buttons that aren't kart controls (MK-147). */
export interface RemoteButtons {
  lookBack: boolean;
  pause: boolean;
}

export const NO_BUTTONS: Readonly<RemoteButtons> = Object.freeze({ lookBack: false, pause: false });

export type RemoteMessage =
  | { type: 'hello'; slot: number }
  | { type: 'welcome'; slot: number }
  | { type: 'input'; seq: number; input: InputFrame; buttons: RemoteButtons }
  | { type: 'ping'; time: number }
  | { type: 'pong'; time: number }
  | { type: 'bye' }
  | { type: 'buzz'; kind: BuzzKind };

const STEER_SCALE = 127;
const AXIS_SCALE = 255;
const DRIFT = 1;
const ITEM = 2;
const RESPAWN = 4;
const LOOK_BACK = 8;
const PAUSE = 16;
const INPUT_BYTES = 9;
const TIME_BYTES = 9;
const MAX_SEQ = 0xffffffff;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

export function encodeRemote(message: RemoteMessage): Uint8Array {
  switch (message.type) {
    case 'hello':
    case 'welcome':
      return Uint8Array.of(REMOTE_MSG[message.type], message.slot);
    case 'bye':
      return Uint8Array.of(REMOTE_MSG.bye);
    case 'buzz':
      return Uint8Array.of(REMOTE_MSG.buzz, BUZZ_KINDS.indexOf(message.kind));
    case 'ping':
    case 'pong': {
      const bytes = new Uint8Array(TIME_BYTES);
      bytes[0] = REMOTE_MSG[message.type];
      new DataView(bytes.buffer).setFloat64(1, message.time);
      return bytes;
    }
    case 'input': {
      const { input, buttons } = message;
      const bytes = new Uint8Array(INPUT_BYTES);
      const view = new DataView(bytes.buffer);
      bytes[0] = REMOTE_MSG.input;
      view.setUint32(1, message.seq >>> 0);
      view.setInt8(5, Math.round(clamp(input.steer, -1, 1) * STEER_SCALE));
      bytes[6] = Math.round(clamp(input.throttle, 0, 1) * AXIS_SCALE);
      bytes[7] = Math.round(clamp(input.brake, 0, 1) * AXIS_SCALE);
      bytes[8] =
        (input.drift ? DRIFT : 0) |
        (input.item ? ITEM : 0) |
        (input.respawn ? RESPAWN : 0) |
        (buttons.lookBack ? LOOK_BACK : 0) |
        (buttons.pause ? PAUSE : 0);
      return bytes;
    }
  }
}

/** The message in `bytes`, or null when it isn't one (wrong type or length). */
export function decodeRemote(bytes: Uint8Array): RemoteMessage | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = bytes[0];
  switch (type) {
    case REMOTE_MSG.hello:
      return bytes.length === 2 ? { type: 'hello', slot: view.getUint8(1) } : null;
    case REMOTE_MSG.welcome:
      return bytes.length === 2 ? { type: 'welcome', slot: view.getUint8(1) } : null;
    case REMOTE_MSG.bye:
      return bytes.length === 1 ? { type: 'bye' } : null;
    case REMOTE_MSG.buzz: {
      const kind = bytes.length === 2 ? BUZZ_KINDS[view.getUint8(1)] : undefined;
      return kind ? { type: 'buzz', kind } : null;
    }
    case REMOTE_MSG.ping:
      return bytes.length === TIME_BYTES ? { type: 'ping', time: view.getFloat64(1) } : null;
    case REMOTE_MSG.pong:
      return bytes.length === TIME_BYTES ? { type: 'pong', time: view.getFloat64(1) } : null;
    case REMOTE_MSG.input: {
      if (bytes.length !== INPUT_BYTES) return null;
      const flags = view.getUint8(8);
      return {
        type: 'input',
        seq: view.getUint32(1),
        input: {
          steer: view.getInt8(5) / STEER_SCALE,
          throttle: view.getUint8(6) / AXIS_SCALE,
          brake: view.getUint8(7) / AXIS_SCALE,
          drift: (flags & DRIFT) !== 0,
          item: (flags & ITEM) !== 0,
          respawn: (flags & RESPAWN) !== 0,
        },
        buttons: { lookBack: (flags & LOOK_BACK) !== 0, pause: (flags & PAUSE) !== 0 },
      };
    }
    default:
      return null;
  }
}

/**
 * Keeps only inputs newer than the newest one seen: a late (reordered) or repeated packet carries
 * controls the phone has already moved on from, so it's dropped.
 */
export class SequenceFilter {
  private newest = -1;

  /** Whether `seq` is newer than every sequence number accepted so far (and accepts it). */
  accept(seq: number): boolean {
    if (!Number.isInteger(seq) || seq < 0 || seq > MAX_SEQ || seq <= this.newest) return false;
    this.newest = seq;
    return true;
  }

  /** The newest sequence number accepted (-1 before any). */
  get last(): number {
    return this.newest;
  }
}
