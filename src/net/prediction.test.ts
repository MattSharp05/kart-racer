import { describe, expect, it } from 'vitest';
import { DT } from '../sim/tuning';
import type { KartState, SimEvent } from '../sim/types';
import { HOST_EVENTS } from './config';
import { parseNetConditions } from './netsim';
import { NetSmoother, type KartPose } from './smoothing';
import { onlineRace, scriptedInput, TICK_MS } from './testRace';

/** Ticks per second (60 Hz). */
const HZ = 60;

/**
 * How far the drawn kart moved from one frame to the next beyond its own motion (its velocity for
 * that tick): what the player sees as a jump. Driving at 28 m/s moves 0.47 m a frame, which is
 * motion, not a jump.
 */
function jump(from: KartPose, to: KartPose, kart: KartState): number {
  return Math.hypot(
    to.x - from.x - kart.velocity.x * DT,
    to.y - from.y - kart.velocity.y * DT,
    to.z - from.z - kart.velocity.z * DT,
  );
}

function poseOf(kart: KartState): KartPose {
  return { ...kart.position, heading: kart.heading };
}

describe('client render smoothing over loopback (MK-45)', () => {
  it('never draws the local kart jumping more than 0.5 m between frames (150 ms / 30 ms / 5 %)', () => {
    // 75 ms each way = 150 ms RTT, as in the net core's loopback test.
    const { host, clients, clock } = onlineRace({
      clients: 1,
      conditions: parseNetConditions('75,30,5'),
      laps: 3,
    });
    const client = clients[0]!;
    const kartId = 1;
    // What `OnlineRace` wires up for a client (game/online.ts), with one frame drawn per tick.
    const smoother = new NetSmoother(client);

    let previous: KartPose | undefined;
    let previousRaw: KartPose | undefined;
    let worst = 0;
    let worstRaw = 0;
    let frames = 0;
    let corrected = 0;
    /** What the client played from its own prediction, and what it played from the host. */
    const predictedEvents: SimEvent[] = [];
    const hostEvents: SimEvent[] = [];
    // The countdown, then 30 s of racing.
    for (let tick = 0; tick < 33 * HZ; tick += 1) {
      host.tick(scriptedInput(host.state.karts[0], host.state.tick, 0));
      predictedEvents.push(
        ...client.tick(scriptedInput(client.state?.karts[kartId], client.state?.tick ?? 0, kartId)),
      );
      hostEvents.push(...client.takeEvents().map((e) => e.event));
      clock.advance(TICK_MS);
      const state = client.state;
      if (!state) continue;
      const corrections = client.takeCorrections();
      if (corrections.some((c) => c.kartId === kartId)) corrected += 1;
      smoother.update(state, corrections);

      const kart = state.karts[kartId]!;
      smoother.frame(DT);
      const drawn = poseOf(kart);
      smoother.adjust(kartId, drawn, state.tick, 1);
      const raw = poseOf(kart);
      // Respawning is the sim's own move (the drone carries the kart back), not a correction.
      if (previous && previousRaw && kart.respawnTimer <= 0) {
        worst = Math.max(worst, jump(previous, drawn, kart));
        worstRaw = Math.max(worstRaw, jump(previousRaw, raw, kart));
        frames += 1;
      }
      previous = drawn;
      previousRaw = raw;
    }
    console.log(
      `rendered jump max ${worst.toFixed(3)} m (unsmoothed ${worstRaw.toFixed(3)} m); ` +
        `${corrected} corrections over ${frames} frames; correction max ` +
        `${client.stats.correctionMax.toFixed(3)} m`,
    );
    expect(frames).toBeGreaterThan(29 * HZ);
    expect(corrected).toBeGreaterThan(0); // reconciles did move the kart
    expect(worst).toBeLessThan(0.5);
    expect(worst).toBeLessThanOrEqual(worstRaw);

    // Race events (hits on our kart included) only come from the host; our own item uses are one
    // exception, played at once from the prediction (and then not again from the host). The
    // countdown is the other (MK-55): it's a function of the tick, so it plays on this race's own
    // ticks, and each beat only once.
    const own = (e: SimEvent) =>
      (e.type === 'itemUsed' || e.type === 'star') && e.kartId === kartId;
    const beat = (e: SimEvent) => e.type === 'countdown' || e.type === 'go';
    expect(predictedEvents.filter((e) => HOST_EVENTS.has(e.type) && !own(e) && !beat(e))).toEqual(
      [],
    );
    expect(hostEvents.filter(own)).toEqual([]);
    const beats = [...predictedEvents, ...hostEvents].filter(beat);
    const names = beats.map((e) => (e.type === 'countdown' ? e.value : e.type));
    expect(names.sort()).toEqual([1, 2, 3, 'go']);
    expect(hostEvents.some((e) => e.type === 'lap')).toBe(true);
  }, 60_000);
});
