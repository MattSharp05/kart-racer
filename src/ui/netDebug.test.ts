import { describe, expect, it } from 'vitest';
import { netDebugText } from './netDebug';

describe('net debug overlay path (MK-75)', () => {
  it('shows a client’s link path and each of the host’s peers’', () => {
    expect(netDebugText({ role: 'client', ended: null, path: 'relay' })).toContain('link relay');
    const host = netDebugText({
      role: 'host',
      ended: null,
      peers: [
        { kartId: 1, connected: true, lateInputs: 0, snapshotBytes: 300, path: 'P2P' },
        { kartId: 2, connected: true, lateInputs: 0, snapshotBytes: 300 },
      ],
    });
    expect(host).toContain('kart 1: late inputs 0  snapshot 300 B  link P2P');
    expect(host).not.toContain('kart 2: late inputs 0  snapshot 300 B  link');
  });
});
