import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { autopilotInput } from '../../../sim/autopilot';
import { routeRoll } from '../../../sim/ai/routes';
import { KART_IDS } from '../../../sim/data/karts';
import { hazardPose, hazardPush } from '../../../sim/hazards';
import { createRace } from '../../../sim/race/createRace';
import { routeInfos, routeProgress } from '../../../sim/routes';
import { insidePolygon } from '../../../sim/splineTrack';
import { step } from '../../../sim/step';
import { groundAt, trackGeometry } from '../../../sim/track';
import { DT, tuning } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../../../sim/types';
import { tracks } from '..';
import { BRIDGE_START_TICK } from './scenarios';
import { CANOPY_RUSH, RUINS_ROUTE, SWAY, SWAY_DECKS, canopyRush } from './sim';

const geometry = trackGeometry(canopyRush);
const { bridges, ruinsFloor, tAt } = CANOPY_RUSH;
const BRIDGE_LIST = [bridges.b1, bridges.b2, bridges.b3];
const SWAY_TICKS = Math.round(SWAY.period / DT);

function run(state: SimState, ticks: number, input: (s: SimState) => Partial<InputFrame>) {
  let s = state;
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(s, [{ ...NEUTRAL_INPUT, ...input(s) }]);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

const respawns = (events: SimEvent[], kartId = 0) =>
  events.filter((e) => e.type === 'respawn' && e.kartId === kartId);

/** Midpoint (world) of a bridge's deck, and its lap fraction. */
const midSpan = (b: (typeof BRIDGE_LIST)[number]) => ({
  x: (b.from.x + b.to.x) / 2,
  y: b.y,
  z: (b.from.z + b.to.z) / 2,
});

/** Race progress (lap fraction) of a kart, on the main road or along the ruins. */
function progressT(position: { x: number; y: number; z: number }) {
  const p = geometry.project(position);
  return routeProgress(geometry, position, p)?.t ?? p.t;
}

describe('Canopy Rush data', () => {
  it('is registered as a real (menu) track with its own jungle theme', () => {
    const content = tracks.get('canopy-rush');
    expect(content.testOnly).toBeUndefined();
    expect(content.theme?.fog).toBeDefined();
    expect(content.theme?.scenery).toBe('jungle');
    expect(content.def).toBe(canopyRush);
  });

  it('is a valid, non-overlapping track of 1.0–1.3 km that climbs to bridge 3', () => {
    expect(geometry.length).toBeGreaterThan(1000);
    expect(geometry.length).toBeLessThan(1300);
    expect([...canopyRush.checkpoints].sort((a, b) => a - b)).toEqual(canopyRush.checkpoints);
    expect(canopyRush.checkpoints[0]).toBe(0);
    expect(Math.max(...geometry.samples.map((s) => s.y))).toBeCloseTo(CANOPY_RUSH.topY, 0);
    const n = geometry.samples.length;
    const minGap = 2 * geometry.wallOffset(16);
    for (let i = 0; i < n; i += 4) {
      for (let j = i + 80; j < n; j += 4) {
        if (n - (j - i) < 80) continue;
        const a = geometry.sample(i);
        const b = geometry.sample(j);
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(minGap);
      }
    }
  });

  it('puts all 8 grid slots on the road, behind the line', () => {
    expect(canopyRush.gridSlots).toHaveLength(8);
    for (const slot of canopyRush.gridSlots ?? []) {
      expect(geometry.project(geometry.pointAt(slot.t, slot.lateral)).surface).toBe('road');
      expect(slot.t).toBeGreaterThan(0.9);
    }
  });

  it('has 3 rope bridges: narrow, no walls either side, a swaying deck and a respawn at the start', () => {
    expect(canopyRush.itemBoxRows).toHaveLength(4);
    expect(canopyRush.hazards).toEqual(SWAY_DECKS);
    expect(SWAY_DECKS).toHaveLength(3);
    for (const [i, bridge] of BRIDGE_LIST.entries()) {
      const mid = midSpan(bridge);
      const t = geometry.project(mid).t;
      expect(geometry.hasWall(t, 'left')).toBe(false);
      expect(geometry.hasWall(t, 'right')).toBe(false);
      expect(geometry.project(mid).width).toBeCloseTo(CANOPY_RUSH.bridgeWidth, 0);
      const deck = SWAY_DECKS[i]!;
      expect(deck.from).toEqual({ ...bridge.from, y: bridge.y });
      expect(deck.to).toEqual({ ...bridge.to, y: bridge.y });
      // Wide enough to be fair at 150cc: road plus plank edges, over 15 m in all.
      expect(deck.halfWidth * 2).toBeGreaterThan(15);
      const start = tAt(bridge.from.x, bridge.from.z);
      expect(canopyRush.respawnPoints?.some((p) => p.t === start && p.from <= t && t <= p.to)).toBe(
        true,
      );
    }
  });

  it('the ruins are a stone floor below the platform; beyond them is the drop', () => {
    const inRuins = { x: 80, y: 0, z: 0 };
    expect(insidePolygon(inRuins.x, inRuins.z, [...ruinsFloor])).toBe(true);
    expect(groundAt(canopyRush, inRuins)).toEqual({ height: CANOPY_RUSH.floorY, surface: 'road' });
    expect(groundAt(canopyRush, { x: 40, y: 0, z: 0 }).surface).toBe('out');
    // Nothing of the main road overlaps them (else its height would win there).
    for (const v of ruinsFloor) {
      const p = geometry.project({ x: v.x, y: 0, z: v.z });
      if (p.surface !== 'out') expect(p.groundY).toBeLessThan(1);
    }
  });
});

describe('Canopy Rush swaying bridges', () => {
  it('each deck leans as a sine of the tick, out of step with the others; the same every run', () => {
    const lean = (i: number, tick: number) => hazardPose(SWAY_DECKS[i]!, tick).amount;
    for (const i of [0, 1, 2]) {
      expect(lean(i, 1234)).toBe(lean(i, 1234 + SWAY_TICKS));
      expect(Math.abs(lean(i, 50))).toBeLessThanOrEqual(1);
    }
    // A quarter period in, deck 1 leans fully right; the others are a third of a cycle apart.
    expect(lean(0, SWAY_TICKS / 4)).toBeCloseTo(1, 6);
    expect(lean(1, SWAY_TICKS / 4 - SWAY_TICKS / 3)).toBeCloseTo(1, 6);
    expect(lean(2, SWAY_TICKS / 4 + SWAY_TICKS / 3)).toBeCloseTo(1, 6);
  });

  it('pushes karts on the deck towards the side it leans to, hardest mid-span, none at the anchors', () => {
    const deck = SWAY_DECKS[0]!;
    const peak = SWAY_TICKS / 4;
    const mid = midSpan(bridges.b1);
    const push = hazardPush(SWAY_DECKS, peak, mid)!;
    // Bridge 1 runs south: its right is west (−X).
    expect(push.x).toBeCloseTo(-SWAY.push, 6);
    expect(push.z).toBeCloseTo(0, 6);
    // Leaning the other way half a period later.
    expect(hazardPush(SWAY_DECKS, peak + SWAY_TICKS / 2, mid)!.x).toBeCloseTo(SWAY.push, 6);
    const nearAnchor = hazardPush(SWAY_DECKS, peak, { ...mid, z: bridges.b1.from.z + 3 })!;
    expect(Math.abs(nearAnchor.x)).toBeLessThan(SWAY.push * 0.15);
    // Off the deck (on the platform, or well below it) nothing pushes.
    expect(hazardPush(SWAY_DECKS, peak, { x: 90, y: 14, z: -125 })).toBeUndefined();
    expect(hazardPush(SWAY_DECKS, peak, { ...mid, y: 2 })).toBeUndefined();
    expect(hazardPush(SWAY_DECKS, peak, { ...mid, x: mid.x + deck.halfWidth + 1 })).toBeUndefined();
  });

  it('canopy-bridge: holding W, the sway carries you off; you are put back at the bridge start', () => {
    const state = scenarios.get('canopy-bridge')!.setup(1).state;
    expect(state.engineClass).toBe(150);
    expect(state.tick).toBe(BRIDGE_START_TICK);
    let s = state;
    let fellAt = -1;
    for (let i = 0; i < 240 && fellAt < 0; i += 1) {
      const result = step(s, [{ ...NEUTRAL_INPUT, throttle: 1 }]);
      s = result.state;
      if (respawns(result.events).length) fellAt = i;
    }
    // Over the right edge in the second half of the bridge…
    expect(fellAt).toBeGreaterThan(60);
    // …and lifted back onto its start, facing along it.
    const kart = s.karts[0]!;
    const at = geometry.project(kart.position);
    expect(at.t).toBeCloseTo(tAt(bridges.b1.from.x, bridges.b1.from.z), 3);
    expect(Math.abs(at.lateral)).toBeLessThan(0.5);
  });

  it('canopy-bridge: steering against the sway, you stay on the deck', () => {
    const state = scenarios.get('canopy-bridge')!.setup(1).state;
    let widest = 0;
    const { events } = run(state, 240, (s) => {
      const p = geometry.project(s.karts[0]!.position);
      widest = Math.max(widest, Math.abs(p.lateral));
      return autopilotInput(s.karts[0]!, geometry);
    });
    expect(respawns(events)).toHaveLength(0);
    // It noticeably shoves the kart, but a steering driver holds the middle.
    expect(widest).toBeGreaterThan(0.5);
    expect(widest).toBeLessThan(3);
  });

  it('a kart that falls off a bridge is put back at that bridge’s start', () => {
    for (const bridge of BRIDGE_LIST) {
      const t = geometry.project(midSpan(bridge)).t;
      const state = scenarios.get('canopy-bridge')!.setup(1).state;
      const kart = state.karts[0]!;
      kart.lastSafeT = t;
      const off = geometry.pointAt(t, geometry.wallOffset(CANOPY_RUSH.bridgeWidth) + 4);
      kart.position = { ...off, y: off.y - 1 };
      kart.grounded = false;
      const { state: end, events } = run(state, 45, () => ({}));
      expect(respawns(events)).toHaveLength(1);
      const at = geometry.project(end.karts[0]!.position);
      expect(at.t).toBeCloseTo(tAt(bridge.from.x, bridge.from.z), 3);
    }
  });
});

describe('Canopy Rush respawns', () => {
  it('karts falling off a bridge together are all put back on its deck, spread across it', () => {
    const racers = Array.from({ length: 8 }, (_, i) => ({
      kartId: KART_IDS[i % KART_IDS.length]!,
      controller: 'local' as const,
    }));
    let s = createRace({
      trackId: 'canopy-rush',
      racers,
      engineClass: 150,
      itemsOn: false,
      seed: 1,
    });
    while (s.phase !== 'racing') s = step(s, []).state;
    const t = geometry.project(midSpan(bridges.b1)).t;
    for (const kart of s.karts) {
      kart.lastSafeT = t;
      const off = geometry.pointAt(t, geometry.wallOffset(CANOPY_RUSH.bridgeWidth) + 4);
      kart.position = { ...off, y: off.y - 6 };
      kart.grounded = false;
    }
    s = step(s, []).state;
    const start = tAt(bridges.b1.from.x, bridges.b1.from.z);
    for (const kart of s.karts) {
      expect(kart.respawnTimer).toBeGreaterThan(0);
      const at = geometry.project(kart.position);
      expect(at.t).toBeCloseTo(start, 3);
      expect(Math.abs(at.lateral)).toBeLessThanOrEqual(CANOPY_RUSH.bridgeWidth / 2);
    }
    // Lowered onto the deck, nobody falls again.
    const events: SimEvent[] = [];
    for (let i = 0; i < 120; i += 1) {
      const result = step(s, []);
      s = result.state;
      events.push(...result.events);
    }
    expect(events.filter((e) => e.type === 'respawn')).toHaveLength(0);
  });

  it('driving off the edge of the ruins floor, you fall for a moment before being put back', () => {
    const state = scenarios.get('canopy-shortcut')!.setup(1).state;
    const kart = state.karts[0]!;
    // On the ruins floor by its west edge, heading west off it at 10 m/s.
    kart.position = { x: 53, y: CANOPY_RUSH.floorY, z: -60 };
    kart.heading = Math.PI / 2;
    kart.velocity = { x: -10, y: 0, z: 0 };
    kart.grounded = true;
    const { events } = run(state, 20, () => ({ throttle: 1 }));
    // Off the floor within a few ticks, but not "fallen" straight away though the road is far above.
    expect(respawns(events)).toHaveLength(0);
    const later = run(state, 60, () => ({ throttle: 1 }));
    expect(respawns(later.events)).toHaveLength(1);
  });
});

describe('Canopy Rush ruins shortcut', () => {
  const info = routeInfos(geometry)[0]!;

  it('leaves the platform before bridge 2 and rejoins after the root ramp; a checkpoint lies between', () => {
    expect(info.from).toBeLessThan(tAt(bridges.b2.from.x, bridges.b2.from.z));
    expect(info.from + info.span).toBeGreaterThan(tAt(bridges.b2.to.x, bridges.b2.to.z));
    expect(
      canopyRush.checkpoints.filter((t) => t > info.from && t < info.from + info.span),
    ).toHaveLength(2);
  });

  it('progress through the ruins runs smoothly from where they leave the lap to where they rejoin', () => {
    let last = -1;
    for (const point of CANOPY_RUSH.ruinsPath.slice(3, -2)) {
      const t = progressT(point);
      expect(t).toBeGreaterThan(last);
      expect(t).toBeGreaterThanOrEqual(info.from);
      expect(t).toBeLessThanOrEqual(info.from + info.span);
      last = t;
    }
    // On the main road it's the road's own progress.
    const onRoad = geometry.pointAt(0.3);
    expect(routeProgress(geometry, onRoad, geometry.project(onRoad))).toBeUndefined();
  });

  it('canopy-shortcut: holding W drops you into the ruins, with no respawn', () => {
    const state = scenarios.get('canopy-shortcut')!.setup(1).state;
    expect(state.engineClass).toBe(150);
    const { state: end, events } = run(state, 150, () => ({ throttle: 1 }));
    const kart = end.karts[0]!;
    expect(respawns(events)).toHaveLength(0);
    expect(kart.grounded).toBe(true);
    expect(kart.position.y).toBeCloseTo(CANOPY_RUSH.floorY, 3);
    expect(insidePolygon(kart.position.x, kart.position.z, [...ruinsFloor])).toBe(true);
    expect(routeProgress(geometry, kart.position, geometry.project(kart.position))).toBeDefined();
  });

  /** Ticks for one AI kart from 60 m before the ruins to 20 m past their end, and its events. */
  function throughTheRuins(chance: number) {
    const saved = RUINS_ROUTE.aiChance;
    RUINS_ROUTE.aiChance = chance;
    try {
      let s = createRace({
        trackId: 'canopy-rush',
        racers: [{ kartId: 'maple', controller: 'ai' }],
        engineClass: 150,
        itemsOn: false,
        seed: 1,
      });
      while (s.phase !== 'racing') s = step(s, []).state;
      const t0 = info.from - 60 / geometry.length;
      const kart = s.karts[0]!;
      const along = geometry.tangentAt(t0);
      kart.position = geometry.pointAt(t0);
      kart.heading = geometry.headingAt(t0);
      kart.velocity = { x: along.x * 24, y: 0, z: along.z * 24 };
      kart.race = { ...kart.race, lap: 1, lastT: t0, nextCheckpoint: 3 };
      const end = info.from + info.span + 20 / geometry.length;
      const events: SimEvent[] = [];
      let ruinsTicks = 0;
      for (let ticks = 1; ticks < 3000; ticks += 1) {
        const result = step(s, []);
        s = result.state;
        events.push(...result.events);
        const k = s.karts[0]!;
        if (routeProgress(geometry, k.position, geometry.project(k.position))) ruinsTicks += 1;
        if (progressT(k.position) > end) return { ticks, ruinsTicks, events, state: s };
      }
      throw new Error('never got past the ruins');
    } finally {
      RUINS_ROUTE.aiChance = saved;
    }
  }

  it('counts as lap progress, and saves at least 2 s on the reference AI line', () => {
    const road = throughTheRuins(0);
    const ruins = throughTheRuins(1);
    expect(road.ruinsTicks).toBe(0);
    expect(ruins.ruinsTicks).toBeGreaterThan(300);
    // Both pass the same 2 checkpoints (bridge 2's end, the root ramp) with no respawn.
    for (const run of [road, ruins]) {
      expect(run.events.filter((e) => e.type === 'checkpoint')).toHaveLength(2);
      expect(respawns(run.events)).toHaveLength(0);
      expect(run.state.karts[0]!.race.nextCheckpoint).toBe(0);
    }
    expect((road.ticks - ruins.ticks) * DT).toBeGreaterThan(2);
  });

  it('an AI that ends up in the ruins without choosing them follows them back to the road', () => {
    const saved = RUINS_ROUTE.aiChance;
    RUINS_ROUTE.aiChance = 0;
    try {
      let s = createRace({
        trackId: 'canopy-rush',
        racers: [{ kartId: 'maple', controller: 'ai' }],
        engineClass: 150,
        itemsOn: false,
        seed: 1,
      });
      while (s.phase !== 'racing') s = step(s, []).state;
      const kart = s.karts[0]!;
      // Knocked down onto the landing plaza, facing down the ruins.
      kart.position = { x: 68, y: CANOPY_RUSH.floorY, z: -80 };
      kart.heading = Math.PI;
      kart.velocity = { x: 0, y: 0, z: 15 };
      kart.grounded = true;
      const events: SimEvent[] = [];
      let rejoined = false;
      for (let i = 0; i < 60 * 12 && !rejoined; i += 1) {
        const result = step(s, []);
        s = result.state;
        events.push(...result.events);
        // Back on the road on the jungle floor, where the ruins rejoin it.
        const k = s.karts[0]!;
        rejoined = geometry.project(k.position).surface !== 'out' && k.position.z > 150;
      }
      expect(respawns(events)).toHaveLength(0);
      expect(rejoined).toBe(true);
    } finally {
      RUINS_ROUTE.aiChance = saved;
    }
  });

  it('an AI takes the ruins on some laps, not all: seeded by its personality and the lap', () => {
    const state = createRace({
      trackId: 'canopy-rush',
      racers: Array.from({ length: 8 }, (_, i) => ({
        kartId: KART_IDS[i % KART_IDS.length]!,
        controller: 'ai' as const,
      })),
      engineClass: 150,
      itemsOn: false,
      seed: 7,
    });
    const rolls = state.karts.flatMap((kart) =>
      [1, 2, 3].map((lap) => routeRoll(kart, kart.ai!, lap, 0)),
    );
    const taken = rolls.filter((r) => r < RUINS_ROUTE.aiChance).length;
    expect(taken).toBeGreaterThan(0);
    expect(taken).toBeLessThan(rolls.length);
    // The same race makes the same calls.
    expect(state.karts.map((k) => routeRoll(k, k.ai!, 2, 0))).toEqual(
      state.karts.map((k) => routeRoll(k, k.ai!, 2, 0)),
    );
  });
});

describe('Canopy Rush AI race', () => {
  it('8 AI race 3 laps at 150cc: all finish in under 3 min, under 2 falls each, some take the ruins', () => {
    let s = createRace({
      trackId: 'canopy-rush',
      racers: Array.from({ length: 8 }, (_, i) => ({
        kartId: KART_IDS[i % KART_IDS.length]!,
        controller: 'ai' as const,
      })),
      engineClass: 150,
      itemsOn: true,
      seed: 1,
    });
    const falls = new Map<number, number>();
    const stuckFor = new Map<number, number>();
    const inRuins = new Set<number>();
    let worst = 0;
    for (let i = 0; i < 60 * 60 * 4; i += 1) {
      const result = step(s, []);
      s = result.state;
      for (const e of result.events) {
        if (e.type === 'respawn') falls.set(e.kartId, (falls.get(e.kartId) ?? 0) + 1);
      }
      if (s.phase === 'countdown') continue;
      for (const kart of s.karts) {
        if (kart.race.finishTick !== undefined) continue;
        const t = Math.abs(kart.speed) < 1 ? (stuckFor.get(kart.id) ?? 0) + DT : 0;
        stuckFor.set(kart.id, t);
        worst = Math.max(worst, t);
        if (routeProgress(geometry, kart.position, geometry.project(kart.position))) {
          inRuins.add(kart.id);
        }
      }
      if (s.karts.every((k) => k.race.finishTick !== undefined)) break;
    }
    const times = s.karts.map((k) => ((k.race.finishTick ?? Infinity) - s.race.goTick) * DT);
    expect(Math.max(...times)).toBeLessThan(180);
    expect(worst).toBeLessThanOrEqual(5);
    for (const kart of s.karts) expect(falls.get(kart.id) ?? 0).toBeLessThan(2);
    expect(inRuins.size).toBeGreaterThan(0);
    expect(inRuins.size).toBeLessThan(8);
    expect(tuning.ai.routeCapture).toBeGreaterThan(0);
  });

  it('track-canopy-rush: a 150cc race of you + 7 AI in countdown, you starting 5th–8th', () => {
    const state = scenarios.get('track-canopy-rush')!.setup(1).state;
    expect(state.trackId).toBe('canopy-rush');
    expect(state.phase).toBe('countdown');
    expect(state.engineClass).toBe(150);
    expect(state.karts).toHaveLength(8);
    expect(state.karts.filter((k) => k.controller === 'ai')).toHaveLength(7);
    const player = state.karts.find((k) => k.controller === 'local')!;
    const slots = canopyRush.gridSlots ?? [];
    const back = slots.slice(4).map((slot) => geometry.pointAt(slot.t, slot.lateral));
    expect(
      back.some((p) => Math.hypot(p.x - player.position.x, p.z - player.position.z) < 0.5),
    ).toBe(true);
  });
});
