import { OnlineClient } from '../net/client';
import { NET } from '../net/config';
import { OnlineHost } from '../net/host';
import { hostLocalRoom, joinLocalRoom } from '../net/localRoom';
import { ConditionedTransport, type NetConditions } from '../net/netsim';
import type { Transport } from '../net/transport';
import type { CreateRaceOptions } from '../sim/race/createRace';
import { NEUTRAL_INPUT, type InputFrame, type SimState, type StepResult } from '../sim/types';
import type { Stepper } from './game';
import type { NetRole } from './launchParams';

/** Extra time the links stay open after leaving under a simulated network, for the Bye, ms. */
const BYE_GRACE_MS = 50;

/** An online race to join or host (from an online scenario plus `&role=&room=&netsim=`). */
export interface OnlineLaunch {
  role: NetRole;
  room: string;
  /** The host's race (clients get it from the host's Start; theirs is only a placeholder). */
  race: CreateRaceOptions;
  /** Simulated network, applied to every link in both directions. */
  netsim?: NetConditions;
}

/** What `__game.net()` reports (tests, and the netdebug overlay in MK-45). */
export interface NetInfo {
  role: NetRole;
  room: string;
  /** The kart this device drives: the host's own at once, a client's once the host's Start arrives. */
  kartId: number;
  /** Players in the room, host included (a client only knows itself until Start: then all). */
  players: number;
  /** Players the race waits for before the countdown runs. */
  expectedPlayers: number;
  /** The race is running here: the host has everyone, or the client has its first snapshot. */
  started: boolean;
  /** Smoothed round trip to the host, ms (clients; 0 on the host). */
  rttMs: number;
  /** Tick of the newest snapshot sent (host) or applied (client); -1 before any. */
  lastSnapshotTick: number;
  /** Why the race ended for this device (host left, room full, version…), or null. */
  ended: string | null;
}

/**
 * An online race in this tab (MK-46): an `OnlineHost` or `OnlineClient` over a `?net=local` room,
 * driving the Game through its `stepper`. The host simulates for real (once every player has
 * joined); a client predicts and plays the host's events. Render, HUD and audio don't know the
 * difference: they read `game.state` and the tick's events as for a local race.
 */
export class OnlineRace {
  readonly stepper: Stepper;
  private host: OnlineHost | null = null;
  private client: OnlineClient | null = null;
  private readonly links: Transport[] = [];
  private readonly expectedPlayers: number;
  private lastSnapshotTick = -1;
  private ended: string | null = null;
  private closeRoom: () => void = () => undefined;

  /**
   * @param onLocalKart Called when a client learns which kart it drives (the host's Start).
   */
  constructor(
    readonly launch: OnlineLaunch,
    private readonly onLocalKart: (kartId: number) => void = () => undefined,
  ) {
    const racers = launch.race.racers;
    this.expectedPlayers = racers.filter((r) => r.controller !== 'ai').length;
    this.stepper = launch.role === 'host' ? this.startHost() : this.startClient();
  }

  /** The kart this device drives (-1 for a client until the host's Start). */
  get localKartId(): number {
    return this.host?.localKartId ?? this.client?.kartId ?? -1;
  }

  info(): NetInfo {
    const { host, client } = this;
    const connected = host ? host.peers.filter((p) => p.connected).length + 1 : 1;
    // A client counts the humans in the host's race once Start arrives, not its own URL's.
    const humans = client?.setup?.racers.filter((r) => r.human).length;
    return {
      role: this.launch.role,
      room: this.launch.room,
      kartId: this.localKartId,
      players: host ? connected : (humans ?? 1),
      expectedPlayers: humans ?? this.expectedPlayers,
      started: host ? this.everyoneJoined() : client?.started === true,
      rttMs: client?.stats.rttMs ?? 0,
      lastSnapshotTick: client ? client.snapshotTick : this.lastSnapshotTick,
      ended: this.ended ?? client?.ended ?? null,
    };
  }

  /** Leaves the race: the host ends it for everyone, a client says Bye. */
  close(): void {
    this.closeRoom();
    this.host?.end();
    this.client?.leave();
    this.ended ??= this.launch.role === 'host' ? 'ended' : 'left';
    // A simulated network sends the Bye late: close the links once it's gone.
    const netsim = this.launch.netsim;
    const closeLinks = () => this.links.forEach((link) => link.close());
    if (netsim) setTimeout(closeLinks, netsim.lagMs + netsim.jitterMs + BYE_GRACE_MS);
    else closeLinks();
  }

  private startHost(): Stepper {
    const racers = this.launch.race.racers;
    const localKartId = racers.findIndex((r) => r.controller === 'local');
    const host = new OnlineHost(this.launch.race, localKartId);
    this.host = host;
    // Clients get the remote karts in the order they join.
    const freeKarts = racers.flatMap((r, i) => (r.controller === 'remote' ? [i] : []));
    this.closeRoom = hostLocalRoom(this.launch.room, (transport) => {
      const kartId = freeKarts.shift();
      if (kartId === undefined) return false;
      host.addClient(this.link(transport), kartId);
      return true;
    });
    return (state, inputs): StepResult => {
      // The countdown waits for everyone (the lobby's job from MK-47 on).
      if (!this.everyoneJoined()) return { state, events: [] };
      const events = host.tick(inputs[localKartId] ?? NEUTRAL_INPUT);
      if (host.state.tick % NET.snapshotEveryTicks === 0) this.lastSnapshotTick = host.state.tick;
      return { state: host.state, events };
    };
  }

  private startClient(): Stepper {
    const join = joinLocalRoom(this.launch.room, randomId(), (reason) => (this.ended = reason));
    const client = new OnlineClient(this.link(join.transport));
    this.client = client;
    client.onStart = () => {
      join.stop();
      this.onLocalKart(client.kartId);
    };
    return (state: SimState, inputs: InputFrame[]): StepResult => {
      const cosmetic = client.tick(inputs[client.kartId] ?? NEUTRAL_INPUT);
      // Until the first snapshot the placeholder race stands still; host events wait for it.
      if (!client.state) return { state, events: [] };
      const hostEvents = client.takeEvents().map((e) => e.event);
      return { state: client.state, events: [...hostEvents, ...cosmetic] };
    };
  }

  private everyoneJoined(): boolean {
    return (this.host?.peers.length ?? 0) + 1 >= this.expectedPlayers;
  }

  /** Keeps `transport` for closing and adds the simulated network, if any. */
  private link(transport: Transport): Transport {
    const netsim = this.launch.netsim;
    const link = netsim ? new ConditionedTransport(transport, netsim) : transport;
    this.links.push(link);
    return link;
  }
}

/** A client id for the room (unique enough between tabs; `crypto.randomUUID` needs HTTPS). */
function randomId(): string {
  return `c-${Math.random().toString(36).slice(2, 10)}`;
}
