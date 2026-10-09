import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceSession } from '../../game/session';
import { localRace } from '../../scenarios/local';
import { NEUTRAL_INPUT } from '../../sim/types';
import { phoneSources } from './phone';

// The desktop's pairing, faked: which slots have a phone, what it holds, its pause presses.
const phones = vi.hoisted(() => ({
  connected: new Set<number>(),
  throttle: new Map<number, number>(),
  pauses: new Set<number>(),
}));
vi.mock('../../remote/desktop', () => ({
  remoteSlotConnected: (slot: number) => phones.connected.has(slot),
  remoteInput: (slot: number) => ({ ...NEUTRAL_INPUT, throttle: phones.throttle.get(slot) ?? 0 }),
  takeRemotePause: (slot: number) => phones.pauses.delete(slot),
}));
vi.mock('../playerInput', () => ({
  PlayerInput: class {
    readonly touch = { setActive: () => {} };
    read = () => NEUTRAL_INPUT;
  },
}));

const GO = 4 * 60;

describe('phone sources (MK-147)', () => {
  beforeEach(() => {
    phones.connected.clear();
    phones.throttle.clear();
    phones.pauses.clear();
  });

  it('hands a slot its connected phone, never P1’s (merged into this device’s controls)', () => {
    phones.connected.add(0).add(2);
    expect(phoneSources.claim(0)).toBeNull();
    expect(phoneSources.claim(1)).toBeNull();
    const source = phoneSources.claim(2);
    expect(source?.kind).toBe('phone');
    phones.throttle.set(2, 1);
    expect(source?.read().throttle).toBe(1);
    phones.pauses.add(2);
    expect(source?.takePause?.()).toBe(true);
    expect(source?.takePause?.()).toBe(false);
  });

  it('a phone paired before the race drives its player’s kart', () => {
    phones.connected.add(1);
    phones.throttle.set(1, 1);
    const session = new RaceSession(localRace(1, 2), 2);
    expect(session.slots.source(1)?.kind).toBe('phone');
    session.game.stepTicks(GO + 60);
    expect(session.game.state.karts[1]!.speed).toBeGreaterThan(3);
    expect(session.game.state.karts[0]!.speed).toBeLessThan(0.5);
  });

  it('a phone paired mid-race takes its kart over from the stand-in', () => {
    const session = new RaceSession(localRace(1, 2), 2);
    expect(session.slots.isStandIn(1)).toBe(true);
    phones.connected.add(1);
    session.claimSlot(1);
    expect(session.slots.source(1)?.kind).toBe('phone');
    // The phone holds nothing: its kart no longer drives itself.
    session.game.stepTicks(GO + 60);
    expect(session.game.state.karts[1]!.speed).toBeLessThan(0.5);
    // Claiming again (or P1, or a slot past the players) changes nothing.
    const source = session.slots.source(1);
    session.claimSlot(1);
    session.claimSlot(0);
    session.claimSlot(3);
    expect(session.slots.source(1)).toBe(source);
  });
});
