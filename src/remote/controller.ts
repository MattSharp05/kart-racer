import type { Transport } from '../net/transport';
import { NEUTRAL_INPUT, type InputFrame } from '../sim/types';
import { REMOTE } from './config';
import { decodeRemote, encodeRemote, type RemoteMessage } from './protocol';
import { RttMeter } from './rtt';

/**
 * The phone's side of a controller link (MK-146): says Hello (repeating until the desktop's
 * Welcome), then sends its controls `REMOTE.inputHz` times a second with rising sequence numbers,
 * and pings for the RTT. The page (`page/`) draws the controls and calls `setInput`.
 */

/**
 * `connecting` → `connected`; `lost`: the desktop let go or went silent (rescan to rejoin);
 * `failed`: never connected (wrong code, desktop closed, no route).
 */
export type ControllerState = 'connecting' | 'connected' | 'lost' | 'failed';

/** The desktop is gone when it's been silent this many times longer than a slot drop. */
const LOST_AFTER_DROPS = 2;

export class RemoteController {
  state: ControllerState = 'connecting';
  /** Input packets sent so far (the next one's sequence number). */
  seq = 0;
  private input: InputFrame = NEUTRAL_INPUT;
  private readonly rtt = new RttMeter();
  private readonly startedAt: number;
  private heardAt: number;
  private lastHello = -Infinity;
  private lastInput = -Infinity;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly slot: number,
    private readonly transport: Transport,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.startedAt = now();
    this.heardAt = this.startedAt;
    transport.onMessage((bytes) => {
      const message = decodeRemote(bytes);
      if (message) this.receive(message);
    });
    transport.onStateChange((state) => {
      if (state === 'closed') this.end(this.state === 'connecting' ? 'failed' : 'lost');
    });
  }

  get rttMs(): number | null {
    return this.rtt.rttMs;
  }

  /** The controls to send from now on. */
  setInput(input: InputFrame): void {
    this.input = input;
  }

  /** Calls `listener` when `state` or the RTT changes. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The link couldn't be made (the links' own `onFailed`: room full, no route). */
  failed(): void {
    this.end(this.state === 'connecting' ? 'failed' : 'lost');
  }

  /** Call often (every frame or faster): sends what's due and notices a silent desktop. */
  tick(): void {
    const now = this.now();
    if (this.state === 'connecting') {
      if (now - this.startedAt > REMOTE.connectTimeoutMs) return this.end('failed');
      if (now - this.lastHello >= REMOTE.helloRetryMs) {
        this.lastHello = now;
        this.send({ type: 'hello', slot: this.slot });
      }
      return;
    }
    if (this.state !== 'connected') return;
    if (now - this.heardAt > REMOTE.dropAfterMs * LOST_AFTER_DROPS) return this.end('lost');
    // Due once per input period; a late timer sends one packet, not a burst.
    if (now - this.lastInput >= 1000 / REMOTE.inputHz - 1) {
      this.lastInput = now;
      this.send({ type: 'input', seq: this.seq, input: this.input });
      this.seq += 1;
    }
    if (this.rtt.due(now)) this.send({ type: 'ping', time: now });
  }

  /** The page is going: tell the desktop at once (it pauses the race) and let go. */
  close(): void {
    if (this.state === 'connected') this.send({ type: 'bye' });
    this.end('lost');
  }

  private receive(message: RemoteMessage): void {
    if (this.state === 'lost' || this.state === 'failed') return;
    const now = this.now();
    this.heardAt = now;
    if (message.type === 'welcome' && message.slot === this.slot && this.state === 'connecting') {
      this.state = 'connected';
      this.changed();
    } else if (message.type === 'ping') {
      this.send({ type: 'pong', time: message.time });
    } else if (message.type === 'pong') {
      this.rtt.pong(message.time, now);
      this.changed();
    } else if (message.type === 'bye') {
      this.end('lost');
    }
  }

  private end(state: 'lost' | 'failed'): void {
    if (this.state === 'lost' || this.state === 'failed') return;
    this.state = state;
    this.transport.close();
    this.changed();
  }

  private send(message: RemoteMessage): void {
    this.transport.send(encodeRemote(message));
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
