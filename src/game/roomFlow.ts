import {
  defaultSettings,
  kartOf,
  lobbySlots,
  raceOptions,
  settingsOf,
  type LobbyContent,
  type LobbySettings,
  type LobbyStart,
} from '../net/lobbyState';
import { localRaceLinks, webRtcRaceLinks } from '../net/raceLinks';
import {
  createRoom,
  joinRoom,
  ROOM_ERROR_MESSAGES,
  RoomJoinError,
  type MemberInfo,
  type Room,
} from '../net/room';
import type { RoomBackend } from '../net/roomBackend';
import type { Router } from '../ui/router';
import '../ui/screens/join';
import '../ui/screens/lobby';
import type { LobbyChoice } from '../ui/screens/lobby';
import '../ui/screens/online';
import type { NetRole } from './launchParams';
import type { OnlineLaunch } from './online';

/** Where rooms live: Supabase, or BroadcastChannel between tabs for `?net=local` (MK-40). */
export interface RoomService {
  backend: RoomBackend;
  /** `?net=local`: links carry `&net=local` so they open the same kind of room. */
  local: boolean;
}

/** A launch straight into a room: `/?room=CODE`, or the `online-lobby` scenario. */
export interface LobbyLaunch {
  /** Host creates a room (with `code` if given), client joins `code`. */
  role: NetRole;
  code?: string;
}

/** What the lobby offers (MK-47), and how the game takes part in it. */
export interface LobbyHooks {
  /** The menu tracks and the racers, from the content registries. */
  tracks: readonly LobbyChoice[];
  racers: readonly LobbyChoice[];
  /** Runs a started race. */
  onRace?: (launch: OnlineLaunch) => void;
  /** The host's start couldn't reach the room: stop the race and come back to the lobby. */
  onStartFailed?: (message: string) => void;
  /** The room ended (host left) while this device may be racing: stop the race. */
  onRoomEnded?: () => void;
  /** The player picked a racer (remembered for next time). */
  onRacer?: (racer: string) => void;
}

/** Shown in the lobby when the host's start didn't reach the room. */
export const START_FAILED_MESSAGE = "Couldn't start the race. Try again.";

/**
 * The online screens (MK-40): Online (create or join) → Join (type a code) → Lobby (code, link,
 * who's here; MK-47: the host's track, cc and items, everyone's racer and Ready, the host's Start).
 * Owns this device's room. A newer action (Back, another create) cancels an older one still
 * waiting on the network. When the host starts, every device in the start hands its race to
 * `onRace` (the host's own at once, a client's when the host's `start` reaches it).
 */
export class RoomFlow {
  /** The room this device is in, if any. */
  room: Room | null = null;
  private attempt = 0;
  /** Starts already handed to `onRace` (so a presence echo never starts a race twice). */
  private readonly started = new Set<string>();

  /**
   * @param player What this device shows the room (nickname, colour, racer).
   * @param onExit Back from the Online screen (to the title).
   * @param lobby The lobby's menus and what to do when a race starts or can't (MK-47).
   */
  constructor(
    private readonly screens: Router,
    private readonly rooms: RoomService,
    private readonly player: () => MemberInfo,
    private readonly onExit: () => void,
    private readonly lobby: LobbyHooks = { tracks: [], racers: [] },
  ) {
    window.addEventListener('pagehide', () => this.leave());
    // Back to a page from the back/forward cache: the room was left on pagehide, so the lobby (or
    // a "Joining…" wait) on screen is stale.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && ['online', 'join', 'lobby'].includes(this.screens.current)) {
        this.showOnline();
      }
    });
  }

  /** Opens a launch's room: create it (host) or join its code (client). */
  launch({ role, code }: LobbyLaunch): void {
    if (role === 'host') void this.create(code);
    else if (code) void this.join(code);
    else this.showOnline();
  }

  readonly showOnline = (message?: string, busy?: string): void => {
    this.screens.show('online', {
      onCreate: () => void this.create(),
      onJoin: () => this.showJoin(),
      onBack: this.exit,
      ...(message ? { message } : {}),
      ...(busy ? { busy } : {}),
    });
  };

  /** The room link friends open to join (`/?room=CODE`). */
  link(code: string): string {
    const params = new URLSearchParams({ room: code });
    if (this.rooms.local) params.set('net', 'local');
    return `${window.location.origin}${window.location.pathname}?${params}`;
  }

  /** Leaves the room (or stops creating or joining one). */
  leave(): void {
    this.attempt += 1;
    this.room?.leave();
    this.room = null;
  }

  private showJoin(initial?: string, busy?: string): void {
    this.screens.show('join', {
      onJoin: (code) => void this.join(code),
      onBack: () => {
        this.leave();
        this.showOnline();
      },
      ...(initial ? { initial } : {}),
      ...(busy ? { busy } : {}),
    });
  }

  private async create(code?: string): Promise<void> {
    const attempt = this.start();
    this.showOnline(undefined, 'Creating room…');
    await this.enter(attempt, () =>
      createRoom(this.rooms.backend, this.player(), code ? { code } : {}),
    );
  }

  private async join(code: string): Promise<void> {
    const attempt = this.start();
    this.showJoin(code, `Joining room ${code}…`);
    await this.enter(attempt, () => joinRoom(this.rooms.backend, code, this.player()));
  }

  private start(): number {
    this.leave();
    return this.attempt;
  }

  /** Opens the lobby once `open` has the room; its errors go back to the Online screen. */
  private async enter(attempt: number, open: () => Promise<Room>): Promise<void> {
    let room: Room;
    try {
      room = await open();
    } catch (error) {
      if (attempt !== this.attempt) return;
      const reason = error instanceof RoomJoinError ? error.reason : 'unavailable';
      this.showOnline(ROOM_ERROR_MESSAGES[reason]);
      return;
    }
    // Cancelled while waiting (Back, or the page is going away).
    if (attempt !== this.attempt) return room.leave();
    if (room.ended) return this.showOnline(ROOM_ERROR_MESSAGES[room.ended]);
    this.room = room;
    room.onEnded((reason) => {
      this.room = null;
      this.lobby.onRoomEnded?.();
      this.showOnline(ROOM_ERROR_MESSAGES[reason]);
    });
    // The host's first settings (best effort: everyone shows the defaults until they arrive).
    if (room.isHost) void room.update({ lobby: defaultSettings(this.content()) });
    room.onChange(() => this.checkStart(room));
    this.showLobby(room);
  }

  /** Back to the room's lobby after a race (with why, if it didn't happen), or Online if it's gone. */
  backToLobby(message?: string): void {
    if (this.room) this.showLobby(this.room, message);
    else this.showOnline(message);
  }

  private showLobby(room: Room, message?: string): void {
    this.screens.show('lobby', {
      room,
      link: this.link(room.code),
      tracks: this.lobby.tracks,
      racers: this.lobby.racers,
      ...(message ? { message } : {}),
      onSettings: (settings: LobbySettings) => void room.update({ lobby: settings }),
      onRacer: (racer) => {
        this.lobby.onRacer?.(racer);
        void room.update({ racer });
      },
      onReady: (ready) => void room.update({ ready }),
      onStart: () => void this.startRace(room),
      onLeave: () => {
        this.leave();
        this.showOnline();
      },
    });
  }

  private content(): LobbyContent {
    return {
      trackIds: this.lobby.tracks.map((t) => t.id),
      racerIds: this.lobby.racers.map((r) => r.id),
    };
  }

  /** Host: starts the race with everyone present now, in the room's order. */
  private async startRace(room: Room): Promise<void> {
    if (!room.isHost || this.room !== room) return;
    const start: LobbyStart = {
      id: Math.random().toString(36).slice(2, 10),
      // A fresh race each start (not the sim: the host's seed goes to everyone in `start`).
      seed: Math.floor(Math.random() * 2 ** 31),
      slots: lobbySlots(room.members),
    };
    this.started.add(start.id);
    // Links open before the others hear of the start, so none of their joins are missed.
    this.race(room, start);
    try {
      await room.update({ start });
    } catch {
      // Nobody heard of the start: don't leave the host alone on the grid.
      if (this.room === room) this.lobby.onStartFailed?.(START_FAILED_MESSAGE);
    }
  }

  /** Client: a new start from the host that seats this device runs its race. */
  private checkStart(room: Room): void {
    const start = room.host?.start;
    if (room.isHost || this.room !== room || !start || this.started.has(start.id)) return;
    this.started.add(start.id);
    // Joined after that start: stay in the lobby.
    if (kartOf(start, room.selfId) < 0) return;
    this.race(room, start);
  }

  private race(room: Room, start: LobbyStart): void {
    const content = this.content();
    const clientKart = (clientId: string) => {
      const kart = kartOf(start, clientId);
      return kart > 0 ? kart : undefined;
    };
    const links = this.rooms.local
      ? localRaceLinks(`lobby-${room.code}-${start.id}`, room.selfId, clientKart)
      : webRtcRaceLinks(room.signaling(start.id), clientKart);
    this.lobby.onRace?.({
      role: room.isHost ? 'host' : 'client',
      room: room.code,
      race: raceOptions(settingsOf(room.members, content), start, room.selfId, content),
      links,
    });
  }

  private readonly exit = (): void => {
    this.leave();
    this.onExit();
  };
}
