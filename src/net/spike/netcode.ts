import { sunnyRace } from '../../scenarios/race';
import { step } from '../../sim/step';
import { DT } from '../../sim/tuning';
import type { Vec3 } from '../../sim/math';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from '../../sim/types';
import type { Transport } from '../transport';
import {
  applySnapshot,
  decodeMessage,
  encodeHello,
  encodeInputs,
  encodePing,
  encodeSnapshot,
  INPUT_REDUNDANCY,
  MSG,
  quantizeInput,
  type SnapshotMessage,
} from './protocol';

/** Host sends a snapshot every this many ticks (60 / 3 = 20 Hz, ADR 0005). */
export const SNAPSHOT_EVERY_TICKS = 3;
/** Client runs this many ticks ahead of its RTT estimate, so inputs reach the host in time. */
export const INPUT_BUFFER_TICKS = 2;
/** Host repeats its hello this often until the client answers, ticks (0.25 s). */
const HELLO_REPEAT_TICKS = 15;
/** Client pings the host this often, ticks (0.5 s). */
const PING_EVERY_TICKS = 30;
/** RTT assumed until the first pong, ms. */
const DEFAULT_RTT_MS = 100;
/** Weight of a new RTT sample in the smoothed RTT. */
const RTT_SMOOTHING = 0.2;
/** If the client's tick is further than this from its target, it jumps instead of easing. */
const MAX_TICK_DRIFT = 4;
/** Karts in the spike race: 2 humans (host = kart 0, client = kart 1) + 6 AI. */
export const SPIKE_KARTS = 8;
export const HOST_KART = 0;
export const CLIENT_KART = 1;

/** The spike race: Sunny Circuit, 8 karts, karts 0 and 1 human, the rest AI. */
export function spikeRace(seed: number): SimState {
  const state = sunnyRace(seed, { karts: SPIKE_KARTS, ai: true });
  const client = state.karts[CLIENT_KART];
  if (client) delete client.ai;
  return state;
}

/** Numbers the spike reports (ticket MK-36 → Measurements). */
export interface NetStats {
  rttMs: number;
  bytesSent: number;
  bytesReceived: number;
  packetsSent: number;
  packetsReceived: number;
  snapshots: number;
  /** Average and largest snapshot payload, bytes. */
  snapshotBytesAvg: number;
  snapshotBytesMax: number;
  /** Client: time to reset + re-simulate per snapshot, ms (average, max) and ticks replayed. */
  resimMsAvg: number;
  resimMsMax: number;
  resimTicksAvg: number;
  /** Client: distance between its prediction for tick T and the host's kart at T, m. */
  predictionErrorAvg: number;
  predictionErrorMax: number;
  /** Client: the same for the other human karts (predicted from their last known input), m. */
  remoteErrorAvg: number;
  remoteErrorMax: number;
  /** Host: remote inputs that arrived after their tick was simulated. */
  lateInputs: number;
  /** Snapshots dropped because a newer one had already arrived. */
  staleSnapshots: number;
}

function emptyStats(): NetStats {
  return {
    rttMs: 0,
    bytesSent: 0,
    bytesReceived: 0,
    packetsSent: 0,
    packetsReceived: 0,
    snapshots: 0,
    snapshotBytesAvg: 0,
    snapshotBytesMax: 0,
    resimMsAvg: 0,
    resimMsMax: 0,
    resimTicksAvg: 0,
    predictionErrorAvg: 0,
    predictionErrorMax: 0,
    remoteErrorAvg: 0,
    remoteErrorMax: 0,
    lateInputs: 0,
    staleSnapshots: 0,
  };
}

function runningAverage(avg: number, count: number, sample: number): number {
  return avg + (sample - avg) / count;
}

interface RemotePlayer {
  transport: Transport;
  kartId: number;
  inputs: Map<number, InputFrame>;
  lastInput: InputFrame;
  newestTick: number;
  stats: NetStats;
}

/** Authoritative side: runs the real sim, applies remote inputs by tick, sends snapshots at 20 Hz. */
export class NetHost {
  state: SimState;
  readonly remotes: RemotePlayer[] = [];
  lastLocalInput: InputFrame = NEUTRAL_INPUT;

  constructor(
    initial: SimState,
    private readonly seed: number,
    readonly localKartId = HOST_KART,
  ) {
    this.state = initial;
  }

  /** Adds a client on an open transport and tells it which kart it drives. */
  addClient(transport: Transport, kartId: number): RemotePlayer {
    const remote: RemotePlayer = {
      transport,
      kartId,
      inputs: new Map(),
      lastInput: NEUTRAL_INPUT,
      newestTick: 0,
      stats: emptyStats(),
    };
    this.remotes.push(remote);
    transport.onMessage((packet) => this.receive(remote, packet));
    this.send(remote, encodeHello(this.seed, kartId));
    return remote;
  }

  /** Simulates one tick with the local player's input, then snapshots every 3rd tick. */
  tick(localInput: InputFrame): void {
    const nextTick = this.state.tick + 1;
    const inputs: InputFrame[] = [];
    this.lastLocalInput = quantizeInput(localInput);
    inputs[this.localKartId] = this.lastLocalInput;
    for (const remote of this.remotes) {
      // The hello can be lost like any packet: repeat it until the client's inputs arrive.
      if (remote.newestTick === 0 && nextTick % HELLO_REPEAT_TICKS === 0) {
        this.send(remote, encodeHello(this.seed, remote.kartId));
      }
      const input = remote.inputs.get(nextTick);
      if (input) remote.lastInput = input;
      else if (remote.newestTick > 0) remote.stats.lateInputs += 1;
      inputs[remote.kartId] = remote.lastInput;
      for (const tick of remote.inputs.keys()) if (tick <= nextTick) remote.inputs.delete(tick);
    }
    this.state = step(this.state, inputs).state;
    if (this.state.tick % SNAPSHOT_EVERY_TICKS === 0) this.broadcastSnapshot();
  }

  private broadcastSnapshot(): void {
    const humans = [
      { kartId: this.localKartId, input: this.lastLocalInput },
      ...this.remotes.map((r) => ({ kartId: r.kartId, input: r.lastInput })),
    ];
    for (const remote of this.remotes) {
      const packet = encodeSnapshot(this.state, remote.newestTick, humans);
      const s = remote.stats;
      s.snapshots += 1;
      s.snapshotBytesAvg = runningAverage(s.snapshotBytesAvg, s.snapshots, packet.length);
      s.snapshotBytesMax = Math.max(s.snapshotBytesMax, packet.length);
      this.send(remote, packet);
    }
  }

  private receive(remote: RemotePlayer, packet: Uint8Array): void {
    remote.stats.bytesReceived += packet.length;
    remote.stats.packetsReceived += 1;
    const msg = decodeMessage(packet);
    if (msg.type === MSG.ping) this.send(remote, encodePing(MSG.pong, msg.time));
    if (msg.type !== MSG.input) return;
    remote.newestTick = Math.max(remote.newestTick, msg.newestTick);
    msg.inputs.forEach((input, i) => {
      const tick = msg.newestTick - i;
      if (tick > this.state.tick) remote.inputs.set(tick, input);
    });
  }

  private send(remote: RemotePlayer, packet: Uint8Array): void {
    remote.stats.bytesSent += packet.length;
    remote.stats.packetsSent += 1;
    remote.transport.send(packet);
  }
}

/**
 * Predicting side: runs its own copy of the sim ahead of the host. On each snapshot it resets to
 * the host's state and replays its own inputs since then (ADR 0005 "rollback-lite").
 */
export class NetClient {
  /** Predicted state (null until the host's hello and first snapshot). */
  state: SimState | null = null;
  kartId = CLIENT_KART;
  readonly stats = emptyStats();
  private initial: SimState | null = null;
  private readonly history = new Map<number, InputFrame>();
  private readonly predicted = new Map<number, Vec3[]>();
  private readonly remoteInputs = new Map<number, InputFrame>();
  private lastSnapshotTick = -1;
  private rttMs = DEFAULT_RTT_MS;
  private ticksSincePing = PING_EVERY_TICKS;
  private resims = 0;
  private errorSamples = 0;

  constructor(
    private readonly transport: Transport,
    private readonly now: () => number = () => performance.now(),
  ) {
    transport.onMessage((packet) => this.receive(packet));
  }

  get started(): boolean {
    return this.state !== null;
  }

  /** Predicts one tick with the local input and sends the recent inputs to the host. */
  tick(localInput: InputFrame): void {
    this.ticksSincePing += 1;
    if (this.ticksSincePing >= PING_EVERY_TICKS) {
      this.ticksSincePing = 0;
      this.send(encodePing(MSG.ping, this.now()));
    }
    if (!this.state) return;
    const nextTick = this.state.tick + 1;
    this.history.set(nextTick, quantizeInput(localInput));
    this.state = this.simulate(this.state);
    const recent: InputFrame[] = [];
    for (let t = nextTick; t > nextTick - INPUT_REDUNDANCY; t -= 1) {
      const input = this.history.get(t);
      if (!input) break;
      recent.push(input);
    }
    this.send(encodeInputs(nextTick, recent));
  }

  /** Ticks the client should be ahead of the newest snapshot: a full RTT plus a small buffer. */
  leadTicks(): number {
    return Math.ceil(this.rttMs / 1000 / DT) + INPUT_BUFFER_TICKS;
  }

  private simulate(state: SimState): SimState {
    const nextTick = state.tick + 1;
    const inputs: InputFrame[] = [];
    for (const [kartId, input] of this.remoteInputs) inputs[kartId] = input;
    // A tick the client skipped ahead over has no input yet: hold the previous one, and remember
    // it so it's sent to the host too.
    let own = this.history.get(nextTick);
    if (!own) {
      own = this.history.get(nextTick - 1) ?? NEUTRAL_INPUT;
      this.history.set(nextTick, own);
    }
    inputs[this.kartId] = own;
    const next = step(state, inputs).state;
    this.predicted.set(
      next.tick,
      next.karts.map((k) => ({ ...k.position })),
    );
    return next;
  }

  private receive(packet: Uint8Array): void {
    this.stats.bytesReceived += packet.length;
    this.stats.packetsReceived += 1;
    const msg = decodeMessage(packet);
    if (msg.type === MSG.hello) {
      if (this.initial) return; // A repeat.
      this.kartId = msg.kartId;
      this.initial = spikeRace(msg.seed);
    } else if (msg.type === MSG.pong) {
      const sample = this.now() - msg.time;
      this.rttMs =
        this.stats.rttMs === 0 ? sample : this.rttMs + (sample - this.rttMs) * RTT_SMOOTHING;
      this.stats.rttMs = this.rttMs;
    } else if (msg.type === MSG.snapshot) {
      this.onSnapshot(msg, packet.length);
    }
  }

  private onSnapshot(msg: SnapshotMessage, size: number): void {
    const base = this.state ?? this.initial;
    if (!base) return;
    if (msg.tick <= this.lastSnapshotTick) {
      this.stats.staleSnapshots += 1;
      return;
    }
    this.lastSnapshotTick = msg.tick;
    const s = this.stats;
    s.snapshots += 1;
    s.snapshotBytesAvg = runningAverage(s.snapshotBytesAvg, s.snapshots, size);
    s.snapshotBytesMax = Math.max(s.snapshotBytesMax, size);
    for (const { kartId, input } of msg.humanInputs) {
      if (kartId !== this.kartId) this.remoteInputs.set(kartId, input);
    }

    const started = this.now();
    let state = applySnapshot(structuredClone(base), msg.tick, msg.bytes);
    this.measureError(state);

    // Where the client should be: a full RTT + buffer ahead of the snapshot. Ease towards it one
    // tick per snapshot; jump when far off (start, lag spikes).
    const target = msg.tick + this.leadTicks();
    const current = this.state?.tick ?? target;
    const drift = target - current;
    const goal =
      Math.abs(drift) > MAX_TICK_DRIFT ? target : Math.max(msg.tick, current + Math.sign(drift));
    for (let t = msg.tick; t < goal; t += 1) state = this.simulate(state);
    this.state = state;

    const ms = this.now() - started;
    this.resims += 1;
    s.resimMsAvg = runningAverage(s.resimMsAvg, this.resims, ms);
    s.resimMsMax = Math.max(s.resimMsMax, ms);
    s.resimTicksAvg = runningAverage(s.resimTicksAvg, this.resims, goal - msg.tick);
    for (const tick of this.history.keys()) if (tick <= msg.tick) this.history.delete(tick);
    for (const tick of this.predicted.keys()) if (tick < msg.tick) this.predicted.delete(tick);
  }

  /** Compares what we predicted for the snapshot's tick with what the host says happened. */
  private measureError(authoritative: SimState): void {
    const predicted = this.predicted.get(authoritative.tick);
    if (!predicted) return;
    const distance = (id: number) => {
      const a = predicted[id];
      const b = authoritative.karts[id]?.position;
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : 0;
    };
    this.errorSamples += 1;
    const s = this.stats;
    const own = distance(this.kartId);
    s.predictionErrorAvg = runningAverage(s.predictionErrorAvg, this.errorSamples, own);
    s.predictionErrorMax = Math.max(s.predictionErrorMax, own);
    const remote = Math.max(0, ...[...this.remoteInputs.keys()].map(distance));
    s.remoteErrorAvg = runningAverage(s.remoteErrorAvg, this.errorSamples, remote);
    s.remoteErrorMax = Math.max(s.remoteErrorMax, remote);
  }

  private send(packet: Uint8Array): void {
    this.stats.bytesSent += packet.length;
    this.stats.packetsSent += 1;
    this.transport.send(packet);
  }
}
