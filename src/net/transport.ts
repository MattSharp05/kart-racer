/**
 * One peer-to-peer link carrying binary race packets (ADR 0006). Implementations: WebRTC data
 * channel (`net/spike/webrtc.ts` for now), in-memory loopback with lag simulation (`net/netsim.ts`)
 * and BroadcastChannel (same machine). Delivery is unordered and unreliable, like UDP: callers
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
