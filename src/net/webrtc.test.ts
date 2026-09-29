import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hostPeers,
  joinHost,
  SIGNAL_RETRIES,
  SIGNAL_RETRY_MS,
  type Signal,
  type SignalingChannel,
} from './webrtc';

/** Just enough of RTCPeerConnection for the signaling logic (Node has none). */
class FakePeerConnection extends EventTarget {
  static all: FakePeerConnection[] = [];
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  signalingState: RTCSignalingState = 'stable';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((event: { candidate: null }) => void) | null = null;
  ondatachannel: unknown = null;
  readonly remoteSets: RTCSessionDescriptionInit[] = [];

  constructor() {
    super();
    FakePeerConnection.all.push(this);
  }

  createDataChannel() {
    return { readyState: 'connecting', close: () => undefined, send: () => undefined };
  }
  createOffer() {
    return Promise.resolve({ type: 'offer' as const, sdp: 'offer-sdp' });
  }
  createAnswer() {
    return Promise.resolve({ type: 'answer' as const, sdp: 'answer-sdp' });
  }
  setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
    if (description.type === 'offer') this.signalingState = 'have-local-offer';
    return Promise.resolve();
  }
  setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    this.remoteSets.push(description);
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    return Promise.resolve();
  }
  addIceCandidate() {
    return Promise.resolve();
  }
  close() {
    this.signalingState = 'closed';
  }

  /** ICE tried every pair and none worked. */
  fail() {
    this.iceConnectionState = 'failed';
    this.dispatchEvent(new Event('iceconnectionstatechange'));
    this.connectionState = 'failed';
    this.dispatchEvent(new Event('connectionstatechange'));
  }
}

/** A signaling channel that records what it sends; `deliver` plays a signal from a peer. */
function fakeSignaling(peerId: string) {
  const sent: { to: string | null; signal: Signal }[] = [];
  const handlers: ((from: string, signal: Signal) => void)[] = [];
  const channel: SignalingChannel = {
    peerId,
    counts: { sent: 0, received: 0 },
    send: (to, signal) => sent.push({ to, signal }),
    onSignal: (handler) => handlers.push(handler),
    close: () => undefined,
  };
  const deliver = (from: string, signal: Signal) => handlers.forEach((h) => h(from, signal));
  const kinds = () => sent.map((s) => s.signal.kind);
  return { channel, sent, deliver, kinds };
}

beforeEach(() => {
  FakePeerConnection.all = [];
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WebRTC signaling (MK-73)', () => {
  it("client repeats its join until the host's offer arrives, then stops", async () => {
    const client = fakeSignaling('guest');
    void joinHost(client.channel);
    expect(client.kinds()).toEqual(['join']);
    // Lost broadcasts: it keeps asking.
    vi.advanceTimersByTime(SIGNAL_RETRY_MS * 3);
    expect(client.kinds()).toEqual(['join', 'join', 'join', 'join']);

    client.deliver('host', { kind: 'offer', sdp: 'offer-sdp' });
    await vi.runOnlyPendingTimersAsync();
    vi.advanceTimersByTime(SIGNAL_RETRY_MS * 5);
    expect(client.kinds().filter((k) => k === 'join')).toHaveLength(4);
    expect(client.sent.at(-1)).toEqual({
      to: 'host',
      signal: { kind: 'answer', sdp: 'answer-sdp' },
    });
  });

  it('client stops asking and closes its connection when cancelled', () => {
    const client = fakeSignaling('guest');
    const cancel = new AbortController();
    void joinHost(client.channel, () => undefined, cancel.signal);
    vi.advanceTimersByTime(SIGNAL_RETRY_MS);
    cancel.abort();
    vi.advanceTimersByTime(SIGNAL_RETRY_MS * 5);
    expect(client.kinds()).toEqual(['join', 'join']);
    expect(FakePeerConnection.all[0]!.signalingState).toBe('closed');
  });

  it('client gives up asking after SIGNAL_RETRIES repeats', () => {
    const client = fakeSignaling('guest');
    void joinHost(client.channel);
    vi.advanceTimersByTime(SIGNAL_RETRY_MS * (SIGNAL_RETRIES + 10));
    expect(client.kinds()).toHaveLength(SIGNAL_RETRIES + 1);
  });

  it('host sends its offer again on a repeated join, and takes only the first answer', async () => {
    const host = fakeSignaling('host');
    hostPeers(host.channel, () => undefined);
    host.deliver('guest', { kind: 'join' });
    await vi.runOnlyPendingTimersAsync();
    const offers = () => host.sent.filter((s) => s.signal.kind === 'offer');
    expect(offers()).toHaveLength(1);

    // The guest missed the offer and asks again: same peer connection, same offer.
    host.deliver('guest', { kind: 'join' });
    expect(FakePeerConnection.all).toHaveLength(1);
    expect(offers()).toHaveLength(2);
    expect(offers()[1]).toEqual(offers()[0]);

    host.deliver('guest', { kind: 'answer', sdp: 'a1' });
    host.deliver('guest', { kind: 'answer', sdp: 'a2' });
    expect(FakePeerConnection.all[0]!.remoteSets).toEqual([{ type: 'answer', sdp: 'a1' }]);
  });

  it('both sides hear once when the connection fails', async () => {
    const host = fakeSignaling('host');
    const hostFailed = vi.fn();
    hostPeers(host.channel, () => undefined, hostFailed);
    host.deliver('guest', { kind: 'join' });
    await vi.runOnlyPendingTimersAsync();
    FakePeerConnection.all[0]!.fail();
    expect(hostFailed).toHaveBeenCalledTimes(1);
    expect(hostFailed).toHaveBeenCalledWith('guest');

    const client = fakeSignaling('guest');
    const clientFailed = vi.fn();
    void joinHost(client.channel, clientFailed);
    FakePeerConnection.all[1]!.fail();
    expect(clientFailed).toHaveBeenCalledTimes(1);
  });
});
