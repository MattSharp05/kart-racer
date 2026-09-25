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
import '../ui/screens/online';
import type { NetRole } from './launchParams';

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

/**
 * The online screens (MK-40): Online (create or join) → Join (type a code) → Lobby (code, link,
 * who's here). Owns this device's room. A newer action (Back, another create) cancels an older
 * one still waiting on the network.
 */
export class RoomFlow {
  /** The room this device is in, if any. */
  room: Room | null = null;
  private attempt = 0;

  /**
   * @param player What this device shows the room (nickname, colour, racer).
   * @param onExit Back from the Online screen (to the title).
   */
  constructor(
    private readonly screens: Router,
    private readonly rooms: RoomService,
    private readonly player: () => MemberInfo,
    private readonly onExit: () => void,
  ) {
    window.addEventListener('pagehide', () => this.leave());
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
      this.showOnline(ROOM_ERROR_MESSAGES[reason]);
    });
    this.screens.show('lobby', {
      room,
      link: this.link(room.code),
      onLeave: () => {
        this.leave();
        this.showOnline();
      },
    });
  }

  private readonly exit = (): void => {
    this.leave();
    this.onExit();
  };
}
