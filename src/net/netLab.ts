import { DT } from '../sim/tuning';
import type { KartState, SimState } from '../sim/types';
import type { OnlineClient } from './client';
import { NET } from './config';
import type { OnlineHost } from './host';
import type { NetConditions } from './netsim';
import type { RaceStanding } from './protocol';
import { NetSmoother, type KartPose } from './smoothing';
import { onlineRace, scriptedInput, TICK_MS } from './testRace';

/**
 * The netcode lab (MK-73, test-only like `testRace.ts`): a whole online race over loopback under a
 * simulated network, every client drawing one frame per tick through its `NetSmoother`, measured
 * the way a player would notice it. The soak test, the tuning sweep and the budgets in
 * `netTuning.perf.test.ts` all run on it.
 */

const HZ = Math.round(1 / DT);

export interface LabOptions {
  /** Clients besides the host (3 = the 4-player room). */
  clients: number;
  /** One way, applied in both directions (`oneWayOf` a round trip). */
  conditions: NetConditions;
  seed?: number;
  laps?: number;
  /** Stop after this many ticks of racing even if nobody has finished (0 = race to the end). */
  racingTicks?: number;
  /**
   * Ticks each client runs per drawn frame (1 = 60 fps; 2 = a phone at 30 fps, whose fixed-step
   * loop runs two ticks back to back every other tick's time, so half its inputs leave late).
   */
  clientFrameTicks?: number;
}

/** Sorted samples → a few percentiles. */
export interface Spread {
  p50: number;
  p99: number;
  max: number;
}

export interface LabClientReport {
  kartId: number;
  rttMs: number;
  /** Snapshots that never arrived, %. */
  snapshotLossPercent: number;
  /** Own kart: size of each reconcile's correction, m. */
  ownCorrection: Spread;
  /** Other humans' karts: size of each reconcile's correction, m. */
  remoteCorrection: Spread;
  /** Drawn own kart: movement per frame beyond its own velocity (what reads as a jump), m. */
  ownJump: Spread;
  /** Drawn other humans' karts, the same, m. */
  remoteJump: Spread;
  /**
   * How far from the truth karts are drawn: the drawn pose at tick t against the host's state at
   * tick t (ground plane), m. Own kart, then the other humans'.
   */
  ownTruthError: Spread;
  remoteTruthError: Spread;
  /** Ticks re-simulated per snapshot, and the share of snapshots that needed none, %. */
  resimTicksPerSnapshot: number;
  matchedPercent: number;
  /** Handling one snapshot (apply, compare, re-simulate), ms. */
  snapshotMsAvg: number;
  snapshotMsMax: number;
  /** Average ticks the prediction ran ahead of the newest snapshot. */
  leadTicks: number;
  /** Ticks the host simulated with this client's input missing (held). */
  lateInputs: number;
  /** Bandwidth, KB/s, host → client and client → host. */
  downKBps: number;
  upKBps: number;
  /** The host's final standings as this client got them (null: never arrived). */
  results: RaceStanding[] | null;
  /** Finished karts whose finish tick or lap times differ from the host's (a desync). */
  mismatchedFinishes: number[];
  /** The race ended early for this client (dropped, host lost, …). */
  ended: string | null;
}

export interface LabReport {
  /** Host ticks run. */
  ticks: number;
  /** The host's final standings (null: the race didn't end within the ticks). */
  results: RaceStanding[] | null;
  clients: LabClientReport[];
}

function spread(samples: number[]): Spread {
  if (samples.length === 0) return { p50: 0, p99: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return { p50: at(0.5), p99: at(0.99), max: at(1) };
}

function poseOf(kart: KartState): KartPose {
  return { ...kart.position, heading: kart.heading };
}

/** Drawn movement from one frame to the next (`ticks` long) beyond the kart's own motion, m. */
function jump(from: KartPose, to: KartPose, kart: KartState, ticks: number): number {
  const t = ticks * DT;
  return Math.hypot(
    to.x - from.x - kart.velocity.x * t,
    to.y - from.y - kart.velocity.y * t,
    to.z - from.z - kart.velocity.z * t,
  );
}

interface Watch {
  client: OnlineClient;
  kartId: number;
  smoother: NetSmoother;
  ownCorrections: number[];
  remoteCorrections: number[];
  ownJumps: number[];
  remoteJumps: number[];
  drawn: Map<number, KartPose>;
  /**
   * The state the game shows: the client's as of its last tick. A snapshot arriving between
   * frames reconciles `client.state` at once, but the game only picks the new state up at its next
   * tick, together with the corrections that hide it.
   */
  shown: SimState | null;
  /** Every drawn pose while racing, checked against the host's truth at the end. */
  frames: { kartId: number; tick: number; x: number; z: number }[];
  leadSum: number;
  leadSamples: number;
}

/** The karts of other humans in client `watch`'s race. */
function remoteHumans(watch: Watch): number[] {
  return [...watch.smoother.remoteKarts];
}

/**
 * After each client tick, as `OnlineRace`'s stepper does: the reconciles since the last tick go to
 * the smoother (and into the correction sizes).
 */
function afterTick(watch: Watch): void {
  const { client, smoother, kartId } = watch;
  const corrections = client.takeCorrections();
  const state = client.state;
  if (!state) return;
  const remote = remoteHumans(watch);
  for (const c of corrections) {
    const size = Math.hypot(c.dx, c.dy, c.dz);
    if (c.kartId === kartId) watch.ownCorrections.push(size);
    else if (remote.includes(c.kartId)) watch.remoteCorrections.push(size);
  }
  smoother.update(state, corrections);
  watch.shown = state;
}

/** One drawn frame of client `watch` (`ticks` ticks long): its own and the humans' karts. */
function drawFrame(watch: Watch, ticks: number): void {
  const { client, smoother, kartId } = watch;
  const state = watch.shown;
  if (!state) return;
  smoother.frame(ticks * DT);
  if (state.phase !== 'racing') {
    // Not measured (countdown, or the prediction ran past the finish): start afresh after.
    watch.drawn.clear();
    return;
  }
  watch.leadSum += state.tick - client.snapshotTick;
  watch.leadSamples += 1;
  for (const id of [kartId, ...remoteHumans(watch)]) {
    const kart = state.karts[id];
    if (!kart) continue;
    const pose = poseOf(kart);
    smoother.adjust(id, pose, state.tick, 1);
    const previous = watch.drawn.get(id);
    // Respawning is the sim's own move (the drone carries the kart back), and a finished kart
    // coasts on autopilot: neither is netcode.
    if (previous && kart.respawnTimer <= 0 && kart.race.finishTick === undefined) {
      const moved = jump(previous, pose, kart, ticks);
      (id === kartId ? watch.ownJumps : watch.remoteJumps).push(moved);
      watch.frames.push({ kartId: id, tick: state.tick, x: pose.x, z: pose.z });
    }
    watch.drawn.set(id, pose);
  }
}

/** Finished karts on the client whose finish tick or lap times differ from the host's. */
function mismatchedFinishes(host: OnlineHost, client: OnlineClient): number[] {
  const state = client.state;
  if (!state) return [];
  return host.state.karts.flatMap((truth) => {
    const seen = state.karts[truth.id];
    if (truth.race.finishTick === undefined || truth.race.finishTick > client.snapshotTick) {
      return []; // not finished yet as far as this client could know
    }
    const same =
      seen?.race.finishTick === truth.race.finishTick &&
      JSON.stringify(seen.race.lapTimes) === JSON.stringify(truth.race.lapTimes);
    return same ? [] : [truth.id];
  });
}

/**
 * Runs an online race over loopback until the host's results are out and every client has them
 * (or `racingTicks` after GO), then reports what each client measured.
 */
export function runLab({
  clients,
  conditions,
  seed = 7,
  laps = 1,
  racingTicks = 0,
  clientFrameTicks = 1,
}: LabOptions) {
  const race = onlineRace({ clients, conditions, seed, laps });
  const { host, clock } = race;
  const watches: Watch[] = race.clients.map((client, i) => {
    const smoother = new NetSmoother({
      kartId: i + 1,
      leadTicks: () => (client.state ? client.state.tick - client.snapshotTick : 0),
    });
    client.onSnapshotState = (state) => smoother.snapshots.push(state);
    smoother.remoteKarts = new Set(
      Array.from({ length: clients + 1 }, (_, k) => k).filter((k) => k !== i + 1),
    );
    return {
      client,
      kartId: i + 1,
      smoother,
      ownCorrections: [],
      remoteCorrections: [],
      ownJumps: [],
      remoteJumps: [],
      drawn: new Map(),
      shown: null,
      frames: [],
      leadSum: 0,
      leadSamples: 0,
    };
  });
  const goTick = host.state.race.goTick;
  const limit = racingTicks > 0 ? goTick + racingTicks : 60 * 60 * HZ;
  /** A few seconds after the results so the last snapshots (and Results) reach every client. */
  let stopAt = Infinity;
  let ticks = 0;
  /** The host's kart positions after each tick (ground plane), for the truth errors. */
  const truth = new Map<number, { x: number; z: number }[]>();
  while (ticks < Math.min(limit, stopAt)) {
    host.tick(scriptedInput(host.state.karts[0], host.state.tick, 0));
    truth.set(
      host.state.tick,
      host.state.karts.map((k) => ({ x: k.position.x, z: k.position.z })),
    );
    const frame = (ticks + 1) % clientFrameTicks === 0;
    for (const watch of frame ? watches : []) {
      const { client, kartId } = watch;
      for (let i = 0; i < clientFrameTicks; i += 1) {
        client.tick(scriptedInput(client.state?.karts[kartId], client.state?.tick ?? 0, kartId));
        afterTick(watch);
      }
      client.takeEvents();
    }
    clock.advance(TICK_MS);
    for (const watch of frame ? watches : []) drawFrame(watch, clientFrameTicks);
    ticks += 1;
    if (host.results && stopAt === Infinity) stopAt = ticks + 2 * HZ;
  }

  const seconds = ticks / HZ;
  const report: LabReport = {
    ticks,
    results: host.results,
    clients: watches.map((watch): LabClientReport => {
      const { client, kartId } = watch;
      const s = client.stats;
      const peer = host.peers.find((p) => p.kartId === kartId);
      const expected =
        s.firstSnapshotTick < 0
          ? 0
          : (client.snapshotTick - s.firstSnapshotTick) / NET.snapshotEveryTicks + 1;
      const truthErrors = (own: boolean) =>
        spread(
          watch.frames.flatMap((f) => {
            const real = truth.get(f.tick)?.[f.kartId];
            if (!real || (f.kartId === kartId) !== own) return [];
            return [Math.hypot(f.x - real.x, f.z - real.z)];
          }),
        );
      return {
        kartId,
        rttMs: s.rttMs,
        snapshotLossPercent:
          expected > 0 ? Math.max(0, 1 - (s.snapshots + s.staleSnapshots) / expected) * 100 : 0,
        ownCorrection: spread(watch.ownCorrections),
        remoteCorrection: spread(watch.remoteCorrections),
        ownJump: spread(watch.ownJumps),
        remoteJump: spread(watch.remoteJumps),
        ownTruthError: truthErrors(true),
        remoteTruthError: truthErrors(false),
        resimTicksPerSnapshot: s.snapshots > 0 ? s.replayTicks / s.snapshots : 0,
        matchedPercent: s.snapshots > 0 ? (s.matched / s.snapshots) * 100 : 0,
        snapshotMsAvg: s.snapshots > 0 ? s.snapshotMsTotal / s.snapshots : 0,
        snapshotMsMax: s.snapshotMsMax,
        leadTicks: watch.leadSamples > 0 ? watch.leadSum / watch.leadSamples : 0,
        lateInputs: peer?.stats.lateInputs ?? 0,
        downKBps: s.bytesReceived / 1024 / seconds,
        upKBps: s.bytesSent / 1024 / seconds,
        results: client.results,
        mismatchedFinishes: mismatchedFinishes(host, client),
        ended: client.ended ?? (client.hostLost ? 'host-lost' : null),
      };
    }),
  };
  return report;
}
