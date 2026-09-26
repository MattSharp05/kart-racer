import type { CreateRaceOptions, RacerSlot } from '../sim/race/createRace';
import type { EngineClass } from '../sim/tuning';
import type { RoomMember } from './roomBackend';

/**
 * Lobby state (MK-47, PRD v2 core step 4): the host picks the track, engine class and items on/off,
 * everyone picks a racer and readies up, and the host starts. It all travels in presence (nothing
 * is stored): each member's `racer` and `ready`, plus the host's `lobby` (settings) and `start`.
 * Pure: the content lists come in as arguments.
 */

export const ENGINE_CLASSES: readonly EngineClass[] = [50, 100, 150];
/** Karts in an online race: the humans, then AI up to this many. */
export const KARTS_PER_RACE = 8;

/** What the host chose: shown live to everyone. */
export interface LobbySettings {
  trackId: string;
  cc: EngineClass;
  itemsOn: boolean;
}

/** One human in a started race, in kart order. */
export interface LobbySlot {
  /** Room member id (the race link's client id). */
  id: string;
  racer: string;
  nickname: string;
  /** CSS colour of the player's name (name tags and results, MK-55); older builds didn't send it. */
  colour?: string;
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
}

export function defaultSettings(content: LobbyContent): LobbySettings {
  return { trackId: content.trackIds[0] ?? '', cc: 100, itemsOn: true };
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
  return {
    trackId: content.trackIds.includes(lobby.trackId) ? lobby.trackId : fallback.trackId,
    cc: ENGINE_CLASSES.includes(lobby.cc) ? lobby.cc : fallback.cc,
    itemsOn: lobby.itemsOn !== false,
  };
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
  const humans = start.slots.slice(0, KARTS_PER_RACE).map((slot): RacerSlot => ({
    kartId: known(slot.racer),
    controller: slot.id === selfId ? 'local' : 'remote',
    name: slot.nickname,
  }));
  const ai = Array.from({ length: KARTS_PER_RACE - humans.length }, (_, i): RacerSlot => ({
    kartId: racerIds[(humans.length + i) % racerIds.length] ?? known(''),
    controller: 'ai',
  }));
  return {
    trackId: settings.trackId,
    racers: [...humans, ...ai],
    engineClass: settings.cc,
    itemsOn: settings.itemsOn,
    seed: start.seed,
  };
}
