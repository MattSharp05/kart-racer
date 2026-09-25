/**
 * One peer-to-peer link carrying binary race packets (ADR 0006). Implementations: WebRTC data
 * channel (`net/webrtc.ts`), in-memory loopback with lag simulation (`net/netsim.ts`) and
 * BroadcastChannel (same-origin tabs, below). Delivery is unordered and unreliable, like UDP: callers
 * must tolerate lost, late and reordered packets.
 */
export interface Transport {
  /** Sends one packet. Dropped silently when the link isn't open. */
  send(packet: Uint8Array): void;
  /** Registers the packet handler (one per transport; a new one replaces the old). */
  onMessage(handler: (packet: Uint8Array) => void): void;
  /** Registers a handler called whenever `state` changes. */
  onStateChange(handler: (state: TransportState) => void): void;
  readonly state: TransportState;
  /** Closes the link; no more packets are delivered. */
  close(): void;
}

export type TransportState = 'connecting' | 'open' | 'closed';

/** Shared bookkeeping for Transport implementations: handler slots and the state machine. */
export abstract class BaseTransport implements Transport {
  state: TransportState = 'connecting';
  private messageHandler: (packet: Uint8Array) => void = () => undefined;
  private readonly stateHandlers: ((state: TransportState) => void)[] = [];

  abstract send(packet: Uint8Array): void;

  onMessage(handler: (packet: Uint8Array) => void): void {
    this.messageHandler = handler;
  }

  onStateChange(handler: (state: TransportState) => void): void {
    this.stateHandlers.push(handler);
  }

  close(): void {
    this.setState('closed');
  }

  protected deliver(packet: Uint8Array): void {
    if (this.state === 'open') this.messageHandler(packet);
  }

  protected setState(state: TransportState): void {
    if (this.state === state || this.state === 'closed') return;
    this.state = state;
    for (const handler of this.stateHandlers) handler(state);
  }
}

/** What a BroadcastChannelTransport posts: one packet, addressed, since many links share a channel. */
interface BroadcastEnvelope {
  from: string;
  to: string;
  packet: Uint8Array;
}

/**
 * A link between two same-origin tabs (or Playwright contexts) over a BroadcastChannel, for
 * `?net=local` online races without a server (docs/TDD.md → v2 testing). Every link of a room can
 * share one channel name: each end only accepts packets addressed from its peer to itself. There's
 * no handshake, so it's open at once; packets posted before the peer listens are lost, like UDP.
 */
export class BroadcastChannelTransport extends BaseTransport {
  private readonly channel: BroadcastChannel;

  constructor(
    channelName: string,
    readonly localId: string,
    readonly remoteId: string,
  ) {
    super();
    this.channel = new BroadcastChannel(channelName);
    this.channel.onmessage = (event: MessageEvent<BroadcastEnvelope>) => {
      const { from, to, packet } = event.data;
      if (from === remoteId && to === localId) this.deliver(packet);
    };
    this.setState('open');
  }

  send(packet: Uint8Array): void {
    if (this.state !== 'open') return;
    const envelope: BroadcastEnvelope = { from: this.localId, to: this.remoteId, packet };
    this.channel.postMessage(envelope);
  }

  override close(): void {
    this.channel.close();
    super.close();
  }
}
