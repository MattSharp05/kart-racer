import { describe, expect, it } from 'vitest';
import { qrPath } from './qr';
import { parseRemoteParams, remoteUrl } from './url';

describe('remote URL (MK-146)', () => {
  it('points at /remote on the given origin, slot 1-based', () => {
    expect(remoteUrl('https://kart-racer-alpha.vercel.app', 'ABCD', 0, { local: false })).toBe(
      'https://kart-racer-alpha.vercel.app/remote?room=ABCD&slot=1',
    );
    expect(remoteUrl('http://localhost:5173', 'ABCD', 3, { local: true, links: 'webrtc' })).toBe(
      'http://localhost:5173/remote?room=ABCD&slot=4&net=local&links=webrtc',
    );
  });

  it('parses what it writes', () => {
    const url = new URL(remoteUrl('http://x', 'WXYZ', 2, { local: true, relay: 'force' }));
    expect(parseRemoteParams(url.search)).toEqual({
      code: 'WXYZ',
      slot: 2,
      net: { local: true, relay: 'force' },
      netdebug: false,
    });
  });

  it('refuses a missing code or a slot out of range', () => {
    expect(parseRemoteParams('?slot=1')).toBeNull();
    expect(parseRemoteParams('?room=ABCD')).toBeNull();
    expect(parseRemoteParams('?room=ABCD&slot=5')).toBeNull();
    expect(parseRemoteParams('?room=ABCD&slot=0')).toBeNull();
    expect(parseRemoteParams('?room=ab&slot=1')).toBeNull();
  });
});

describe('qrPath', () => {
  it('draws a QR code with its quiet zone and finder patterns', () => {
    const { size, d } = qrPath('https://kart-racer-alpha.vercel.app/remote?room=ABCD&slot=1');
    // Version 4 (33 modules) plus a 2-module border each side.
    expect(size).toBe(37);
    // Top-left finder pattern: its outer ring starts at the border.
    expect(d.startsWith('M2 2h1v1h-1z')).toBe(true);
    expect(d).not.toContain('M0 0');
  });
});
