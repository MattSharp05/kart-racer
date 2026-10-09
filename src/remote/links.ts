import { raceIceConfig, type RelayMode } from '../net/iceConfig';
import { localRaceLinks, webRtcRaceLinks, type RaceLinks } from '../net/raceLinks';
import { channelSignaling } from '../net/room';
import type { RoomBackend } from '../net/roomBackend';
import { localRoomBackend } from '../net/roomBackendLocal';
import { supabaseRoomBackend } from '../net/roomBackendSupabase';

/**
 * How a desktop and its phones link up (MK-146, ADR 0013): the same stack as online races. In
 * production, signaling rides a Supabase Realtime channel named after the pairing code and the
 * link is a WebRTC data channel (TURN from `/api/turn`, MK-75). `?net=local` links tabs of one
 * browser over BroadcastChannel, no server (tests, QA); `&links=webrtc` keeps WebRTC with the
 * signaling over BroadcastChannel, as online lobbies do (MK-73).
 */
export interface RemoteNet {
  local: boolean;
  links?: 'webrtc';
  relay?: RelayMode;
}

/** The room name a pairing code uses, kept apart from online rooms' codes. */
export function pairingRoom(code: string): string {
  return `remote-${code}`;
}

/** The pairing's links for `peerId` (the desktop, or one phone page), and how to let them go. */
export interface RemoteLinks {
  links: RaceLinks;
  close(): void;
}

/** Signaling "race" name on the pairing's channel. */
const SIGNALING = 'remote';

export async function remoteLinks(
  code: string,
  peerId: string,
  net: RemoteNet,
  backend: RoomBackend = net.local ? localRoomBackend() : supabaseRoomBackend(),
): Promise<RemoteLinks> {
  const room = pairingRoom(code);
  if (net.local && net.links !== 'webrtc') {
    return { links: localRaceLinks(room, peerId), close: () => undefined };
  }
  const channel = await backend.open(room, peerId);
  const signaling = channelSignaling(channel, SIGNALING, peerId);
  return {
    links: webRtcRaceLinks(signaling, undefined, raceIceConfig({ relay: net.relay ?? 'auto' })),
    close: () => {
      signaling.close();
      channel.close();
    },
  };
}
