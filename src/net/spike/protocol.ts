import { ByteReader, ByteWriter } from './bytes';
import type {
  AiState,
  Entity,
  InputFrame,
  ItemId,
  KartState,
  RacePhase,
  SimState,
} from '../../sim/types';

/**
 * Spike wire format (MK-36): little-endian binary, one message per data-channel packet, first byte
 * = message type. Snapshots are quantized; the client applies them on top of its own predicted
 * state, so fields that never change during a race (AI personality, kart type) aren't sent.
 */
export const PROTOCOL_VERSION = 1;

export const MSG = {
  input: 1,
  snapshot: 2,
  ping: 3,
  pong: 4,
  hello: 5,
} as const;

/** Position x/z resolution: 1/64 m (±512 m range in an int16). */
const POS_XZ = 64;
/** Height resolution: 1/256 m (±128 m). */
const POS_Y = 256;
/** Velocity and speed resolution: 1/256 m/s (±128 m/s). */
const VEL = 256;
/** Heading: full circle in a uint16. */
const HEADING = 0x10000 / (2 * Math.PI);
/** Timers (seconds) are sent in ms. */
const MS = 1000;
/** Lap fractions (-1..1) mapped onto a uint16. */
const LAP_T = 32767;
/** Unit direction components in an int16. */
const UNIT = 32767;
/** Input throttle/brake 0..1 in a uint8; steer -1..1 in an int8. */
const INPUT_UNIT = 255;
const STEER_UNIT = 127;
/** Inputs repeated in every input packet, so one lost packet loses nothing. */
export const INPUT_REDUNDANCY = 6;

const PHASES: readonly RacePhase[] = ['free', 'countdown', 'racing', 'finished'];
const ITEM_ORDER: readonly ItemId[] = ['mushroom', 'banana', 'green', 'red', 'star', 'lightning'];
const TRICKS: readonly KartState['trick'][] = ['none', 'ready', 'done'];

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
const AI_TIMERS: readonly (keyof Pick<
  AiState,
  'stuckTime' | 'recoverTime' | 'itemDelay' | 'itemHeld'
>)[] = ['stuckTime', 'recoverTime', 'itemDelay', 'itemHeld'];

export interface InputMessage {
  type: typeof MSG.input;
  /** Tick of `inputs[0]`; `inputs[i]` is for tick `newestTick - i`. */
  newestTick: number;
  inputs: InputFrame[];
}

export interface SnapshotMessage {
  type: typeof MSG.snapshot;
  tick: number;
  /** Newest input tick the host has received from this client. */
  ackTick: number;
  /** Last input the host applied for each human kart (for the client's replay). */
  humanInputs: { kartId: number; input: InputFrame }[];
  /** Decoded state patch: apply with `applySnapshot`. */
  bytes: Uint8Array;
}

export interface PingMessage {
  type: typeof MSG.ping | typeof MSG.pong;
  time: number;
}

export interface HelloMessage {
  type: typeof MSG.hello;
  version: number;
  seed: number;
  /** The kart the receiving client drives. */
  kartId: number;
}

export type NetMessage = InputMessage | SnapshotMessage | PingMessage | HelloMessage;

export function encodeInputs(newestTick: number, inputs: readonly InputFrame[]): Uint8Array {
  const w = new ByteWriter().u8(MSG.input).u32(newestTick).u8(inputs.length);
  for (const input of inputs) writeInput(w, input);
  return w.bytes();
}

export function encodePing(type: typeof MSG.ping | typeof MSG.pong, time: number): Uint8Array {
  return new ByteWriter().u8(type).f64(time).bytes();
}

export function encodeHello(seed: number, kartId: number): Uint8Array {
  return new ByteWriter().u8(MSG.hello).u8(PROTOCOL_VERSION).u32(seed).u8(kartId).bytes();
}

/** Encodes the host's state after `state.tick`. */
export function encodeSnapshot(
  state: SimState,
  ackTick: number,
  humanInputs: readonly { kartId: number; input: InputFrame }[],
): Uint8Array {
  const w = new ByteWriter().u8(MSG.snapshot).u32(state.tick).u32(ackTick);
  w.u8(humanInputs.length);
  for (const { kartId, input } of humanInputs) writeInput(w.u8(kartId), input);
  w.u8(PHASES.indexOf(state.phase)).u32(state.rngState);
  w.u8(state.karts.length);
  for (const kart of state.karts) writeKart(w, kart);
  for (const id of state.positions) w.u8(id);
  w.u8(state.entities.length);
  for (const entity of state.entities) writeEntity(w, entity);
  return w.bytes();
}

export function decodeMessage(bytes: Uint8Array): NetMessage {
  const r = new ByteReader(bytes);
  const type = r.u8();
  switch (type) {
    case MSG.input: {
      const newestTick = r.u32();
      const count = r.u8();
      return {
        type,
        newestTick,
        inputs: Array.from({ length: count }, () => readInput(r)),
      };
    }
    case MSG.snapshot: {
      const tick = r.u32();
      const ackTick = r.u32();
      const humans = r.u8();
      const humanInputs = Array.from({ length: humans }, () => ({
        kartId: r.u8(),
        input: readInput(r),
      }));
      return { type, tick, ackTick, humanInputs, bytes: bytes.subarray(r.offset) };
    }
    case MSG.ping:
    case MSG.pong:
      return { type, time: r.f64() };
    case MSG.hello:
      return { type, version: r.u8(), seed: r.u32(), kartId: r.u8() };
    default:
      throw new Error(`Unknown message type ${type}`);
  }
}

/**
 * Overwrites `state` (the client's own copy, same race) with a decoded snapshot taken at `tick`.
 * Mutates and returns `state`.
 */
export function applySnapshot(state: SimState, tick: number, bytes: Uint8Array): SimState {
  const r = new ByteReader(bytes);
  state.tick = tick;
  state.phase = PHASES[r.u8()] ?? state.phase;
  state.rngState = r.u32();
  const karts = r.u8();
  for (let i = 0; i < karts; i += 1) {
    const kart = state.karts[i];
    if (!kart) throw new Error(`Snapshot has kart ${i}, local state doesn't`);
    readKart(r, kart);
  }
  state.positions = Array.from({ length: karts }, () => r.u8());
  const entities = r.u8();
  state.entities = Array.from({ length: entities }, () => readEntity(r));
  return state;
}

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

/** Rounds an input through the wire format, so host and client replay exactly the same frame. */
export function quantizeInput(input: InputFrame): InputFrame {
  const w = new ByteWriter();
  writeInput(w, input);
  return readInput(new ByteReader(w.bytes()));
}

function writeKart(w: ByteWriter, k: KartState): void {
  w.i16(k.position.x * POS_XZ)
    .i16(k.position.y * POS_Y)
    .i16(k.position.z * POS_XZ);
  w.i16(k.velocity.x * VEL)
    .i16(k.velocity.y * VEL)
    .i16(k.velocity.z * VEL);
  w.u16(wrapHeading(k.heading) * HEADING).i16(k.speed * VEL);
  const flags =
    (k.grounded ? 1 : 0) |
    (k.driftHeld ? 2 : 0) |
    (TRICKS.indexOf(k.trick) << 2) |
    ((k.drift.direction + 1) << 4) |
    (k.drift.tier << 6);
  const race = k.race;
  const flags2 =
    (race.wrongWay ? 1 : 0) |
    (k.item.buttonHeld ? 2 : 0) |
    (k.ai?.drifting ? 4 : 0) |
    (race.finishTick !== undefined ? 8 : 0) |
    (race.throttleSince !== undefined ? 16 : 0);
  w.u8(flags).u8(flags2);
  let mask = 0;
  TIMERS.forEach((timer, i) => {
    if (timer.get(k) !== 0) mask |= 1 << i;
  });
  w.u16(mask);
  TIMERS.forEach((timer, i) => {
    if (mask & (1 << i)) w.u16(timer.get(k) * MS);
  });
  w.u8(race.lap)
    .u8(race.nextCheckpoint)
    .u16((race.lastT + 1) * LAP_T);
  w.u16((k.lastSafeT + 1) * LAP_T).u32(race.lapStartTick);
  if (race.finishTick !== undefined) w.u32(race.finishTick);
  if (race.throttleSince !== undefined) w.u32(race.throttleSince);
  w.u8(k.item.held === null ? 0 : ITEM_ORDER.indexOf(k.item.held) + 1);
  if (k.ai) {
    let aiMask = 0;
    AI_TIMERS.forEach((key, i) => {
      if (k.ai?.[key] !== undefined && k.ai[key] !== 0) aiMask |= 1 << i;
    });
    w.u8(aiMask);
    AI_TIMERS.forEach((key, i) => {
      if (aiMask & (1 << i)) w.u16((k.ai?.[key] ?? 0) * MS);
    });
  }
}

function readKart(r: ByteReader, k: KartState): void {
  k.position = { x: r.i16() / POS_XZ, y: r.i16() / POS_Y, z: r.i16() / POS_XZ };
  k.velocity = { x: r.i16() / VEL, y: r.i16() / VEL, z: r.i16() / VEL };
  k.heading = unwrapHeading(r.u16() / HEADING);
  k.speed = r.i16() / VEL;
  const flags = r.u8();
  const flags2 = r.u8();
  k.grounded = !!(flags & 1);
  k.driftHeld = !!(flags & 2);
  k.trick = TRICKS[(flags >> 2) & 3] ?? 'none';
  k.drift.direction = (((flags >> 4) & 3) - 1) as -1 | 0 | 1;
  k.drift.tier = ((flags >> 6) & 3) as 0 | 1 | 2 | 3;
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
  if (flags2 & 8) k.race.finishTick = r.u32();
  else delete k.race.finishTick;
  if (flags2 & 16) k.race.throttleSince = r.u32();
  else delete k.race.throttleSince;
  const held = r.u8();
  k.item.held = held === 0 ? null : (ITEM_ORDER[held - 1] ?? null);
  if (k.ai) {
    const ai = k.ai;
    const aiMask = r.u8();
    AI_TIMERS.forEach((key, i) => {
      if (aiMask & (1 << i)) ai[key] = r.u16() / MS;
      else if (key === 'stuckTime' || key === 'recoverTime') ai[key] = 0;
      else delete ai[key];
    });
  }
}

const ENTITY_KIND = { itemBox: 1, banana: 2, green: 3, red: 4 } as const;

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
