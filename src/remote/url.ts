import { isRoomCode, randomRoomCode } from '../net/room';
import type { RelayMode } from '../net/iceConfig';
import { REMOTE } from './config';
import type { RemoteNet } from './links';

/**
 * The phone controller page's address (MK-146): `/remote?room=<code>&slot=<n>` (n = 1–4, the
 * player), on the desktop's own origin, so production's QR codes open production and a local
 * server's open it (phones on the LAN: `pnpm dev` is LAN-exposed). Test links carry the desktop's
 * `&net=local` / `&links=` / `&relay=` along so both ends link the same way.
 */
export function remoteUrl(origin: string, code: string, slot: number, net: RemoteNet): string {
  const params = new URLSearchParams({ room: code, slot: String(slot + 1) });
  if (net.local) params.set('net', 'local');
  if (net.links) params.set('links', net.links);
  if (net.relay) params.set('relay', net.relay);
  return `${origin}/remote?${params}`;
}

/** What the phone page's URL asks for; null when the code or slot is missing or wrong. */
export interface RemoteParams {
  code: string;
  /** 0-based. */
  slot: number;
  net: RemoteNet;
  netdebug: boolean;
}

export function parseRemoteParams(search: string): RemoteParams | null {
  const params = new URLSearchParams(search);
  const code = (params.get('room') ?? '').toUpperCase();
  const slot = Number(params.get('slot')) - 1;
  if (!isPairingCode(code) || !Number.isInteger(slot) || slot < 0 || slot >= REMOTE.slots) {
    return null;
  }
  const links = params.get('links');
  const relay = params.get('relay');
  return {
    code,
    slot,
    net: {
      local: params.get('net') === 'local',
      ...(links === 'webrtc' || links === 'blocked' ? { links } : {}),
      ...(relay === 'force' || relay === 'auto' ? { relay: relay as RelayMode } : {}),
    },
    netdebug: ['1', 'true'].includes(params.get('netdebug') ?? ''),
  };
}

/** A pairing code: a room code (4 characters, no look-alikes), or a longer test code. */
export function isPairingCode(text: string): boolean {
  return isRoomCode(text) || /^[A-Z0-9-]{4,24}$/.test(text);
}

/** A fresh pairing code. */
export function newPairingCode(): string {
  return randomRoomCode();
}
