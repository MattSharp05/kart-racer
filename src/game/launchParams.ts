import type { LeaderboardMode } from '../records/leaderboardMock';
import { oneWayOf, parseNetConditions, type NetConditions } from '../net/netsim';

/** Online roles (`&role=`): the authoritative host or a predicting client (ADR 0005). */
export type NetRole = 'host' | 'client';

/** How a `?net=local` lobby's races link up (see `LaunchParams.links`). */
export type RaceLinkMode = 'webrtc' | 'blocked';

function isRaceLinkMode(text: string | null): text is RaceLinkMode {
  return text === 'webrtc' || text === 'blocked';
}

/** What the URL asks the game to boot into: `/?scenario=<name>&seed=<n>&paused=1&tune=1&kart=<id>`. */
export interface LaunchParams {
  scenario?: string;
  seed?: number;
  paused: boolean;
  /** Show the live tuning panel. */
  tune: boolean;
  /** Player kart override, e.g. `&kart=boulder`. */
  kart?: string;
  /** Give the player an item straight away, e.g. `&item=mushroom`. */
  item?: string;
  /** Turn off camera shake and FOV kick (MK-27); the OS setting does the same. */
  reducedMotion: boolean;
  /** Show the performance overlay (MK-28). */
  perf: boolean;
  /** Show each AI's target point and rubber-band multiplier (MK-15). */
  aiDebug: boolean;
  /**
   * Online race transport (MK-46): `local` = BroadcastChannel between tabs of one browser, no
   * server (docs/TDD.md → v2 testing). Online scenarios default to it.
   */
  net?: 'local';
  /**
   * `&links=webrtc|blocked` (MK-73, tests and QA) with `?net=local` rooms: the lobby's races run on
   * WebRTC data channels, as on Supabase, instead of BroadcastChannel (`webrtc`), or their
   * signaling goes nowhere, so the race never connects, like a phone that can't reach the host
   * (`blocked`).
   */
  links?: RaceLinkMode;
  /** `&role=host|client` in an online scenario (default host). */
  role?: NetRole;
  /** `&room=<id>`: tabs with the same room race each other. */
  room?: string;
  /**
   * `&netsim=<rtt>,<jitter>,<loss%>` (e.g. `200,50,8`): simulated network on the online link, all
   * three round trip. Stored per direction (`oneWayOf`; the spike's `?spike=net&netsim=` is one way).
   */
  netsim?: NetConditions;
  /** `&laps=<n>`: laps of an online scenario's race (short races for tests). */
  laps?: number;
  /** Show the netcode debug overlay (the overlay is MK-45). */
  netdebug: boolean;
  /** `&quality=low` (MK-71): render at adaptive quality's lowest setting from the start. */
  lowQuality?: boolean;
  /**
   * `&lb=mock|offline` (MK-56): a stand-in leaderboard backend (made-up boards, or a lost
   * connection) instead of Supabase. Tests and QA links; never touches the real board.
   */
  lb?: LeaderboardMode;
}

const TRUE_VALUES = ['1', 'true'];

export function parseLaunchParams(search: string): LaunchParams {
  const params = new URLSearchParams(search);
  const scenario = params.get('scenario') ?? undefined;
  const seedText = params.get('seed');
  const seed = seedText !== null && seedText !== '' ? Number(seedText) : undefined;
  const flag = (name: string) => TRUE_VALUES.includes(params.get(name) ?? '');
  const kart = params.get('kart') ?? undefined;
  const item = params.get('item') ?? undefined;
  const role = params.get('role');
  const room = params.get('room') ?? undefined;
  const netsimText = params.get('netsim');
  const linksText = params.get('links');
  const netsim = netsimText ? parseNetConditions(netsimText) : undefined;
  const laps = Number(params.get('laps') ?? '');
  const lb = params.get('lb');
  return {
    ...(scenario ? { scenario } : {}),
    ...(seed !== undefined && Number.isFinite(seed) ? { seed } : {}),
    ...(kart ? { kart } : {}),
    ...(item ? { item } : {}),
    ...(params.get('net') === 'local' ? { net: 'local' as const } : {}),
    ...(isRaceLinkMode(linksText) ? { links: linksText } : {}),
    ...(role === 'host' || role === 'client' ? { role } : {}),
    ...(room ? { room } : {}),
    ...(netsim ? { netsim: oneWayOf(netsim) } : {}),
    ...(Number.isInteger(laps) && laps > 0 ? { laps } : {}),
    ...(params.get('quality') === 'low' ? { lowQuality: true } : {}),
    ...(lb === 'mock' || lb === 'offline' ? { lb } : {}),
    paused: flag('paused'),
    tune: flag('tune'),
    reducedMotion: flag('reduced-motion'),
    aiDebug: flag('ai-debug'),
    perf: flag('perf'),
    netdebug: flag('netdebug'),
  };
}
