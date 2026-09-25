import { BaseTransport, type Transport } from './transport';

/** Simulated network conditions, one way (docs/TDD.md → v2 testing: `&netsim=150,30,5`). */
export interface NetConditions {
  /** Base one-way delay, ms. */
  lagMs: number;
  /** Extra random delay, 0..jitterMs, ms. Makes packets arrive out of order. */
  jitterMs: number;
  /** Chance a packet is lost, 0..1. */
  loss: number;
}

export const PERFECT_NETWORK: Readonly<NetConditions> = Object.freeze({
  lagMs: 0,
  jitterMs: 0,
  loss: 0,
});

/** Parses `lag,jitter,loss%` (e.g. `150,30,5`); missing parts are 0. */
export function parseNetConditions(text: string | null | undefined): NetConditions {
  const [lag = 0, jitter = 0, lossPercent = 0] = (text ?? '')
    .split(',')
    .map((part) => Number(part))
    .map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  return { lagMs: lag, jitterMs: jitter, loss: Math.min(1, lossPercent / 100) };
}

export interface LoopbackOptions {
  conditions?: NetConditions;
  /** Random source for jitter and loss (seed it in tests). */
  random?: () => number;
  /** Schedules a delivery; defaults to `setTimeout` (fake timers work in tests). */
  schedule?: (fn: () => void, ms: number) => void;
}

/** One end of an in-memory link. Packets are copied, so senders may reuse their buffers. */
export class LoopbackTransport extends BaseTransport {
  peer: LoopbackTransport | undefined;
  sent = 0;
  lost = 0;

  constructor(private readonly options: Required<LoopbackOptions>) {
    super();
  }

  send(packet: Uint8Array): void {
    const peer = this.peer;
    if (this.state !== 'open' || !peer) return;
    this.sent += 1;
    const { conditions, random, schedule } = this.options;
    if (random() < conditions.loss) {
      this.lost += 1;
      return;
    }
    const copy = packet.slice();
    const delay = conditions.lagMs + random() * conditions.jitterMs;
    schedule(() => peer.receive(copy), delay);
  }

  /** Opens the link (both ends of a pair open together). */
  open(): void {
    this.setState('open');
  }

  override close(): void {
    super.close();
    if (this.peer?.state !== 'closed') this.peer?.close();
  }

  private receive(packet: Uint8Array): void {
    this.deliver(packet);
  }
}

/** Two connected loopback ends, already open. Conditions apply in both directions. */
export function createLoopbackPair(
  options: LoopbackOptions = {},
): [LoopbackTransport, LoopbackTransport] {
  const resolved: Required<LoopbackOptions> = {
    conditions: options.conditions ?? PERFECT_NETWORK,
    random: options.random ?? Math.random,
    schedule: options.schedule ?? ((fn, ms) => void setTimeout(fn, ms)),
  };
  const a = new LoopbackTransport(resolved);
  const b = new LoopbackTransport(resolved);
  a.peer = b;
  b.peer = a;
  a.open();
  b.open();
  return [a, b];
}

/**
 * Wraps a real transport and delays / drops its outgoing packets (`&netsim=lag,jitter,loss` on
 * top of a real connection). Apply it on both ends for a symmetric link.
 */
export class ConditionedTransport extends BaseTransport {
  constructor(
    private readonly inner: Transport,
    private readonly conditions: NetConditions,
    private readonly random: () => number = Math.random,
  ) {
    super();
    inner.onMessage((packet) => this.deliver(packet));
    inner.onStateChange((state) => this.setState(state));
    if (inner.state !== 'connecting') this.setState(inner.state);
  }

  send(packet: Uint8Array): void {
    if (this.random() < this.conditions.loss) return;
    const delay = this.conditions.lagMs + this.random() * this.conditions.jitterMs;
    if (delay <= 0) this.inner.send(packet);
    else {
      const copy = packet.slice();
      setTimeout(() => this.inner.send(copy), delay);
    }
  }

  override close(): void {
    this.inner.close();
    super.close();
  }
}
