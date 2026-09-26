import { entitySpecs, itemEffects, items } from '../content/items';
import { isKartId, type KartId } from '../sim/data/karts';
import { DT, type EngineClass } from '../sim/tuning';
import type {
  AiState,
  DriftTier,
  Entity,
  HitKind,
  InputFrame,
  ItemId,
  KartState,
  RacePhase,
  SimEvent,
  SimState,
} from '../sim/types';
import { ByteReader, ByteWriter } from './bytes';

/**
 * Online race wire format (ADR 0005, from the MK-36 spike): little-endian binary, one message per
 * packet, first byte = message type. Start carries the protocol version; a client that doesn't
 * speak it answers Bye('version'). Snapshots are quantized and applied on top of the client's own
 * copy of the race, so fields that never change during a race (kart type, AI personality) are only
 * sent once, in Start.
 */
export const PROTOCOL_VERSION = 3;

export const MSG = {
  start: 1,
  input: 2,
  snapshot: 3,
  event: 4,
  bye: 5,
  ping: 6,
  pong: 7,
  results: 8,
} as const;

/** Position x/z resolution: 1/64 m (±512 m in an int16; max error 0.8 cm). */
export const POS_XZ = 64;
/** Height resolution: 1/256 m (±128 m). */
export const POS_Y = 256;
/** Velocity and speed resolution: 1/256 m/s (±128 m/s). */
export const VEL = 256;
/** Heading: full circle in a uint16 (max error 0.003°). */
export const HEADING = 0x10000 / (2 * Math.PI);
/** Timers (seconds) are sent in ms. */
const MS = 1000;
/** Lap fractions (-1..1) mapped onto a uint16. */
const LAP_T = 32767;
/** Unit direction components in an int16. */
const UNIT = 32767;
/** Input throttle/brake 0..1 in a uint8; steer -1..1 in an int8. */
const INPUT_UNIT = 255;
const STEER_UNIT = 127;
/** The age of a human's applied input is sent in a uint8. */
const MAX_INPUT_AGE = 0xff;

const PHASES: readonly RacePhase[] = ['free', 'countdown', 'racing', 'finished'];
/** Items by index: every registered item (`src/content/items/`), so both peers need the same build. */
const itemIds = (): readonly ItemId[] => items.ids();
/** Hit kinds by index: the items, then squash, then track hazards. */
const hitKinds = (): readonly HitKind[] => [...items.ids(), 'squash', 'hazard'];
const TRICKS: readonly KartState['trick'][] = ['none', 'ready', 'done'];
const ENGINE_CLASSES: readonly EngineClass[] = [50, 100, 150];
/** Snapshot layout: type u8, tick u32, then the ack u32. */
const SNAPSHOT_ACK_OFFSET = 5;

// --- Messages ---------------------------------------------------------------------------------

/** One racer of the race, as the host set it up: enough for a client to build the same race. */
export interface SetupRacer {
  kartId: KartId;
  /** A person (the host or a client) or the AI. */
  human: boolean;
  name?: string;
  gridSlot: number;
  /** AI karts: the seeded personality (sent, not re-derived, so it's always the host's). */
  ai?: Pick<AiState, 'lineOffset' | 'skill' | 'aggression'>;
}

/** The race a client joins (`createRace` options, resolved by the host). */
export interface RaceSetup {
  trackId: string;
  engineClass: EngineClass;
  itemsOn: boolean;
  seed: number;
  laps: number;
  racers: SetupRacer[];
}

/** Host → client, repeated until the client's first input arrives: the race and your kart. */
export interface StartMessage {
  type: typeof MSG.start;
  version: number;
  /** The kart the receiving client drives. */
  kartId: number;
  setup: RaceSetup;
}

/** Client → host, every tick. */
export interface InputMessage {
  type: typeof MSG.input;
  /** Tick of `inputs[0]`; `inputs[i]` is for tick `newestTick - i`. */
  newestTick: number;
  inputs: InputFrame[];
}

/** The input the host applied to a human's kart at the snapshot's tick. */
export interface AppliedInput {
  kartId: number;
  /** Snapshot tick minus the tick that input was for: 0 = on time, > 0 = held (late or lost). */
  age: number;
  input: InputFrame;
}

/** Host → client at 20 Hz: the authoritative state after `tick`. */
export interface SnapshotMessage {
  type: typeof MSG.snapshot;
  tick: number;
  /** Newest input tick the host has received from this client. */
  ackTick: number;
  /** The input the host applied at `tick`, per human kart (the client predicts with these). */
  humans: AppliedInput[];
  /** Quantized state: apply with `applySnapshot`. */
  bytes: Uint8Array;
}

/** A host-decided race event, numbered so repeats can be dropped. */
export interface NetEvent {
  seq: number;
  tick: number;
  event: SimEvent;
}

/** Host → client with each snapshot: its recent events (repeated for a while, since packets drop). */
export interface EventMessage {
  type: typeof MSG.event;
  events: NetEvent[];
}

export type ByeReason = 'left' | 'ended' | 'kicked' | 'version';
const BYE_REASONS: readonly ByeReason[] = ['left', 'ended', 'kicked', 'version'];

/** Either side, when leaving (best effort: a lost Bye is a timeout for the other side). */
export interface ByeMessage {
  type: typeof MSG.bye;
  reason: ByeReason;
}

/** Client ↔ host round-trip time. */
export interface PingMessage {
  type: typeof MSG.ping | typeof MSG.pong;
  time: number;
}

/** One kart's place in the host's final standings (MK-55). */
export interface RaceStanding {
  kartId: number;
  /** The tick it crossed the line; absent for AI still racing when the race ended. */
  finishTick?: number;
}

/**
 * Host → client with each snapshot once the race has ended (every human finished): the host's
 * standings, frozen at that tick, so every device shows the same results (MK-55).
 */
export interface ResultsMessage {
  type: typeof MSG.results;
  standings: RaceStanding[];
}

export type NetMessage =
  | StartMessage
  | InputMessage
  | SnapshotMessage
  | EventMessage
  | ByeMessage
  | PingMessage
  | ResultsMessage;

// --- Encoding ---------------------------------------------------------------------------------

export function encodeStart(kartId: number, setup: RaceSetup): Uint8Array {
  const w = new ByteWriter().u8(MSG.start).u8(PROTOCOL_VERSION).u8(kartId);
  w.str(setup.trackId)
    .u8(ENGINE_CLASSES.indexOf(setup.engineClass))
    .u8(setup.itemsOn ? 1 : 0)
    .u32(setup.seed)
    .u8(setup.laps)
    .u8(setup.racers.length);
  for (const racer of setup.racers) {
    const flags = (racer.human ? 1 : 0) | (racer.name !== undefined ? 2 : 0) | (racer.ai ? 4 : 0);
    w.str(racer.kartId).u8(flags).u8(racer.gridSlot);
    if (racer.name !== undefined) w.str(racer.name);
    // Full precision: the AI's decisions depend on these, and the client re-simulates them.
    if (racer.ai) w.f64(racer.ai.lineOffset).f64(racer.ai.skill).f64(racer.ai.aggression);
  }
  return w.bytes();
}

export function encodeInputs(newestTick: number, inputs: readonly InputFrame[]): Uint8Array {
  const w = new ByteWriter().u8(MSG.input).u32(newestTick).u8(inputs.length);
  for (const input of inputs) writeInput(w, input);
  return w.bytes();
}

/** Encodes the host's state after `state.tick` for one client. */
export function encodeSnapshot(
  state: SimState,
  ackTick: number,
  humans: readonly AppliedInput[],
): Uint8Array {
  const w = new ByteWriter().u8(MSG.snapshot).u32(state.tick).u32(ackTick);
  w.u8(humans.length);
  for (const { kartId, age, input } of humans) {
    writeInput(w.u8(kartId).u8(Math.min(age, MAX_INPUT_AGE)), input);
  }
  w.u8(PHASES.indexOf(state.phase)).u32(state.rngState);
  w.u8(state.karts.length);
  for (const kart of state.karts) writeKart(w, kart);
  for (const id of state.positions) w.u8(id);
  w.u8(state.entities.length);
  for (const entity of state.entities) writeEntity(w, entity);
  return w.bytes();
}

/** A copy of an encoded snapshot with another ack tick (the host encodes the state once). */
export function withAck(snapshot: Uint8Array, ackTick: number): Uint8Array {
  const copy = snapshot.slice();
  new DataView(copy.buffer).setUint32(SNAPSHOT_ACK_OFFSET, ackTick >>> 0, true);
  return copy;
}

export function encodeEvents(events: readonly NetEvent[]): Uint8Array {
  const w = new ByteWriter().u8(MSG.event).u8(events.length);
  for (const { seq, tick, event } of events) writeEvent(w.u32(seq).u32(tick), event);
  return w.bytes();
}

export function encodeBye(reason: ByeReason): Uint8Array {
  return new ByteWriter().u8(MSG.bye).u8(BYE_REASONS.indexOf(reason)).bytes();
}

export function encodePing(type: typeof MSG.ping | typeof MSG.pong, time: number): Uint8Array {
  return new ByteWriter().u8(type).f64(time).bytes();
}

/** Standings leader first; a finish tick of 0 means "not finished" (the race starts at tick 0). */
export function encodeResults(standings: readonly RaceStanding[]): Uint8Array {
  const w = new ByteWriter().u8(MSG.results).u8(standings.length);
  for (const { kartId, finishTick } of standings) w.u8(kartId).u32(finishTick ?? 0);
  return w.bytes();
}

/** Decodes any message. Throws on unknown types and truncated or malformed packets. */
export function decodeMessage(bytes: Uint8Array): NetMessage {
  const r = new ByteReader(bytes);
  const type = r.u8();
  switch (type) {
    case MSG.start:
      return readStart(r);
    case MSG.input: {
      const newestTick = r.u32();
      const count = r.u8();
      return { type, newestTick, inputs: Array.from({ length: count }, () => readInput(r)) };
    }
    case MSG.snapshot: {
      const tick = r.u32();
      const ackTick = r.u32();
      const count = r.u8();
      const humans = Array.from({ length: count }, () => ({
        kartId: r.u8(),
        age: r.u8(),
        input: readInput(r),
      }));
      return { type, tick, ackTick, humans, bytes: bytes.subarray(r.offset) };
    }
    case MSG.event: {
      const count = r.u8();
      const events = Array.from({ length: count }, () => ({
        seq: r.u32(),
        tick: r.u32(),
        event: readEvent(r),
      }));
      return { type, events };
    }
    case MSG.bye:
      return { type, reason: BYE_REASONS[r.u8()] ?? 'left' };
    case MSG.ping:
    case MSG.pong:
      return { type, time: r.f64() };
    case MSG.results: {
      const count = r.u8();
      const standings = Array.from({ length: count }, (): RaceStanding => {
        const kartId = r.u8();
        const finishTick = r.u32();
        return finishTick > 0 ? { kartId, finishTick } : { kartId };
      });
      return { type, standings };
    }
    default:
      throw new Error(`Unknown message type ${type}`);
  }
}

function readStart(r: ByteReader): StartMessage {
  const version = r.u8();
  const kartId = r.u8();
  // A different version may lay the rest out differently: stop here and let the client refuse.
  const empty: RaceSetup = {
    trackId: '',
    engineClass: 100,
    itemsOn: false,
    seed: 0,
    laps: 0,
    racers: [],
  };
  if (version !== PROTOCOL_VERSION) return { type: MSG.start, version, kartId, setup: empty };
  const trackId = r.str();
  const engineClass = ENGINE_CLASSES[r.u8()];
  if (engineClass === undefined) throw new Error('Unknown engine class');
  const itemsOn = r.u8() === 1;
  const seed = r.u32();
  const laps = r.u8();
  const racers = Array.from({ length: r.u8() }, (): SetupRacer => {
    const kart = r.str();
    if (!isKartId(kart)) throw new Error(`Unknown kart ${kart}`);
    const flags = r.u8();
    const racer: SetupRacer = { kartId: kart, human: !!(flags & 1), gridSlot: r.u8() };
    if (flags & 2) racer.name = r.str();
    if (flags & 4) racer.ai = { lineOffset: r.f64(), skill: r.f64(), aggression: r.f64() };
    return racer;
  });
  return {
    type: MSG.start,
    version,
    kartId,
    setup: { trackId, engineClass, itemsOn, seed, laps, racers },
  };
}

// --- Inputs -----------------------------------------------------------------------------------

function writeInput(w: ByteWriter, input: InputFrame): void {
  w.u8(input.throttle * INPUT_UNIT)
    .u8(input.brake * INPUT_UNIT)
    .i8(input.steer * STEER_UNIT)
    .u8((input.drift ? 1 : 0) | (input.item ? 2 : 0) | (input.respawn ? 4 : 0));
}

function readInput(r: ByteReader): InputFrame {
  const throttle = r.u8() / INPUT_UNIT;
  const brake = r.u8() / INPUT_UNIT;
  const steer = r.i8() / STEER_UNIT;
  const flags = r.u8();
  const input: InputFrame = { throttle, brake, steer, drift: !!(flags & 1), item: !!(flags & 2) };
  if (flags & 4) input.respawn = true;
  return input;
}

/** Rounds an input through the wire format, so host and client simulate exactly the same frame. */
export function quantizeInput(input: InputFrame): InputFrame {
  const w = new ByteWriter();
  writeInput(w, input);
  return readInput(new ByteReader(w.bytes()));
}

/** Whether two (quantized) inputs are the same frame. */
export function sameInput(a: InputFrame, b: InputFrame): boolean {
  return (
    a.throttle === b.throttle &&
    a.brake === b.brake &&
    a.steer === b.steer &&
    a.drift === b.drift &&
    a.item === b.item &&
    !!a.respawn === !!b.respawn
  );
}

// --- Snapshot state ---------------------------------------------------------------------------

/**
 * Overwrites `state` (the client's own copy of the same race) with a snapshot's state at `tick`.
 * Mutates and returns `state`.
 */
export function applySnapshot(state: SimState, tick: number, bytes: Uint8Array): SimState {
  const r = new ByteReader(bytes);
  state.tick = tick;
  state.phase = PHASES[r.u8()] ?? state.phase;
  state.rngState = r.u32();
  const karts = r.u8();
  if (karts !== state.karts.length) {
    throw new Error(`Snapshot has ${karts} karts, the local race ${state.karts.length}`);
  }
  for (const kart of state.karts) readKart(r, kart);
  state.positions = Array.from({ length: karts }, () => r.u8());
  const entities = r.u8();
  state.entities = Array.from({ length: entities }, () => readEntity(r));
  return state;
}

/** Kart timers sent only when non-zero (bit i of a uint16 mask = TIMERS[i] present). */
const TIMERS: readonly {
  get: (k: KartState) => number;
  set: (k: KartState, v: number) => void;
}[] = [
  { get: (k) => k.boostTimer, set: (k, v) => (k.boostTimer = v) },
  { get: (k) => k.airTime, set: (k, v) => (k.airTime = v) },
  { get: (k) => k.respawnTimer, set: (k, v) => (k.respawnTimer = v) },
  { get: (k) => k.invulnerableTimer, set: (k, v) => (k.invulnerableTimer = v) },
  { get: (k) => k.outTime, set: (k, v) => (k.outTime = v) },
  { get: (k) => k.respawnCooldown, set: (k, v) => (k.respawnCooldown = v) },
  { get: (k) => k.spinTimer, set: (k, v) => (k.spinTimer = v) },
  { get: (k) => k.starTimer, set: (k, v) => (k.starTimer = v) },
  { get: (k) => k.shrinkTimer, set: (k, v) => (k.shrinkTimer = v) },
  { get: (k) => k.drift.charge, set: (k, v) => (k.drift.charge = v) },
  { get: (k) => k.race.stallTimer, set: (k, v) => (k.race.stallTimer = v) },
  { get: (k) => k.race.wrongWayTime, set: (k, v) => (k.race.wrongWayTime = v) },
  { get: (k) => k.item.roulette, set: (k, v) => (k.item.roulette = v) },
];

/** AI memory sent with a presence mask (optional fields stay undefined when absent). */
const AI_TIMERS = ['stuckTime', 'recoverTime', 'itemDelay', 'itemHeld'] as const;

/**
 * A timer in ms as sent (0 = not sent). A running timer never rounds to 0, even a float leftover
 * like 1e-17 s: "running or not" decides what the sim does next tick.
 */
function timerMs(seconds: number | undefined): number {
  return seconds !== undefined && seconds > 0 ? Math.max(1, Math.round(seconds * MS)) : 0;
}

function writeKart(w: ByteWriter, k: KartState): void {
  writePos(w, k.position);
  w.i16(k.velocity.x * VEL)
    .i16(k.velocity.y * VEL)
    .i16(k.velocity.z * VEL);
  w.u16(wrapHeading(k.heading) * HEADING).i16(k.speed * VEL);
  const race = k.race;
  const flags =
    (k.grounded ? 1 : 0) |
    (k.driftHeld ? 2 : 0) |
    (TRICKS.indexOf(k.trick) << 2) |
    ((k.drift.direction + 1) << 4) |
    (k.drift.tier << 6);
  const flags2 =
    (race.wrongWay ? 1 : 0) |
    (k.item.buttonHeld ? 2 : 0) |
    (k.ai?.drifting ? 4 : 0) |
    (race.finishTick !== undefined ? 8 : 0) |
    (race.throttleSince !== undefined ? 16 : 0);
  w.u8(flags).u8(flags2);
  let mask = 0;
  TIMERS.forEach((timer, i) => {
    if (timerMs(timer.get(k)) !== 0) mask |= 1 << i;
  });
  w.u16(mask);
  TIMERS.forEach((timer, i) => {
    if (mask & (1 << i)) w.u16(timerMs(timer.get(k)));
  });
  w.u8(race.lap)
    .u8(race.nextCheckpoint)
    .u16((race.lastT + 1) * LAP_T);
  w.u16((k.lastSafeT + 1) * LAP_T).u32(race.lapStartTick);
  // Lap times too: otherwise a client that predicted a line crossing records the lap again on replay.
  // They're whole ticks (`sim/race.ts`), so ticks restore them exactly.
  w.u8(race.lapTimes.length);
  for (const time of race.lapTimes) w.u16(Math.round(time / DT));
  if (race.finishTick !== undefined) w.u32(race.finishTick);
  if (race.throttleSince !== undefined) w.u32(race.throttleSince);
  w.u8(k.item.held === null ? 0 : itemIds().indexOf(k.item.held) + 1).u8(k.item.uses);
  writeEffects(w, k);
  const ai = k.ai;
  if (ai) {
    let aiMask = 0;
    AI_TIMERS.forEach((key, i) => {
      if (timerMs(ai[key]) !== 0) aiMask |= 1 << i;
    });
    w.u8(aiMask);
    AI_TIMERS.forEach((key, i) => {
      if (aiMask & (1 << i)) w.u16(timerMs(ai[key]));
    });
  }
}

function readKart(r: ByteReader, k: KartState): void {
  k.position = readPos(r);
  k.velocity = { x: r.i16() / VEL, y: r.i16() / VEL, z: r.i16() / VEL };
  k.heading = unwrapHeading(r.u16() / HEADING);
  k.speed = r.i16() / VEL;
  const flags = r.u8();
  const flags2 = r.u8();
  k.grounded = !!(flags & 1);
  k.driftHeld = !!(flags & 2);
  k.trick = TRICKS[(flags >> 2) & 3] ?? 'none';
  k.drift.direction = (((flags >> 4) & 3) - 1) as -1 | 0 | 1;
  k.drift.tier = ((flags >> 6) & 3) as DriftTier;
  k.race.wrongWay = !!(flags2 & 1);
  k.item.buttonHeld = !!(flags2 & 2);
  if (k.ai) k.ai.drifting = !!(flags2 & 4);
  const mask = r.u16();
  TIMERS.forEach((timer, i) => timer.set(k, mask & (1 << i) ? r.u16() / MS : 0));
  k.race.lap = r.u8();
  k.race.nextCheckpoint = r.u8();
  k.race.lastT = r.u16() / LAP_T - 1;
  k.lastSafeT = r.u16() / LAP_T - 1;
  k.race.lapStartTick = r.u32();
  k.race.lapTimes = Array.from({ length: r.u8() }, () => r.u16() * DT);
  if (flags2 & 8) k.race.finishTick = r.u32();
  else delete k.race.finishTick;
  if (flags2 & 16) k.race.throttleSince = r.u32();
  else delete k.race.throttleSince;
  const held = r.u8();
  k.item.held = held === 0 ? null : (itemIds()[held - 1] ?? null);
  k.item.uses = r.u8();
  readEffects(r, k);
  const ai = k.ai;
  if (ai) {
    const aiMask = r.u8();
    AI_TIMERS.forEach((key, i) => {
      if (aiMask & (1 << i)) ai[key] = r.u16() / MS;
      else if (key === 'stuckTime' || key === 'recoverTime') ai[key] = 0;
      else if (key === 'itemDelay') delete ai.itemDelay;
      else delete ai.itemHeld;
    });
  }
}

/** Numbers owned by item effects and entities (their meaning is the item's): exact f64s. */
function writeData(w: ByteWriter, data: readonly number[]): void {
  w.u8(data.length);
  for (const value of data) w.f64(value);
}

function readData(r: ByteReader): number[] {
  return Array.from({ length: r.u8() }, () => r.f64());
}

/** Kart effects (MK-52): count, then kind (by registered index), ticks left, cause, data. */
function writeEffects(w: ByteWriter, k: KartState): void {
  const kinds = itemEffects.ids();
  w.u8(k.effects.length);
  for (const effect of k.effects) {
    w.u8(kinds.indexOf(effect.kind)).u16(effect.ticksLeft).i8(effect.by);
    writeData(w, effect.data);
  }
}

function readEffects(r: ByteReader, k: KartState): void {
  const kinds = itemEffects.ids();
  k.effects = Array.from({ length: r.u8() }, () => {
    const kind = kinds[r.u8()];
    if (kind === undefined) throw new Error('Unknown kart effect');
    return { kind, ticksLeft: r.u16(), by: r.i8(), data: readData(r) };
  });
}

const ENTITY_KIND = { itemBox: 1, banana: 2, green: 3, red: 4, item: 5 } as const;

function writeEntity(w: ByteWriter, e: Entity): void {
  const kind = e.kind === 'shell' ? ENTITY_KIND[e.colour] : ENTITY_KIND[e.kind];
  w.u8(kind).u16(e.id);
  writePos(w, e.position);
  switch (e.kind) {
    case 'itemBox':
      w.u16(e.respawnTimer * MS);
      break;
    case 'banana':
      writePos(w, e.from);
      w.u16(e.flightTimer * MS)
        .u8(e.ownerId)
        .u16(e.ownerImmune * MS);
      break;
    case 'shell':
      w.i16(e.direction.x * UNIT)
        .i16(e.direction.z * UNIT)
        .i16(e.speed * VEL)
        .u8(e.bounces);
      w.u16(e.life * MS)
        .u8(e.ownerId)
        .u16(e.ownerImmune * MS)
        .i8(e.targetId);
      break;
    case 'item':
      w.u8(entitySpecs.ids().indexOf(e.spec))
        .i16(e.direction.x * UNIT)
        .i16(e.direction.z * UNIT)
        .i16(e.speed * VEL);
      w.u16(e.age).u8(e.ownerId).i8(e.targetId).u8(e.returning).u8(e.bounces);
      writeData(w, e.data);
      break;
  }
}

function readEntity(r: ByteReader): Entity {
  const kind = r.u8();
  const id = r.u16();
  const position = readPos(r);
  if (kind === ENTITY_KIND.itemBox) {
    return { id, kind: 'itemBox', position, respawnTimer: r.u16() / MS };
  }
  if (kind === ENTITY_KIND.banana) {
    const from = readPos(r);
    return {
      id,
      kind: 'banana',
      position,
      from,
      flightTimer: r.u16() / MS,
      ownerId: r.u8(),
      ownerImmune: r.u16() / MS,
    };
  }
  if (kind === ENTITY_KIND.green || kind === ENTITY_KIND.red) {
    return {
      id,
      kind: 'shell',
      colour: kind === ENTITY_KIND.green ? 'green' : 'red',
      position,
      direction: { x: r.i16() / UNIT, z: r.i16() / UNIT },
      speed: r.i16() / VEL,
      bounces: r.u8(),
      life: r.u16() / MS,
      ownerId: r.u8(),
      ownerImmune: r.u16() / MS,
      targetId: r.i8(),
    };
  }
  if (kind === ENTITY_KIND.item) {
    const spec = entitySpecs.ids()[r.u8()];
    if (spec === undefined) throw new Error('Unknown item entity');
    return {
      id,
      kind: 'item',
      spec,
      position,
      direction: { x: r.i16() / UNIT, z: r.i16() / UNIT },
      speed: r.i16() / VEL,
      age: r.u16(),
      ownerId: r.u8(),
      targetId: r.i8(),
      returning: r.u8() === 1 ? 1 : 0,
      bounces: r.u8(),
      data: readData(r),
    };
  }
  throw new Error(`Unknown entity kind ${kind}`);
}

function writePos(w: ByteWriter, p: { x: number; y: number; z: number }): void {
  w.i16(p.x * POS_XZ)
    .i16(p.y * POS_Y)
    .i16(p.z * POS_XZ);
}

function readPos(r: ByteReader): { x: number; y: number; z: number } {
  return { x: r.i16() / POS_XZ, y: r.i16() / POS_Y, z: r.i16() / POS_XZ };
}

/** Heading in [0, 2π) for the uint16. */
function wrapHeading(heading: number): number {
  const full = 2 * Math.PI;
  return ((heading % full) + full) % full;
}

/** Back to the sim's (-π, π]. */
function unwrapHeading(heading: number): number {
  return heading > Math.PI ? heading - 2 * Math.PI : heading;
}

// --- Events -----------------------------------------------------------------------------------

/** How one event field goes on the wire. */
type FieldKind =
  | 'u8' // kart ids, laps, positions, tiers, countdown values
  | 'i8' // kart ids that may be -1, drift directions
  | 'u16' // entity ids
  | 'f64' // times and strengths, exact
  | 'f64?' // optional f64 (presence byte)
  | 'phase'
  | 'item'
  | 'hit'
  | 'str' // short names (item fx)
  | 'u8[]'; // kart id lists

type EventType = SimEvent['type'];

/** Every SimEvent's fields in wire order. The event code is the key's index. */
const EVENT_FIELDS: Record<EventType, readonly (readonly [string, FieldKind])[]> = {
  phaseChanged: [['phase', 'phase']],
  checkpoint: [
    ['kartId', 'u8'],
    ['index', 'u8'],
  ],
  lap: [
    ['kartId', 'u8'],
    ['lap', 'u8'],
    ['lapTime', 'f64?'],
  ],
  positionChange: [['positions', 'u8[]']],
  countdown: [['value', 'u8']],
  go: [],
  rocketStart: [['kartId', 'u8']],
  stall: [['kartId', 'u8']],
  finish: [
    ['kartId', 'u8'],
    ['position', 'u8'],
    ['time', 'f64'],
  ],
  respawn: [['kartId', 'u8']],
  itemBoxHit: [
    ['kartId', 'u8'],
    ['boxId', 'u16'],
  ],
  itemGranted: [
    ['kartId', 'u8'],
    ['item', 'item'],
  ],
  itemUsed: [
    ['kartId', 'u8'],
    ['item', 'item'],
  ],
  kartHit: [
    ['kartId', 'u8'],
    ['by', 'i8'],
    ['kind', 'hit'],
  ],
  star: [['kartId', 'u8']],
  lightning: [['kartId', 'u8']],
  wallHit: [
    ['kartId', 'u8'],
    ['strength', 'f64'],
  ],
  bump: [
    ['a', 'u8'],
    ['b', 'u8'],
    ['strength', 'f64'],
  ],
  hop: [['kartId', 'u8']],
  driftStart: [
    ['kartId', 'u8'],
    ['direction', 'i8'],
  ],
  driftTier: [
    ['kartId', 'u8'],
    ['tier', 'u8'],
  ],
  driftCancel: [['kartId', 'u8']],
  miniTurbo: [
    ['kartId', 'u8'],
    ['tier', 'u8'],
  ],
  boost: [
    ['kartId', 'u8'],
    ['seconds', 'f64'],
  ],
  boostPad: [['kartId', 'u8']],
  launch: [['kartId', 'u8']],
  trick: [['kartId', 'u8']],
  land: [
    ['kartId', 'u8'],
    ['airTime', 'f64'],
  ],
  itemFx: [
    ['kartId', 'u8'],
    ['item', 'item'],
    ['fx', 'str'],
  ],
};

const EVENT_TYPES = Object.keys(EVENT_FIELDS) as EventType[];

function writeEvent(w: ByteWriter, event: SimEvent): void {
  w.u8(EVENT_TYPES.indexOf(event.type));
  const fields = event as unknown as Record<string, unknown>;
  for (const [name, kind] of EVENT_FIELDS[event.type]) {
    const value = fields[name];
    switch (kind) {
      case 'u8':
        w.u8(value as number);
        break;
      case 'i8':
        w.i8(value as number);
        break;
      case 'u16':
        w.u16(value as number);
        break;
      case 'f64':
        w.f64(value as number);
        break;
      case 'f64?':
        w.u8(value === undefined ? 0 : 1);
        if (value !== undefined) w.f64(value as number);
        break;
      case 'phase':
        w.u8(PHASES.indexOf(value as RacePhase));
        break;
      case 'item':
        w.u8(itemIds().indexOf(value as ItemId));
        break;
      case 'hit':
        w.u8(hitKinds().indexOf(value as HitKind));
        break;
      case 'str':
        w.str(value as string);
        break;
      case 'u8[]': {
        const list = value as number[];
        w.u8(list.length);
        for (const id of list) w.u8(id);
        break;
      }
    }
  }
}

function readEvent(r: ByteReader): SimEvent {
  const type = EVENT_TYPES[r.u8()];
  if (!type) throw new Error('Unknown event type');
  const event: Record<string, unknown> = { type };
  for (const [name, kind] of EVENT_FIELDS[type]) {
    switch (kind) {
      case 'u8':
        event[name] = r.u8();
        break;
      case 'i8':
        event[name] = r.i8();
        break;
      case 'u16':
        event[name] = r.u16();
        break;
      case 'f64':
        event[name] = r.f64();
        break;
      case 'f64?':
        if (r.u8() === 1) event[name] = r.f64();
        break;
      case 'phase':
        event[name] = PHASES[r.u8()];
        break;
      case 'item':
        event[name] = itemIds()[r.u8()];
        break;
      case 'hit':
        event[name] = hitKinds()[r.u8()];
        break;
      case 'str':
        event[name] = r.str();
        break;
      case 'u8[]':
        event[name] = Array.from({ length: r.u8() }, () => r.u8());
        break;
    }
  }
  return event as unknown as SimEvent;
}
