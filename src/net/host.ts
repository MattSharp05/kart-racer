import { createRace, type CreateRaceOptions } from '../sim/race/createRace';
import { handToAi } from '../sim/race/takeover';
import { step } from '../sim/step';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../sim/types';
import { HOST_EVENTS, NET } from './config';
import {
  decodeMessage,
  encodeBye,
  encodeEvents,
  encodePing,
  encodeResults,
  encodeSnapshot,
  encodeStart,
  withAck,
  MSG,
  quantizeInput,
  type AppliedInput,
  type NetEvent,
  type RaceSetup,
  type RaceStanding,
} from './protocol';
import type { Transport } from './transport';

/** The most events one Event packet carries (its count is a uint8). */
const MAX_EVENTS_PER_PACKET = 0xff;

/** What the host reports per client (tests, the netsim overlay). */
export interface HostPeerStats {
  /** Ticks simulated with a held input because the client's hadn't arrived. */
  lateInputs: number;
  snapshots: number;
  snapshotBytesAvg: number;
  snapshotBytesMax: number;
  bytesSent: number;
  bytesReceived: number;
  /** Packets that failed to decode (dropped). */
  badPackets: number;
}

/** One client, as the host sees it. */
export interface RemotePeer {
  readonly transport: Transport;
  readonly kartId: number;
  /** Inputs received for ticks the host hasn't simulated yet. */
  readonly inputs: Map<number, InputFrame>;
  /** The input applied last tick (held when the next one is late). */
  lastInput: InputFrame;
  /** Tick that `lastInput` was for (0 = none yet). */
  lastInputTick: number;
  /** Newest input tick received (the snapshot's ack). */
  newestTick: number;
  /** False once the client left or was dropped (MK-70): nothing more is sent to it. */
  connected: boolean;
  /** Host tick when the last packet from this client arrived (or it was added). */
  lastHeardTick: number;
  readonly stats: HostPeerStats;
}

/** The race setup a client needs to build the same race as `state` (see `encodeStart`). */
export function raceSetupOf(options: CreateRaceOptions, state: SimState): RaceSetup {
  return {
    trackId: state.trackId,
    engineClass: state.engineClass,
    itemsOn: options.itemsOn,
    seed: options.seed,
    laps: state.race.laps,
    racers: state.karts.map((kart, i) => ({
      kartId: kart.kartType,
      human: kart.controller !== 'ai',
      ...(kart.name !== undefined ? { name: kart.name } : {}),
      gridSlot: options.racers[i]?.gridSlot ?? i,
      ...(kart.ai
        ? {
            ai: {
              lineOffset: kart.ai.lineOffset,
              skill: kart.ai.skill,
              aggression: kart.ai.aggression,
            },
          }
        : {}),
    })),
  };
}

/** `state`'s standings, leader first: finished karts with their finish tick (MK-55). */
export function standingsOf(state: SimState): RaceStanding[] {
  return state.positions.map((kartId) => {
    const finishTick = state.karts[kartId]?.race.finishTick;
    return finishTick !== undefined ? { kartId, finishTick } : { kartId };
  });
}

/**
 * The authoritative side of an online race (ADR 0005). Runs the real sim at 60 Hz with the host's
 * own input and each client's input for that tick (holding the last one when it's late), and sends
 * every client a snapshot plus the recent race events at 20 Hz. Only the host decides hits,
 * pickups, laps and finishes.
 */
export class OnlineHost {
  state: SimState;
  readonly setup: RaceSetup;
  readonly peers: RemotePeer[] = [];
  /**
   * The final standings, frozen when the race ended here (every human still connected finished;
   * MK-55), or null while it runs. Sent with every snapshot from then on, so every device shows
   * the same results.
   */
  results: RaceStanding[] | null = null;
  /** Karts whose player dropped mid-race and are driven by the AI from the next tick (MK-70). */
  private readonly handovers: number[] = [];
  /** Dropped players' karts not yet reported by `takeDrops` (the "AI takes over" toast). */
  private readonly drops: number[] = [];
  private lastLocalInput: InputFrame = NEUTRAL_INPUT;
  private eventSeq = 0;
  /** Host-decided events of the last `NET.eventRedundancyTicks` ticks, oldest first. */
  private recentEvents: NetEvent[] = [];

  /**
   * @param options The race, as for `createRace`: the host's own kart `local`, each client's
   *   kart `remote`.
   * @param localKartId The kart the host drives.
   */
  constructor(
    options: CreateRaceOptions,
    readonly localKartId: number,
  ) {
    this.state = createRace(options);
    this.setup = raceSetupOf(options, this.state);
  }

  /** Adds a client on an open transport and tells it which kart it drives. */
  addClient(transport: Transport, kartId: number): RemotePeer {
    const kart = this.state.karts[kartId];
    if (kart?.controller !== 'remote') throw new Error(`Kart ${kartId} isn't a remote player's`);
    const peer: RemotePeer = {
      transport,
      kartId,
      inputs: new Map(),
      lastInput: NEUTRAL_INPUT,
      lastInputTick: 0,
      newestTick: 0,
      connected: true,
      lastHeardTick: this.state.tick,
      stats: {
        lateInputs: 0,
        snapshots: 0,
        snapshotBytesAvg: 0,
        snapshotBytesMax: 0,
        bytesSent: 0,
        bytesReceived: 0,
        badPackets: 0,
      },
    };
    this.peers.push(peer);
    transport.onMessage((packet) => this.receive(peer, packet));
    // The data channel closed (the peer's tab went, or its network did): dropped at once.
    transport.onStateChange((state) => {
      if (state === 'closed') this.drop(peer, false);
    });
    this.send(peer, encodeStart(kartId, this.setup));
    return peer;
  }

  /**
   * Simulates one tick with the host's input and the clients' inputs for it; snapshots every
   * `NET.snapshotEveryTicks`. Returns the tick's events (for the host's own render and audio).
   */
  tick(localInput: InputFrame): SimEvent[] {
    const nextTick = this.state.tick + 1;
    for (const peer of this.peers) {
      if (peer.connected && this.state.tick - peer.lastHeardTick >= NET.dropAfterTicks) {
        this.drop(peer, true);
      }
    }
    // Dropped players' karts are the AI's from this tick on (every client's copy follows through
    // the snapshot's AI flag).
    for (const kartId of this.handovers.splice(0)) this.state = handToAi(this.state, kartId);
    const inputs: InputFrame[] = [];
    this.lastLocalInput = quantizeInput(localInput);
    inputs[this.localKartId] = this.lastLocalInput;
    for (const peer of this.peers) {
      // Start can be lost like any packet: repeat it until the client's inputs arrive.
      if (peer.connected && peer.newestTick === 0 && nextTick % NET.startRepeatTicks === 0) {
        this.send(peer, encodeStart(peer.kartId, this.setup));
      }
      const input = peer.inputs.get(nextTick);
      if (input) {
        peer.lastInput = input;
        peer.lastInputTick = nextTick;
      } else if (peer.newestTick > 0) {
        peer.stats.lateInputs += 1;
      }
      inputs[peer.kartId] = peer.lastInput;
      for (const tick of peer.inputs.keys()) if (tick <= nextTick) peer.inputs.delete(tick);
    }
    const { state, events } = step(this.state, inputs);
    this.state = state;
    if (!this.results && this.raceOver()) this.results = standingsOf(state);
    this.recordEvents(events);
    if (state.tick % NET.snapshotEveryTicks === 0) this.broadcast();
    return events;
  }

  /**
   * Whether the race is over for the room: the sim ended it (every person finished), or everyone
   * still here has, and the karts of players who left coast on unfinished (until drops hand them
   * to the AI) — so one quitter can't keep the room from its results.
   */
  private raceOver(): boolean {
    const { phase, karts } = this.state;
    if (phase === 'finished') return true;
    if (phase !== 'racing') return false;
    const here = [this.localKartId, ...this.peers.filter((p) => p.connected).map((p) => p.kartId)];
    return here.every((kartId) => karts[kartId]?.race.finishTick !== undefined);
  }

  /**
   * Karts whose players dropped since the last call (MK-70), for the "AI takes over" toast. Only
   * drops while the race was on: a player leaving the results isn't news.
   */
  takeDrops(): number[] {
    return this.drops.splice(0);
  }

  /**
   * Drops `peer` (MK-70): nothing more is sent to it (but a Bye, if it may still be listening), and
   * while the race is on its kart goes to the AI from the next tick. The host alone decides this.
   */
  private drop(peer: RemotePeer, tellPeer: boolean): void {
    if (!peer.connected) return;
    if (tellPeer) this.send(peer, encodeBye('dropped'));
    peer.connected = false;
    peer.lastInput = NEUTRAL_INPUT;
    peer.inputs.clear();
    if (this.results || this.state.phase === 'finished') return;
    this.handovers.push(peer.kartId);
    this.drops.push(peer.kartId);
  }

  /** Ends the race for everyone (the host leaving ends the room, ADR 0005). */
  end(): void {
    for (const peer of this.peers) {
      if (peer.connected) this.send(peer, encodeBye('ended'));
      peer.connected = false;
    }
  }

  private recordEvents(events: readonly SimEvent[]): void {
    const tick = this.state.tick;
    for (const event of events) {
      if (HOST_EVENTS.has(event.type))
        this.recentEvents.push({ seq: ++this.eventSeq, tick, event });
    }
    const oldest = tick - NET.eventRedundancyTicks;
    const firstKept = this.recentEvents.findIndex((e) => e.tick > oldest);
    this.recentEvents = firstKept < 0 ? [] : this.recentEvents.slice(firstKept);
  }

  private broadcast(): void {
    const tick = this.state.tick;
    const humans: AppliedInput[] = [
      { kartId: this.localKartId, age: 0, input: this.lastLocalInput },
      // Karts the AI took over aren't anyone's any more: clients predict them as AI.
      ...this.peers
        .filter((peer) => this.state.karts[peer.kartId]?.controller !== 'ai')
        .map((peer) => ({
          kartId: peer.kartId,
          age: peer.lastInputTick === 0 ? tick : tick - peer.lastInputTick,
          input: peer.lastInput,
        })),
    ];
    const events =
      this.recentEvents.length > 0
        ? encodeEvents(this.recentEvents.slice(-MAX_EVENTS_PER_PACKET))
        : null;
    const results = this.results ? encodeResults(this.results) : null;
    // Encoded once; only the ack differs per client.
    const snapshot = encodeSnapshot(this.state, 0, humans);
    for (const peer of this.peers) {
      if (!peer.connected) continue;
      const packet = withAck(snapshot, peer.newestTick);
      const s = peer.stats;
      s.snapshots += 1;
      s.snapshotBytesAvg += (packet.length - s.snapshotBytesAvg) / s.snapshots;
      s.snapshotBytesMax = Math.max(s.snapshotBytesMax, packet.length);
      this.send(peer, packet);
      if (events) this.send(peer, events);
      if (results) this.send(peer, results);
    }
  }

  private receive(peer: RemotePeer, packet: Uint8Array): void {
    peer.stats.bytesReceived += packet.length;
    let msg;
    try {
      msg = decodeMessage(packet);
    } catch {
      peer.stats.badPackets += 1;
      return;
    }
    // Dropped is final for this race: a player who comes back rejoins for the next one (MK-70).
    if (!peer.connected) return;
    peer.lastHeardTick = this.state.tick;
    if (msg.type === MSG.ping) {
      this.send(peer, encodePing(MSG.pong, msg.time));
    } else if (msg.type === MSG.bye) {
      this.drop(peer, false);
    } else if (msg.type === MSG.input) {
      const now = this.state.tick;
      // Inputs for ticks already simulated are too late; ones absurdly far ahead are bogus.
      const horizon = now + NET.historyTicks;
      msg.inputs.forEach((input, i) => {
        const tick = msg.newestTick - i;
        if (tick > now && tick <= horizon) peer.inputs.set(tick, input);
      });
      if (msg.newestTick <= horizon) peer.newestTick = Math.max(peer.newestTick, msg.newestTick);
    }
  }

  private send(peer: RemotePeer, packet: Uint8Array): void {
    peer.stats.bytesSent += packet.length;
    peer.transport.send(packet);
  }
}
