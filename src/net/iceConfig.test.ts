import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchIceServers,
  PUBLIC_STUN,
  raceIceConfig,
  TURN_ENDPOINT,
  TURN_FETCH_TIMEOUT_MS,
} from './iceConfig';
import { webRtcRaceLinks } from './raceLinks';
import type { SignalingChannel } from './webrtc';

const TURN_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u', credential: 'c' },
];

function answer(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('raceIceConfig (MK-75)', () => {
  it('uses the TURN endpoint’s servers when it answers', async () => {
    const fetchMock = answer(200, { iceServers: TURN_SERVERS });
    const config = await raceIceConfig({ fetchImpl: fetchMock });
    expect(config).toEqual({ iceServers: TURN_SERVERS });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(TURN_ENDPOINT);
  });

  it('falls back to public STUN on an error answer, bad JSON or a network error', async () => {
    const failures = [
      answer(503, { error: 'relay not configured' }),
      answer(200, { iceServers: [] }),
      answer(200, { iceServers: [{ urls: 5 }] }),
      vi.fn<typeof fetch>(async () => new Response('<!doctype html>', { status: 200 })),
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('offline');
      }),
    ];
    for (const fetchMock of failures) {
      expect(await raceIceConfig({ fetchImpl: fetchMock })).toEqual({ iceServers: PUBLIC_STUN });
    }
  });

  it('falls back to public STUN when the endpoint takes too long', async () => {
    vi.useFakeTimers();
    const hanging = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))),
        ),
    );
    const config = raceIceConfig({ fetchImpl: hanging });
    await vi.advanceTimersByTimeAsync(TURN_FETCH_TIMEOUT_MS);
    expect(await config).toEqual({ iceServers: PUBLIC_STUN });
  });

  it('`relay=force` allows only relayed paths, when TURN servers came back', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      await raceIceConfig({ relay: 'force', fetchImpl: answer(200, { iceServers: TURN_SERVERS }) }),
    ).toEqual({ iceServers: TURN_SERVERS, iceTransportPolicy: 'relay' });
    // No relay to force (previews, local): race as usual rather than never connecting.
    expect(await raceIceConfig({ relay: 'force', fetchImpl: answer(503, {}) })).toEqual({
      iceServers: PUBLIC_STUN,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(
      await raceIceConfig({ relay: 'auto', fetchImpl: answer(200, { iceServers: TURN_SERVERS }) }),
    ).not.toHaveProperty('iceTransportPolicy');
    warn.mockRestore();
  });

  it('fetchIceServers returns null rather than throwing', async () => {
    expect(await fetchIceServers(answer(500, {}))).toBeNull();
  });
});

describe('webRtcRaceLinks with a race’s ICE config (MK-75)', () => {
  /** Records each peer connection's config; enough of RTCPeerConnection for the join path. */
  class RecordingPeerConnection extends EventTarget {
    static configs: RTCConfiguration[] = [];
    signalingState = 'stable';
    connectionState = 'new';
    iceConnectionState = 'new';
    constructor(config: RTCConfiguration) {
      super();
      RecordingPeerConnection.configs.push(config);
    }
    createDataChannel() {
      return { readyState: 'connecting', close: () => undefined, send: () => undefined };
    }
    createOffer() {
      return Promise.resolve({ type: 'offer' as const, sdp: 'offer' });
    }
    setLocalDescription() {
      return Promise.resolve();
    }
    close() {
      this.signalingState = 'closed';
    }
  }

  function signaling(): SignalingChannel & { deliver(from: string, kind: 'join'): void } {
    const handlers: ((from: string, signal: { kind: 'join' }) => void)[] = [];
    return {
      peerId: 'me',
      counts: { sent: 0, received: 0 },
      send: () => undefined,
      onSignal: (handler) => handlers.push(handler as (typeof handlers)[number]),
      close: () => undefined,
      deliver: (from, kind) => handlers.forEach((h) => h(from, { kind })),
    };
  }

  it('host and client peer connections use the fetched config, once it resolves', async () => {
    RecordingPeerConnection.configs = [];
    vi.stubGlobal('RTCPeerConnection', RecordingPeerConnection);
    const config: RTCConfiguration = { iceServers: TURN_SERVERS, iceTransportPolicy: 'relay' };
    let release!: (c: RTCConfiguration) => void;
    const pending = new Promise<RTCConfiguration>((resolve) => (release = resolve));

    const hostSignals = signaling();
    const stop = webRtcRaceLinks(hostSignals, undefined, pending).host(() => true);
    const join = webRtcRaceLinks(signaling(), undefined, pending).join(() => undefined);
    // Nothing connects before the config is known.
    expect(RecordingPeerConnection.configs).toHaveLength(0);

    release(config);
    await pending;
    await Promise.resolve();
    hostSignals.deliver('client-1', 'join');
    expect(RecordingPeerConnection.configs).toEqual([config, config]);
    join.transport.close();
    stop();
  });
});
