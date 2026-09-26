import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { aiItemInput } from '../../../sim/ai/items';
import { hazardPose, updateHazards } from '../../../sim/hazards';
import type { PeriodicHazard } from '../../../sim/hazards/types';
import { giveItem } from '../../../sim/items';
import { applyEffect, getEffect, hasEffect } from '../../../sim/items/effects';
import { hitKart, tryHit } from '../../../sim/items/hit';
import { forwardFromHeading } from '../../../sim/math';
import { createSimState } from '../../../sim/state';
import { step } from '../../../sim/step';
import { trackGeometry } from '../../../sim/track';
import { tuning } from '../../../sim/tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ShellEntity,
  type SimEvent,
  type SimState,
} from '../../../sim/types';
import { sunnyCircuit } from '../../tracks/sunny-circuit/sim';
import { SHELL_AFTER_SECONDS } from './scenarios';
import bubbleShield, { SHIELD_TICKS, projectileIncoming } from './sim';

/** Steps `ticks` ticks with kart 0 on `input` (the AI drives itself), collecting events. */
function run(state: SimState, ticks: number, input: Partial<InputFrame> = {}) {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(state, [{ ...NEUTRAL_INPUT, ...input }]);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

/** Two karts on the flat test pad, kart 0 shielded. */
function shielded() {
  const state = createSimState({
    seed: 1,
    karts: [{ speed: 20 }, { position: { x: 10, y: 0, z: 0 } }],
  });
  applyEffect(state.karts[0]!, 'bubble-shield', SHIELD_TICKS, state, []);
  return state;
}

/** A crusher closed over the origin (the pad kart's spot) at the returned tick. */
function closedCrusher(effect?: 'spin') {
  const crusher: PeriodicHazard = {
    kind: 'periodic',
    centre: { x: 0, y: 0, z: 0 },
    halfWidth: 3,
    halfLength: 3,
    heading: 0,
    period: 2,
    closedFraction: 0.5,
    ...(effect ? { effect } : {}),
  };
  let tick = 0;
  while (hazardPose(crusher, tick).amount < 1) tick += 1;
  return { crusher, tick };
}

describe('Bubble Shield (MK-66)', () => {
  it('using it puts the bubble on for 8 s, then it expires', () => {
    const state = createSimState({ seed: 1, karts: [{ speed: 10 }] });
    giveItem(state.karts[0]!, 'bubble-shield');
    let after = run(state, 1, { item: true }).state;
    expect(after.karts[0]!.item.held).toBeNull();
    expect(getEffect(after.karts[0]!, 'bubble-shield')?.ticksLeft).toBe(SHIELD_TICKS);
    after = run(after, SHIELD_TICKS - 1).state;
    expect(hasEffect(after.karts[0]!, 'bubble-shield')).toBe(true);
    after = run(after, 1).state;
    expect(hasEffect(after.karts[0]!, 'bubble-shield')).toBe(false);
  });

  it('blocks exactly one hit, pops, and the next hit lands', () => {
    let state = shielded();
    const events: SimEvent[] = [];
    expect(tryHit(state.karts[0]!, 1, 'green', events)).toBe('blocked');
    expect(state.karts[0]!.spinTimer).toBe(0);
    expect(events).toContainEqual({
      type: 'itemFx',
      kartId: 0,
      item: 'bubble-shield',
      fx: 'pop',
    });
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
    // Popped: gone on the next tick.
    state = run(state, 1).state;
    expect(hasEffect(state.karts[0]!, 'bubble-shield')).toBe(false);
    // Once the short blocked-hit grace is over (the test pad doesn't count it down), a hit lands.
    expect(state.karts[0]!.invulnerableTimer).toBe(tuning.blockedHitInvulnerableSeconds);
    state.karts[0]!.invulnerableTimer = 0;
    expect(hitKart(state.karts[0]!, 1, 'green', [])).toBe(true);
    expect(state.karts[0]!.spinTimer).toBeGreaterThan(0);
  });

  it.each(['banana', 'red', 'oil-slick', 'lightning', 'star', 'squash', 'hazard'] as const)(
    'blocks a %s hit',
    (kind) => {
      const state = shielded();
      expect(tryHit(state.karts[0]!, 1, kind, [])).toBe('blocked');
      expect(getEffect(state.karts[0]!, 'bubble-shield')?.ticksLeft).toBe(0);
    },
  );

  it('a crusher still squashes a shielded kart, and the bubble stays up', () => {
    const { crusher, tick } = closedCrusher();
    const state = shielded();
    state.tick = tick;
    const events: SimEvent[] = [];
    updateHazards(state, [crusher], events);
    expect(state.karts[0]!.spinTimer).toBeGreaterThan(tuning.spinSeconds);
    expect(events).toContainEqual({ type: 'kartHit', kartId: 0, by: -1, kind: 'hazard' });
    expect(getEffect(state.karts[0]!, 'bubble-shield')?.ticksLeft).toBeGreaterThan(0);
  });

  it('a spinning hazard is blocked', () => {
    const { crusher, tick } = closedCrusher('spin');
    const state = shielded();
    state.tick = tick;
    const events: SimEvent[] = [];
    updateHazards(state, [crusher], events);
    expect(state.karts[0]!.spinTimer).toBe(0);
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
    expect(getEffect(state.karts[0]!, 'bubble-shield')?.ticksLeft).toBe(0);
  });

  it('item-bubble-shield: the red shell pops the bubble and you keep driving', () => {
    const start = scenarios.get('item-bubble-shield')!.setup(1).state;
    const raised = run(start, 1, { throttle: 1, item: true });
    const { state, events } = run(raised.state, (SHELL_AFTER_SECONDS + 3) * 60, { throttle: 1 });
    expect(events.some((e) => e.type === 'itemUsed' && e.kartId === 1 && e.item === 'red')).toBe(
      true,
    );
    expect(events).toContainEqual({ type: 'itemFx', kartId: 0, item: 'bubble-shield', fx: 'pop' });
    expect(events.some((e) => e.type === 'kartHit' && e.kartId === 0)).toBe(false);
    expect(hasEffect(state.karts[0]!, 'bubble-shield')).toBe(false);
    expect(state.entities.some((e) => e.kind === 'shell')).toBe(false);
  }, 30_000);

  it('item-bubble-shield without the bubble: the red shell spins you out', () => {
    const start = scenarios.get('item-bubble-shield')!.setup(1).state;
    const { events } = run(start, (SHELL_AFTER_SECONDS + 3) * 60, { throttle: 1 });
    expect(events.some((e) => e.type === 'kartHit' && e.kartId === 0 && e.by === 1)).toBe(true);
  }, 30_000);

  describe('AI', () => {
    const geometry = trackGeometry(sunnyCircuit);
    const line = sunnyCircuit.aiLine ?? [];
    /** The scenario with the AI (kart 1) holding the shield instead, past its thinking time. */
    function aiHolding(): SimState {
      const state = scenarios.get('item-bubble-shield')!.setup(1).state;
      const ai = state.karts[1]!;
      giveItem(ai, 'bubble-shield');
      ai.ai!.itemDelay = 0;
      state.karts[0]!.item = { ...state.karts[0]!.item, held: null, uses: 0 };
      return state;
    }
    const decide = (state: SimState) =>
      aiItemInput(state.karts[1]!, state.karts[1]!.ai!, state, geometry, line, 1 / 60, () => 0)
        .item ?? false;

    it('holds it in 2nd with nothing incoming', () => {
      expect(decide(aiHolding())).toBe(false);
    });

    it('raises it when leading', () => {
      const state = aiHolding();
      state.positions = [1, 0];
      expect(decide(state)).toBe(true);
    });

    it('raises it when a shell flies at it', () => {
      const state = aiHolding();
      const ai = state.karts[1]!;
      const forward = forwardFromHeading(ai.heading);
      const shell: ShellEntity = {
        id: 99,
        kind: 'shell',
        colour: 'green',
        position: { x: ai.position.x - forward.x * 15, y: 0, z: ai.position.z - forward.z * 15 },
        direction: { x: forward.x, z: forward.z },
        speed: 40,
        bounces: 0,
        life: 5,
        ownerId: 0,
        ownerImmune: 0,
        targetId: -1,
      };
      state.entities.push(shell);
      expect(projectileIncoming(ai, state)).toBe(true);
      expect(decide(state)).toBe(true);
      // Flying away from it: not incoming.
      shell.direction = { x: -forward.x, z: -forward.z };
      expect(projectileIncoming(ai, state)).toBe(false);
    });
  });

  it('is in the roulette for front and mid places only', () => {
    expect(bubbleShield.odds.slice(0, 4).every((w) => w > 0)).toBe(true);
    expect(bubbleShield.odds.slice(-3)).toEqual([0, 0, 0]);
  });
});
