import { BaseTransport } from './transport';

/** Public STUN only; no TURN in v2 (ADR 0006). */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/** Race packets: unordered and unreliable, like UDP (ticket MK-36 → Technical notes). */
export const DATA_CHANNEL_OPTIONS: RTCDataChannelInit = { ordered: false, maxRetransmits: 0 };

/** How the two browsers ended up connected (from the selected ICE candidate pair). */
export interface ConnectionInfo {
  /** `P2P` = direct (host/srflx/prflx candidates), `relay` = through a TURN server. */
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

/** Host: answers every `join` with an offer; resolves a transport per client as it connects. */
export function hostPeers(
  signaling: SignalingChannel,
  onClient: (transport: WebRtcTransport, peerId: string) => void,
): void {
  const peers = new Map<string, RTCPeerConnection>();
  signaling.onSignal((from, signal) => {
    if (signal.kind === 'join') {
      if (peers.has(from)) return;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peers.set(from, pc);
      const channel = pc.createDataChannel('race', DATA_CHANNEL_OPTIONS);
      const transport = new WebRtcTransport(pc, channel);
      transport.onStateChange((state) => {
        if (state === 'open') onClient(transport, from);
      });
      pc.onicecandidate = (event) => {
        if (event.candidate)
          signaling.send(from, { kind: 'ice', candidate: event.candidate.toJSON() });
      };
      void pc
        .createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => signaling.send(from, { kind: 'offer', sdp: pc.localDescription?.sdp ?? '' }));
    } else if (signal.kind === 'answer') {
      void peers.get(from)?.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
    } else if (signal.kind === 'ice') {
      void peers.get(from)?.addIceCandidate(signal.candidate);
    }
  });
  signaling.send(null, { kind: 'host-ready' });
}

/** Client: announces itself until the host offers, then answers; resolves once the channel opens. */
export function joinHost(signaling: SignalingChannel): Promise<WebRtcTransport> {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    let hostId: string | null = null;
    const pendingIce: RTCIceCandidateInit[] = [];
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
        if (hostId && pc.remoteDescription) void pc.addIceCandidate(signal.candidate);
        else pendingIce.push(signal.candidate);
      }
    });
    signaling.send(null, { kind: 'join' });
  });
}
