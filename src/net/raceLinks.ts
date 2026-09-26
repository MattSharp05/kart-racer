import { hostLocalRoom, joinLocalRoom, type LocalRoomJoin } from './localRoom';
import { BaseTransport, type Transport } from './transport';
import { hostPeers, joinHost, type SignalingChannel } from './webrtc';

/**
 * How an online race's host and clients get their links (MK-47). `?net=local` races use
 * BroadcastChannel between tabs (`localRoom.ts`, MK-46); a lobby over Supabase uses WebRTC data
 * channels, signaled over the room's channel (ADR 0006).
 */
export interface RaceLinks {
  /**
   * Host: offers each new client's link to `accept` (false = no kart for it). Returns a function
   * that stops accepting.
   */
  host(accept: (transport: Transport, clientId: string) => boolean): () => void;
  /** Client: the link to the host, usable at once (packets flow once it connects). */
  join(onFailed: (reason: string) => void): LocalRoomJoin;
  /** Host: the kart client `clientId` drives (default: the free remote karts in join order). */
  kartOf?(clientId: string): number | undefined;
}

/** A client's own id when the race doesn't name one (tabs of one browser). */
function randomClientId(): string {
  return `c-${Math.random().toString(36).slice(2, 10)}`;
}

/** Races between tabs of one browser over BroadcastChannel room `room` (MK-46). */
export function localRaceLinks(
  room: string,
  clientId: string = randomClientId(),
  kartOf?: (clientId: string) => number | undefined,
): RaceLinks {
  return {
    host: (accept) => hostLocalRoom(room, accept),
    join: (onFailed) => joinLocalRoom(room, clientId, onFailed),
    ...(kartOf ? { kartOf } : {}),
  };
}

/** Races over WebRTC data channels, signaled on `signaling` (the room's channel, per start). */
export function webRtcRaceLinks(
  signaling: SignalingChannel,
  kartOf?: (clientId: string) => number | undefined,
): RaceLinks {
  return {
    host: (accept) => {
      let accepting = true;
      hostPeers(signaling, (transport, peerId) => {
        if (!accepting || !accept(transport, peerId)) transport.close();
      });
      return () => {
        accepting = false;
        signaling.close();
      };
    },
    join: () => ({
      transport: new PendingTransport(joinHost(signaling)),
      stop: () => signaling.close(),
    }),
    ...(kartOf ? { kartOf } : {}),
  };
}

/**
 * A link that exists before its connection does: sends are dropped (like any link that isn't open)
 * until `link` resolves, then everything goes through it.
 */
export class PendingTransport extends BaseTransport {
  private inner: Transport | null = null;

  constructor(link: Promise<Transport>) {
    super();
    void link.then((transport) => {
      if (this.state === 'closed') return transport.close();
      this.inner = transport;
      transport.onMessage((packet) => this.deliver(packet));
      transport.onStateChange((state) => {
        if (state === 'closed') this.close();
      });
      this.setState(transport.state === 'closed' ? 'closed' : 'open');
    });
  }

  send(packet: Uint8Array): void {
    if (this.state === 'open') this.inner?.send(packet);
  }

  override close(): void {
    if (this.state === 'closed') return;
    super.close();
    this.inner?.close();
  }
}
