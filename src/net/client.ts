import { createRace } from '../sim/race/createRace';
import { step } from '../sim/step';
import { DT } from '../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../sim/types';
import { HOST_EVENTS, NET } from './config';
import {
  applySnapshot,
  decodeMessage,
  encodeBye,
  encodeInputs,
  encodePing,
  MSG,
  PROTOCOL_VERSION,
  quantizeInput,
  type ByeReason,
  type NetEvent,
  type RaceSetup,
  type SnapshotMessage,
} from './protocol';
import type { Transport } from './transport';

/** What the client reports (tests, the perf suite, the netsim overlay). */
export interface ClientStats {
  /** Smoothed round-trip time to the host, ms (0 until the first pong). */
  rttMs: number;
  snapshots: number;
  /** Snapshots dropped because a newer one had already arrived. */
  staleSnapshots: number;
  /** Snapshots whose tick matched the prediction, so nothing was re-simulated. */
  matched: number;
  /** Snapshots that reset the state and re-simulated. */
  reconciled: number;
  /** Ticks re-simulated by the last reconcile (= the unacked inputs replayed). */
  lastReplayTicks: number;
  /** All ticks re-simulated. */
  replayTicks: number;
  /** Time spent handling snapshots (apply + compare + replay), ms: total and worst. */
  snapshotMsTotal: number;
  snapshotMsMax: number;
  /** Own kart: distance between the prediction for a snapshot's tick and the host's, m. */
  predictionErrorMax: number;
  bytesSent: number;
  bytesReceived: number;
  badPackets: number;
}

/** The race a client builds from Start: same karts and AI, its own kart `local`. */
export function raceFromSetup(setup: RaceSetup, localKartId: number): SimState {
  const state = createRace({
    trackId: setup.trackId,
    engineClass: setup.engineClass,
    itemsOn: setup.itemsOn,
    seed: setup.seed,
    laps: setup.laps,
    racers: setup.racers.map((racer, i) => ({
      kartId: racer.kartId,
      controller: i === localKartId ? 'local' : racer.human ? 'remote' : 'ai',
      gridSlot: racer.gridSlot,
      ...(racer.name !== undefined ? { name: racer.name } : {}),
    })),
  });
  // The host's personalities, not ones re-drawn here: the host may have drawn setup randomness
  // (grid, kart picks) from the same stream first.
  setup.racers.forEach((racer, i) => {
    const ai = state.karts[i]?.ai;
    if (ai && racer.ai) Object.assign(ai, racer.ai);
  });
  return state;
}

/**
 * The predicting side of an online race (ADR 0005, "rollback-lite"). Runs its own copy of the sim
 * about a round trip ahead of the host, sending its inputs every tick. On each snapshot it checks
 * its prediction for that tick: if it matches (every kart within `NET.reconcilePosition`, same
 * discrete state, same inputs for the other players), it keeps going; otherwise it resets to the
 * snapshot and re-simulates its unacknowledged inputs up to the present. Race events come only
 * from the host (`takeEvents`).
 */
export class OnlineClient {
  /** Predicted state (null until Start and the first snapshot arrive). */
  state: SimState | null = null;
  /** The kart this client drives (-1 until Start). */
  kartId = -1;
  setup: RaceSetup | null = null;
  /** Set when the race is over for this client: the host ended it, or it left. */
  ended: ByeReason | null = null;
  readonly stats: ClientStats = {
    rttMs: 0,
    snapshots: 0,
    staleSnapshots: 0,
    matched: 0,
    reconciled: 0,
    lastReplayTicks: 0,
    replayTicks: 0,
    snapshotMsTotal: 0,
    snapshotMsMax: 0,
    predictionErrorMax: 0,
    bytesSent: 0,
    bytesReceived: 0,
    badPackets: 0,
  };
  private initial: SimState | null = null;
  /** Own (quantized) inputs by tick: the unacked ones are replayed, the newest few resent. */
  private readonly inputs = new Map<number, InputFrame>();
  /** Predicted state after each recent tick (states are never mutated, so these are shared). */
  private readonly predicted = new Map<number, SimState>();
  /** The other humans' inputs as of the newest snapshot, held for prediction. */
  private readonly remoteInputs = new Map<number, InputFrame>();
  private lastSnapshotTick = -1;
  /** First tick this client sent an input for (host lateness before that isn't ours). */
  private firstInputTick = Infinity;
  /** Ticks to add to the lead because the host reported our input late. */
  private extraLead = 0;
  /** Local ticks to skip (not simulate) to ease back when ahead of the target. */
  private holdTicks = 0;
  private rttMs: number = NET.defaultRttMs;
  private ticksSincePing: number = NET.pingEveryTicks;
  private readonly received: NetEvent[] = [];
  /** Cosmetic events of ticks simulated while handling a snapshot, returned by the next `tick`. */
  private readonly pendingEvents: SimEvent[] = [];
  private onTimeSnapshots = 0;
  private hasRttSample = false;
  private nextEventSeq = 1;

  constructor(
    private readonly transport: Transport,
    private readonly now: () => number = () => performance.now(),
  ) {
    transport.onMessage((packet) => this.receive(packet));
  }

  get started(): boolean {
    return this.state !== null;
  }

  /**
   * Predicts one tick with the local input and sends the recent inputs to the host. Returns the
   * predicted tick's cosmetic events (drift, bumps…); race events come from `takeEvents`.
   */
  tick(localInput: InputFrame): SimEvent[] {
    if (this.ended) return [];
    this.ticksSincePing += 1;
    if (this.ticksSincePing >= NET.pingEveryTicks) {
      this.ticksSincePing = 0;
      this.send(encodePing(MSG.ping, this.now()));
    }
    if (!this.state) return [];
    if (this.holdTicks > 0) {
      // Easing back towards the host: this frame's input still counts, for the next tick.
      this.holdTicks -= 1;
      this.inputs.set(this.state.tick + 1, quantizeInput(localInput));
      return [];
    }
    const nextTick = this.state.tick + 1;
    this.inputs.set(nextTick, quantizeInput(localInput));
    const { state, events } = this.simulate(this.state);
    this.state = state;
    this.sendInputs(nextTick);
    this.pruneHistory(state.tick - NET.historyTicks);
    return [...this.pendingEvents.splice(0), ...cosmetic(events)];
  }

  /** Host race events received since the last call, oldest first, each exactly once. */
  takeEvents(): NetEvent[] {
    return this.received.splice(0).sort((a, b) => a.seq - b.seq);
  }

  /** Leaves the race (tells the host; best effort). */
  leave(): void {
    if (this.ended) return;
    this.send(encodeBye('left'));
    this.ended = 'left';
  }

  /** Ticks the client runs ahead of the newest snapshot: a full RTT plus a buffer. */
  leadTicks(): number {
    return Math.ceil(this.rttMs / 1000 / DT) + NET.inputBufferTicks + this.extraLead;
  }

  private simulate(state: SimState): { state: SimState; events: SimEvent[] } {
    const tick = state.tick + 1;
    const inputs: InputFrame[] = [];
    for (const [kartId, input] of this.remoteInputs) inputs[kartId] = input;
    // A tick skipped over when jumping ahead has no input yet: hold the previous one, and keep it,
    // so it's sent (and replayed) like any other.
    let own = this.inputs.get(tick);
    if (!own) {
      own = this.inputs.get(tick - 1) ?? NEUTRAL_INPUT;
      this.inputs.set(tick, own);
    }
    inputs[this.kartId] = own;
    const result = step(state, inputs);
    this.predicted.set(result.state.tick, result.state);
    return result;
  }

  private sendInputs(newestTick: number): void {
    const recent: InputFrame[] = [];
    for (let t = newestTick; t > newestTick - NET.inputRedundancy; t -= 1) {
      const input = this.inputs.get(t);
      if (!input) break;
      recent.push(input);
    }
    this.firstInputTick = Math.min(this.firstInputTick, newestTick);
    this.send(encodeInputs(newestTick, recent));
  }

  private receive(packet: Uint8Array): void {
    this.stats.bytesReceived += packet.length;
    let msg;
    try {
      msg = decodeMessage(packet);
    } catch {
      this.stats.badPackets += 1;
      return;
    }
    if (this.ended) return;
    switch (msg.type) {
      case MSG.start:
        if (this.initial) return; // A repeat.
        if (msg.version !== PROTOCOL_VERSION) {
          this.send(encodeBye('version'));
          this.ended = 'version';
          return;
        }
        try {
          this.initial = raceFromSetup(msg.setup, msg.kartId);
        } catch {
          // A track or kart this build doesn't have: we can't join this race.
          this.send(encodeBye('version'));
          this.ended = 'version';
          return;
        }
        this.kartId = msg.kartId;
        this.setup = msg.setup;
        break;
      case MSG.pong: {
        const sample = this.now() - msg.time;
        this.rttMs = this.hasRttSample
          ? this.rttMs + (sample - this.rttMs) * NET.rttSmoothing
          : sample;
        this.hasRttSample = true;
        this.stats.rttMs = this.rttMs;
        break;
      }
      case MSG.snapshot:
        this.onSnapshot(msg);
        break;
      case MSG.event:
        for (const event of msg.events) {
          if (event.seq < this.nextEventSeq) continue;
          this.received.push(event);
          this.nextEventSeq = event.seq + 1;
        }
        break;
      case MSG.bye:
        this.ended = msg.reason;
        break;
      default:
        break;
    }
  }

  private onSnapshot(msg: SnapshotMessage): void {
    if (!this.initial) return;
    if (msg.tick <= this.lastSnapshotTick) {
      this.stats.staleSnapshots += 1;
      return;
    }
    const started = performance.now();
    const predicted = this.predicted.get(msg.tick);
    const base = predicted ?? this.state ?? this.initial;
    let authoritative: SimState;
    try {
      authoritative = applySnapshot(structuredClone(base), msg.tick, msg.bytes);
    } catch {
      this.stats.badPackets += 1; // malformed body: drop it, the next snapshot will do
      return;
    }
    this.lastSnapshotTick = msg.tick;
    this.stats.snapshots += 1;

    let remoteChanged = false;
    let ownLate = false;
    for (const { kartId, age, input } of msg.humans) {
      if (kartId === this.kartId) {
        ownLate = age > 0 && msg.tick >= this.firstInputTick;
        continue;
      }
      const known = this.remoteInputs.get(kartId);
      if (!known || inputChanged(known, input)) remoteChanged = true;
      this.remoteInputs.set(kartId, input);
    }
    this.adjustExtraLead(ownLate);
    if (predicted) this.measureError(predicted, authoritative);

    const current = this.state?.tick ?? msg.tick;
    const goal = this.goalTick(msg.tick, current);
    const keep =
      this.state !== null &&
      predicted !== undefined &&
      current >= msg.tick &&
      goal >= current &&
      !remoteChanged &&
      !ownLate &&
      matches(predicted, authoritative);
    if (keep && this.state) {
      this.stats.matched += 1;
      let state = this.state;
      for (let t = current; t < goal; t += 1) state = this.simulateNew(state);
      this.state = state;
    } else {
      // Reset to the host's state and re-simulate the inputs it hasn't acknowledged yet.
      for (const tick of this.predicted.keys()) if (tick > msg.tick) this.predicted.delete(tick);
      this.predicted.set(msg.tick, authoritative);
      let state = authoritative;
      for (let t = msg.tick; t < goal; t += 1) {
        // Replayed ticks already played their cosmetic events; ones past the old present haven't.
        state = t < current || !this.state ? this.simulate(state).state : this.simulateNew(state);
      }
      this.state = state;
      if (this.stats.snapshots > 1) {
        this.stats.reconciled += 1;
        this.stats.lastReplayTicks = goal - msg.tick;
        this.stats.replayTicks += goal - msg.tick;
      }
    }
    this.prune(msg.tick);
    const ms = performance.now() - started;
    this.stats.snapshotMsTotal += ms;
    this.stats.snapshotMsMax = Math.max(this.stats.snapshotMsMax, ms);
  }

  /** Simulates a tick that is new to the player (not a replay), keeping its cosmetic events. */
  private simulateNew(state: SimState): SimState {
    const result = this.simulate(state);
    this.pendingEvents.push(...cosmetic(result.events));
    return result.state;
  }

  /**
   * More lead when the host had to hold our input (it arrived late); a tick less again after
   * `NET.extraLeadDecaySnapshots` snapshots in a row without, so one lag spike doesn't cost
   * latency for the rest of the race.
   */
  private adjustExtraLead(ownLate: boolean): void {
    if (ownLate) {
      this.extraLead = Math.min(NET.maxExtraLeadTicks, this.extraLead + 1);
      this.onTimeSnapshots = 0;
    } else if (this.extraLead > 0 && ++this.onTimeSnapshots >= NET.extraLeadDecaySnapshots) {
      this.extraLead -= 1;
      this.onTimeSnapshots = 0;
    }
  }

  /**
   * The tick to be at after this snapshot: a lead ahead of it. Ease one tick per snapshot (back by
   * holding local ticks, which costs nothing); jump when far off (the start, lag spikes).
   */
  private goalTick(snapshotTick: number, current: number): number {
    const target = snapshotTick + this.leadTicks();
    const drift = target - current;
    if (!this.state || Math.abs(drift) > NET.maxTickDrift) return Math.max(snapshotTick, target);
    if (drift < 0) this.holdTicks = Math.max(this.holdTicks, 1);
    return drift > 0 ? current + 1 : current;
  }

  private measureError(predicted: SimState, authoritative: SimState): void {
    const a = predicted.karts[this.kartId]?.position;
    const b = authoritative.karts[this.kartId]?.position;
    if (!a || !b) return;
    const error = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    this.stats.predictionErrorMax = Math.max(this.stats.predictionErrorMax, error);
  }

  private prune(snapshotTick: number): void {
    const newest = this.state?.tick ?? snapshotTick;
    for (const tick of this.predicted.keys()) if (tick < snapshotTick) this.predicted.delete(tick);
    for (const tick of this.inputs.keys()) {
      if (tick <= snapshotTick && tick <= newest - NET.inputRedundancy) this.inputs.delete(tick);
    }
  }

  /** Drops history older than `oldest` even while no snapshots arrive (a stalled link). */
  private pruneHistory(oldest: number): void {
    for (const tick of this.predicted.keys()) if (tick < oldest) this.predicted.delete(tick);
    for (const tick of this.inputs.keys()) if (tick < oldest) this.inputs.delete(tick);
  }

  private send(packet: Uint8Array): void {
    this.stats.bytesSent += packet.length;
    this.transport.send(packet);
  }
}

/**
 * Whether a predicted state is close enough to the host's at the same tick to keep predicting from
 * it: every kart within `NET.reconcilePosition` and `NET.reconcileSpeed`, and the same discrete
 * state (race progress, items, drift, respawns, hits, timers running), entities and RNG.
 */
export function matches(predicted: SimState, host: SimState): boolean {
  if (predicted.phase !== host.phase || predicted.rngState !== host.rngState) return false;
  if (predicted.positions.some((id, i) => host.positions[i] !== id)) return false;
  if (predicted.entities.length !== host.entities.length) return false;
  const entitiesMatch = predicted.entities.every((e, i) => {
    const h = host.entities[i];
    if (!h || h.id !== e.id || h.kind !== e.kind) return false;
    if (e.kind === 'itemBox' && h.kind === 'itemBox' && e.respawnTimer > 0 !== h.respawnTimer > 0) {
      return false;
    }
    return distance(e.position, h.position) < NET.reconcilePosition;
  });
  if (!entitiesMatch) return false;
  return predicted.karts.every((k, i) => {
    const h = host.karts[i];
    if (!h) return false;
    return (
      distance(k.position, h.position) < NET.reconcilePosition &&
      Math.abs(k.speed - h.speed) < NET.reconcileSpeed &&
      k.grounded === h.grounded &&
      k.trick === h.trick &&
      k.drift.direction === h.drift.direction &&
      k.drift.tier === h.drift.tier &&
      k.race.lap === h.race.lap &&
      k.race.nextCheckpoint === h.race.nextCheckpoint &&
      k.race.finishTick === h.race.finishTick &&
      k.race.lapTimes.length === h.race.lapTimes.length &&
      k.item.held === h.item.held &&
      k.item.roulette > 0 === h.item.roulette > 0 &&
      k.boostTimer > 0 === h.boostTimer > 0 &&
      k.respawnTimer > 0 === h.respawnTimer > 0 &&
      k.spinTimer > 0 === h.spinTimer > 0 &&
      k.starTimer > 0 === h.starTimer > 0 &&
      k.shrinkTimer > 0 === h.shrinkTimer > 0 &&
      k.race.stallTimer > 0 === h.race.stallTimer > 0
    );
  });
}

/** The events a client plays from its own prediction: everything but the host's (`HOST_EVENTS`). */
function cosmetic(events: readonly SimEvent[]): SimEvent[] {
  return events.filter((event) => !HOST_EVENTS.has(event.type));
}

/**
 * Whether another player's input changed enough that the prediction made with the old one should
 * be replayed: a button, or steering/pedals past `NET.remoteInputTolerance`. Smaller changes
 * are left to the position check at the next snapshot.
 */
function inputChanged(a: InputFrame, b: InputFrame): boolean {
  const tolerance = NET.remoteInputTolerance;
  return (
    a.drift !== b.drift ||
    a.item !== b.item ||
    !!a.respawn !== !!b.respawn ||
    Math.abs(a.steer - b.steer) > tolerance ||
    Math.abs(a.throttle - b.throttle) > tolerance ||
    Math.abs(a.brake - b.brake) > tolerance
  );
}

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
