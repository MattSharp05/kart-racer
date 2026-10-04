import type { CreateRaceOptions, RacerSlot } from '../sim/race/createRace';
import type { EngineClass } from '../sim/tuning';
import type { Loadout } from '../sim/types';
import type { RoomMember } from './roomBackend';

/**
 * Lobby state (MK-47, PRD v2 core step 4): the host picks the track, engine class and items on/off,
 * everyone picks a racer and readies up, and the host starts. It all travels in presence (nothing
 * is stored): each member's `racer` and `ready`, plus the host's `lobby` (settings) and `start`.
 * Pure: the content lists come in as arguments.
 */

export const ENGINE_CLASSES: readonly EngineClass[] = [50, 100, 150];
/** MK8 rooms (MK-132) add 200cc (MK-96). */
export const MK8_ENGINE_CLASSES: readonly EngineClass[] = [50, 100, 150, 200];

/**
 * A room's content pack (MK-132): `mk8` = MK8 Mode's courses, racers, karts and items. Absent =
 * the original game. Fixed when the room is created; rooms never mix the two.
 */
export type LobbyPack = 'mk8';
/** MK8 Mode's item set id (`src/mk8/content/items/id.ts`; net can't import MK8 code). */
const MK8_ITEM_SET = 'mk8';

/**
 * How a member's copy of the host's course stands (MK-132): loading it, ready (with the course
 * file's hash, which must be the host's), or unable to: no pack on this device, or it's locked.
 */
export interface MemberPack {
  course: string;
  state: 'loading' | 'ready' | 'missing' | 'locked' | 'failed';
  /** Ready: the hash of the course file the race is simulated on. */
  hash?: string;
  /** Loading: 0–1. */
  progress?: number;
}
/** Karts in an online race: the humans, then AI up to this many. */
export const KARTS_PER_RACE = 8;

/** What the host chose: shown live to everyone. */
export interface LobbySettings {
  trackId: string;
  cc: EngineClass;
  itemsOn: boolean;
  /** MK8 rooms (MK-132). */
  pack?: LobbyPack;
}

/** One human in a started race, in kart order. */
export interface LobbySlot {
  /** Room member id (the race link's client id). */
  id: string;
  racer: string;
  nickname: string;
  /** CSS colour of the player's name (name tags and results, MK-55); older builds didn't send it. */
  colour?: string;
  /** MK8 rooms (MK-132): the player's racer and kart parts. */
  loadout?: Loadout;
}

/** The host's Start: every device builds the same race from it and the host's settings. */
export interface LobbyStart {
  /** A new id per start: race links and signals of different starts never mix. */
  id: string;
  seed: number;
  /** Humans in join order (host first): kart `i` is `slots[i]`. */
  slots: LobbySlot[];
}

/** What can be picked: the registered tracks (menu ones) and racers, ids in menu order. */
export interface LobbyContent {
  trackIds: readonly string[];
  racerIds: readonly string[];
  /** MK8 rooms (MK-132): their pack, and the AI's loadouts (kart `i` past the humans takes `i`). */
  pack?: LobbyPack;
  aiLoadouts?: readonly Loadout[];
}

/** MK8 rooms start on MK8's usual 150cc (MK-132). */
const MK8_DEFAULT_CC: EngineClass = 150;

export function defaultSettings(content: LobbyContent): LobbySettings {
  const trackId = content.trackIds[0] ?? '';
  if (content.pack) return { trackId, cc: MK8_DEFAULT_CC, itemsOn: true, pack: content.pack };
  return { trackId, cc: 100, itemsOn: true };
}

/** The engine classes a room offers. */
export function engineClassesOf(pack: LobbyPack | undefined): readonly EngineClass[] {
  return pack ? MK8_ENGINE_CLASSES : ENGINE_CLASSES;
}

/** The pack of the host's room as sent (MK-132), whatever this device has loaded. */
export function roomPack(members: readonly RoomMember[]): LobbyPack | undefined {
  return hostOf(members)?.lobby?.pack === 'mk8' ? 'mk8' : undefined;
}

/** The room's host, if present. */
export function hostOf(members: readonly RoomMember[]): RoomMember | undefined {
  return members.find((m) => m.isHost);
}

/**
 * The host's settings as everyone sees them, checked against what's registered here (a stale or
 * newer device may name a track this build doesn't have): defaults fill anything unknown.
 */
export function settingsOf(members: readonly RoomMember[], content: LobbyContent): LobbySettings {
  const fallback = defaultSettings(content);
  const lobby = hostOf(members)?.lobby;
  if (!lobby) return fallback;
  const pack = roomPack(members);
  return {
    trackId: content.trackIds.includes(lobby.trackId) ? lobby.trackId : fallback.trackId,
    cc: engineClassesOf(pack).includes(lobby.cc) ? lobby.cc : fallback.cc,
    itemsOn: lobby.itemsOn !== false,
    ...(pack ? { pack } : {}),
  };
}

/**
 * MK8 rooms (MK-132): the members whose copy of the host's course isn't ready, or doesn't match the
 * host's (their pack is another version: they must reload). Everyone's ready in other rooms.
 */
export function packWaiting(members: readonly RoomMember[], trackId: string): RoomMember[] {
  if (!roomPack(members)) return [];
  const hash = hostOf(members)?.pack;
  const hostHash = hash?.course === trackId && hash.state === 'ready' ? hash.hash : undefined;
  return members.filter((m) => {
    const pack = m.pack;
    if (pack?.course !== trackId || pack.state !== 'ready') return true;
    return hostHash !== undefined && pack.hash !== hostHash;
  });
}

/** What a member's course status reads in the lobby (MK-132), or '' when there's nothing to say. */
export function packLabel(
  member: RoomMember,
  trackId: string,
  host: RoomMember | undefined,
): string {
  const pack = member.pack;
  if (!pack || pack.course !== trackId) return 'Loading course…';
  switch (pack.state) {
    case 'loading':
      return `Loading course ${Math.round((pack.progress ?? 0) * 100)}%`;
    case 'missing':
      return 'MK8 pack not installed';
    case 'locked':
      return 'Needs the MK8 password';
    case 'failed':
      return "Couldn't load the course";
    case 'ready': {
      const hostHash = host?.pack?.course === trackId ? host.pack.hash : undefined;
      return hostHash !== undefined && pack.hash !== hostHash ? 'Different pack: reload' : '';
    }
  }
}

/** Whether the host can start: everyone but the host (who starts) has tapped Ready. */
export function allReady(members: readonly RoomMember[]): boolean {
  return members.every((m) => m.isHost || m.ready);
}

/**
 * The humans' slots for a start: kart order is the room's order (`members` as `Room.members`
 * sorts them: host first, then join order), so it's the same on every device.
 */
export function lobbySlots(members: readonly RoomMember[]): LobbySlot[] {
  return members.map((m) => ({
    id: m.id,
    racer: m.racer,
    nickname: m.nickname,
    colour: m.colour,
    ...(m.loadout ? { loadout: m.loadout } : {}),
  }));
}

/** The kart a member drives in `start` (-1 if they aren't in it: they joined after the start). */
export function kartOf(start: LobbyStart, memberId: string): number {
  return start.slots.findIndex((slot) => slot.id === memberId);
}

/**
 * The race of `start` as device `selfId` builds it (`createRace` options): the humans on karts
 * 0..n-1 (this device's `local`, the others `remote`), AI filling up to `KARTS_PER_RACE`. AI karts
 * take the racers in menu order, starting after the humans' kart numbers. A racer this build
 * doesn't know becomes the first racer.
 */
export function raceOptions(
  settings: LobbySettings,
  start: LobbyStart,
  selfId: string,
  content: LobbyContent,
): CreateRaceOptions {
  const racerIds = content.racerIds;
  const known = (racer: string) => (racerIds.includes(racer) ? racer : (racerIds[0] ?? racer));
  const mk8 = settings.pack === 'mk8';
  const humans = start.slots.slice(0, KARTS_PER_RACE).map((slot): RacerSlot => {
    // MK8 rooms (MK-132): the kart is the loadout's racer, its physics the loadout's.
    const loadout =
      mk8 && slot.loadout && racerIds.includes(slot.loadout.racer) ? slot.loadout : undefined;
    return {
      kartId: loadout ? loadout.racer : known(slot.racer),
      controller: slot.id === selfId ? 'local' : 'remote',
      name: slot.nickname,
      ...(loadout ? { loadout: { ...loadout } } : {}),
    };
  });
  const aiLoadouts = mk8 ? (content.aiLoadouts ?? []) : [];
  const ai = Array.from({ length: KARTS_PER_RACE - humans.length }, (_, i): RacerSlot => {
    const kart = humans.length + i;
    const loadout = aiLoadouts[kart % (aiLoadouts.length || 1)];
    if (loadout && racerIds.includes(loadout.racer)) {
      return { kartId: loadout.racer, controller: 'ai', loadout: { ...loadout } };
    }
    return { kartId: racerIds[kart % racerIds.length] ?? known(''), controller: 'ai' };
  });
  return {
    trackId: settings.trackId,
    racers: [...humans, ...ai],
    engineClass: settings.cc,
    itemsOn: settings.itemsOn,
    seed: start.seed,
    ...(mk8 ? { itemSet: MK8_ITEM_SET } : {}),
  };
}
