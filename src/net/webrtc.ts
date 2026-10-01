import { STUN_CONFIG } from './iceConfig';
import { BaseTransport } from './transport';

/** Race packets: unordered and unreliable, like UDP (ticket MK-36 → Technical notes). */
export const DATA_CHANNEL_OPTIONS: RTCDataChannelInit = { ordered: false, maxRetransmits: 0 };

/** How the two browsers ended up connected (from the selected ICE candidate pair). */
export interface ConnectionInfo {
  /** `P2P` = direct (host/srflx/prflx candidates), `relay` = through a TURN server (MK-75). */
  path: 'P2P' | 'relay' | 'unknown';
  localType: string;
  remoteType: string;
  /** ICE's own round-trip time on the selected pair, ms. */
  iceRttMs: number | null;
}

/** A Transport over one WebRTC data channel. */
export class WebRtcTransport extends BaseTransport {
  constructor(
    readonly pc: RTCPeerConnection,
    private readonly channel: RTCDataChannel,
  ) {
    super();
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => this.setState('open');
    channel.onclose = () => this.setState('closed');
    channel.onmessage = (event: MessageEvent<ArrayBuffer>) =>
      this.deliver(new Uint8Array(event.data));
    if (channel.readyState === 'open') this.setState('open');
  }

  send(packet: Uint8Array): void {
    if (this.channel.readyState === 'open') this.channel.send(packet as Uint8Array<ArrayBuffer>);
  }

  override close(): void {
    this.channel.close();
    this.pc.close();
    super.close();
  }

  async connectionInfo(): Promise<ConnectionInfo> {
    const stats = await this.pc.getStats();
    let pair: RTCIceCandidatePairStats | undefined;
    stats.forEach((report: { type: string }) => {
      const candidate = report as RTCIceCandidatePairStats & { selected?: boolean };
      if (report.type === 'transport') {
        const id = (report as { selectedCandidatePairId?: string }).selectedCandidatePairId;
        if (id) pair = stats.get(id) as RTCIceCandidatePairStats;
      } else if (
        !pair &&
        report.type === 'candidate-pair' &&
        (candidate.selected || candidate.nominated) &&
        candidate.state === 'succeeded'
      ) {
        pair = candidate;
      }
    });
    if (!pair) return { path: 'unknown', localType: '?', remoteType: '?', iceRttMs: null };
    const local = stats.get(pair.localCandidateId) as { candidateType?: string } | undefined;
    const remote = stats.get(pair.remoteCandidateId) as { candidateType?: string } | undefined;
    const localType = local?.candidateType ?? '?';
    const remoteType = remote?.candidateType ?? '?';
    const relayed = localType === 'relay' || remoteType === 'relay';
    return {
      path: relayed ? 'relay' : 'P2P',
      localType,
      remoteType,
      iceRttMs: pair.currentRoundTripTime === undefined ? null : pair.currentRoundTripTime * 1000,
    };
  }
}

/** A signaling message between the two peers (relayed by Supabase Realtime Broadcast). */
export type Signal =
  | { kind: 'host-ready' }
  | { kind: 'join' }
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

/** Addressed signaling: `send(to, signal)`; incoming signals arrive with the sender's id. */
export interface SignalingChannel {
  readonly peerId: string;
  send(to: string | null, signal: Signal): void;
  onSignal(handler: (from: string, signal: Signal) => void): void;
  /** Messages sent / received over the signaling service (Supabase quota). */
  readonly counts: { sent: number; received: number };
  close(): void;
}

/** How often a client repeats `join` until the host's offer arrives, ms (a broadcast can be lost). */
export const SIGNAL_RETRY_MS = 1000;
/** Repeats before the client stops asking (the lobby gives up on the race by then, MK-47). */
export const SIGNAL_RETRIES = 20;

/**
 * Whether a peer connection can no longer connect (MK-73): ICE tried every candidate pair and none
 * worked, typically a phone on mobile data behind a NAT that needs a relay (TURN). Checks
 * `iceConnectionState` too: older Safari has no `connectionState`.
 */
export function connectionFailed(pc: RTCPeerConnection): boolean {
  return pc.connectionState === 'failed' || pc.iceConnectionState === 'failed';
}

/** Calls `onFailed` once if `pc` fails to connect (see `connectionFailed`). */
function watchFailure(pc: RTCPeerConnection, onFailed: () => void): void {
  let failed = false;
  const check = () => {
    if (failed || !connectionFailed(pc)) return;
    failed = true;
    onFailed();
  };
  pc.addEventListener('connectionstatechange', check);
  pc.addEventListener('iceconnectionstatechange', check);
}

/**
 * Host: answers every `join` with an offer; resolves a transport per client as it connects.
 * A repeated `join` (the client missed the offer) gets the same offer again. `onFailed` hears of
 * a client whose connection failed. `config`: the race's ICE servers (MK-75, `iceConfig.ts`).
 */
export function hostPeers(
  signaling: SignalingChannel,
  onClient: (transport: WebRtcTransport, peerId: string) => void,
  onFailed: (peerId: string) => void = () => undefined,
  config: RTCConfiguration = STUN_CONFIG,
): void {
  const peers = new Map<string, RTCPeerConnection>();
  const offers = new Map<string, string>();
  signaling.onSignal((from, signal) => {
    if (signal.kind === 'join') {
      const known = peers.get(from);
      if (known) {
        const offer = offers.get(from);
        if (offer && known.connectionState !== 'connected') {
          signaling.send(from, { kind: 'offer', sdp: offer });
        }
        return;
      }
      const pc = new RTCPeerConnection(config);
      peers.set(from, pc);
      const channel = pc.createDataChannel('race', DATA_CHANNEL_OPTIONS);
      const transport = new WebRtcTransport(pc, channel);
      transport.onStateChange((state) => {
        if (state === 'open') onClient(transport, from);
      });
      watchFailure(pc, () => onFailed(from));
      pc.onicecandidate = (event) => {
        if (event.candidate)
          signaling.send(from, { kind: 'ice', candidate: event.candidate.toJSON() });
      };
      void pc
        .createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          const sdp = pc.localDescription?.sdp ?? '';
          offers.set(from, sdp);
          signaling.send(from, { kind: 'offer', sdp });
        });
    } else if (signal.kind === 'answer') {
      const pc = peers.get(from);
      // A repeated offer can bring a second answer: only the first one counts.
      if (pc?.signalingState === 'have-local-offer') {
        void pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      }
    } else if (signal.kind === 'ice') {
      peers
        .get(from)
        ?.addIceCandidate(signal.candidate)
        .catch(() => undefined);
    }
  });
  signaling.send(null, { kind: 'host-ready' });
}

/**
 * Client: announces itself (every `SIGNAL_RETRY_MS` until the host offers), then answers;
 * resolves once the channel opens. `onFailed` hears if the connection fails (MK-73); `cancel`
 * gives up on a connection that isn't needed any more (already aborted: never connects).
 * `config`: the race's ICE servers (MK-75, `iceConfig.ts`).
 */
export function joinHost(
  signaling: SignalingChannel,
  onFailed: () => void = () => undefined,
  cancel?: AbortSignal,
  config: RTCConfiguration = STUN_CONFIG,
): Promise<WebRtcTransport> {
  return new Promise((resolve) => {
    if (cancel?.aborted) return;
    const pc = new RTCPeerConnection(config);
    let hostId: string | null = null;
    const pendingIce: RTCIceCandidateInit[] = [];
    let retries = 0;
    const retry = setInterval(() => {
      retries += 1;
      if (hostId || pc.signalingState === 'closed' || retries > SIGNAL_RETRIES) {
        clearInterval(retry);
      } else signaling.send(null, { kind: 'join' });
    }, SIGNAL_RETRY_MS);
    // Left before connecting (MK-73): stop asking and let the connection go.
    cancel?.addEventListener('abort', () => {
      clearInterval(retry);
      pc.close();
    });
    watchFailure(pc, onFailed);
    pc.onicecandidate = (event) => {
      if (event.candidate && hostId) {
        signaling.send(hostId, { kind: 'ice', candidate: event.candidate.toJSON() });
      }
    };
    pc.ondatachannel = (event) => {
      const transport = new WebRtcTransport(pc, event.channel);
      if (transport.state === 'open') resolve(transport);
      else transport.onStateChange((state) => state === 'open' && resolve(transport));
    };
    signaling.onSignal((from, signal) => {
      if (signal.kind === 'host-ready' && !hostId) signaling.send(null, { kind: 'join' });
      else if (signal.kind === 'offer' && !hostId) {
        hostId = from;
        clearInterval(retry);
        void pc
          .setRemoteDescription({ type: 'offer', sdp: signal.sdp })
          .then(() => Promise.all(pendingIce.map((c) => pc.addIceCandidate(c))))
          .then(() => pc.createAnswer())
          .then((answer) => pc.setLocalDescription(answer))
          .then(() =>
            signaling.send(from, { kind: 'answer', sdp: pc.localDescription?.sdp ?? '' }),
          );
      } else if (signal.kind === 'ice' && (hostId === null || from === hostId)) {
        // Candidates can overtake the offer; hold them until the remote description is set.
        if (hostId && pc.remoteDescription) {
          pc.addIceCandidate(signal.candidate).catch(() => undefined);
        } else pendingIce.push(signal.candidate);
      }
    });
    signaling.send(null, { kind: 'join' });
  });
}
