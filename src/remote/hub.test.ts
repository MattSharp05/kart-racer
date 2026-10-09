import { describe, expect, it } from 'vitest';
import { createLoopbackPair, type LoopbackTransport } from '../net/netsim';
import { REMOTE } from './config';
import { RemoteController } from './controller';
import { RemoteHub } from './hub';
import { decodeRemote, encodeRemote, NO_BUTTONS } from './protocol';

const NEUTRAL = { throttle: 0, brake: 0, steer: 0, drift: false, item: false };

/** Synchronous links on a fake clock: a phone controller and the desktop hub. */
function setup() {
  let time = 1000;
  const clock = { now: () => time, advance: (ms: number) => (time += ms) };
  const hub = new RemoteHub('TEST', clock.now);
  const drops: number[] = [];
  hub.onDrop((slot) => drops.push(slot));
  const phone = (slot: number, id = `phone-${slot}`) => {
    const [desktopEnd, phoneEnd] = createLoopbackPair({ schedule: (fn) => fn() });
    hub.accept(desktopEnd, id);
    return { controller: new RemoteController(slot, phoneEnd, clock.now), desktopEnd, phoneEnd };
  };
  /** Runs both sides for `ms`, a phone tick per input period. */
  const run = (ms: number, controllers: RemoteController[]) => {
    for (let t = 0; t < ms; t += 1000 / REMOTE.inputHz) {
      clock.advance(1000 / REMOTE.inputHz);
      for (const c of controllers) c.tick();
      hub.tick();
    }
  };
  return { clock, hub, drops, phone, run };
}

describe('RemoteHub + RemoteController (MK-146)', () => {
  it('pairs a phone into the slot its code named and passes its inputs on', () => {
    const { hub, phone, run } = setup();
    const { controller } = phone(0);
    expect(hub.info()[0]?.state).toBe('waiting');
    controller.tick();
    expect(controller.state).toBe('connected');
    expect(hub.info()[0]?.state).toBe('connected');
    controller.setInput({ throttle: 1, brake: 0, steer: -1, drift: false, item: true });
    run(100, [controller]);
    expect(hub.input(0)).toMatchObject({ throttle: 1, steer: -1, item: true });
    expect(hub.input(1).throttle).toBe(0);
    // About 60 packets a second, numbered.
    expect(hub.info()[0]?.seq).toBeGreaterThanOrEqual(5);
  });

  it('measures the round trip both ways', () => {
    const { hub, phone, run } = setup();
    const { controller } = phone(1);
    run(1200, [controller]);
    expect(hub.info()[1]?.rttMs).toBe(0);
    expect(controller.rttMs).toBe(0);
  });

  it('drops late and repeated input packets', () => {
    const { hub, phone } = setup();
    const { controller, phoneEnd } = phone(0);
    controller.tick();
    const input = (seq: number, throttle: number) =>
      phoneEnd.send(
        encodeRemote({
          type: 'input',
          seq,
          input: { throttle, brake: 0, steer: 0, drift: false, item: false },
          buttons: NO_BUTTONS,
        }),
      );
    input(5, 1);
    input(3, 0.2);
    input(5, 0.4);
    expect(hub.input(0).throttle).toBe(1);
    expect(hub.info()[0]?.stale).toBe(2);
    input(6, 0);
    expect(hub.input(0).throttle).toBe(0);
  });

  it('marks a closed phone disconnected at once, and reconnects on a rescan', () => {
    const { hub, phone, drops, run } = setup();
    const first = phone(0);
    first.controller.setInput({ throttle: 1, brake: 0, steer: 0, drift: false, item: false });
    run(100, [first.controller]);
    first.controller.close();
    expect(hub.info()[0]?.state).toBe('disconnected');
    expect(hub.input(0).throttle).toBe(0);
    expect(drops).toEqual([0]);
    const again = phone(0, 'phone-0-again');
    again.controller.tick();
    expect(hub.info()[0]?.state).toBe('connected');
    expect(again.controller.state).toBe('connected');
  });

  it('drops a phone that goes silent and tells it', () => {
    const { hub, phone, drops, run, clock } = setup();
    const { controller } = phone(2);
    run(100, [controller]);
    clock.advance(REMOTE.dropAfterMs + 1);
    hub.tick();
    expect(hub.info()[2]?.state).toBe('disconnected');
    expect(drops).toEqual([2]);
    expect(controller.state).toBe('lost');
  });

  it('a second phone scanning a taken slot replaces the first quietly', () => {
    const { hub, phone, drops } = setup();
    const first = phone(0, 'a');
    first.controller.tick();
    const second = phone(0, 'b');
    second.controller.tick();
    expect(hub.info()[0]?.state).toBe('connected');
    expect(first.controller.state).toBe('lost');
    expect(second.controller.state).toBe('connected');
    expect(drops).toEqual([]);
  });

  it('ignores a Hello for a slot that does not exist and closes the link', () => {
    const { hub, phone } = setup();
    const { controller, desktopEnd } = phone(REMOTE.slots);
    controller.tick();
    expect(desktopEnd.state).toBe('closed');
    expect(controller.state).toBe('failed');
    expect(hub.info().every((s) => s.state === 'waiting')).toBe(true);
  });

  it('a phone that is never welcomed gives up', () => {
    const [, phoneEnd] = createLoopbackPair({ schedule: () => undefined });
    let time = 0;
    const controller = new RemoteController(0, phoneEnd, () => time);
    const hellos: number[] = [];
    const send = phoneEnd.send.bind(phoneEnd) as LoopbackTransport['send'];
    phoneEnd.send = (bytes) => {
      if (decodeRemote(bytes)?.type === 'hello') hellos.push(time);
      send(bytes);
    };
    for (; time <= REMOTE.connectTimeoutMs + 100; time += 50) controller.tick();
    expect(hellos.length).toBeGreaterThan(10);
    expect(controller.state).toBe('failed');
  });

  it('passes look back on and reports each pause press once (MK-147)', () => {
    const { hub, phone, run } = setup();
    const { controller } = phone(1);
    const pauses: number[] = [];
    hub.onPause((slot) => pauses.push(slot));
    controller.setInput({ ...NEUTRAL, throttle: 1 }, { lookBack: true, pause: false });
    run(100, [controller]);
    expect(hub.info()[1]?.buttons).toEqual({ lookBack: true, pause: false });
    // Pause is held for several packets: one press.
    controller.setInput(NEUTRAL, { lookBack: false, pause: true });
    run(200, [controller]);
    expect(pauses).toEqual([1]);
    controller.setInput(NEUTRAL, NO_BUTTONS);
    run(50, [controller]);
    controller.setInput(NEUTRAL, { lookBack: false, pause: true });
    run(50, [controller]);
    expect(pauses).toEqual([1, 1]);
  });

  it('buzzes only the phone in the slot, and only while connected (MK-147)', () => {
    const { hub, phone } = setup();
    const a = phone(0, 'a');
    const b = phone(1, 'b');
    a.controller.tick();
    b.controller.tick();
    const felt: string[] = [];
    a.controller.onBuzz((kind) => felt.push(`a:${kind}`));
    b.controller.onBuzz((kind) => felt.push(`b:${kind}`));
    hub.buzz(1, 'hit');
    hub.buzz(0, 'turbo');
    hub.buzz(3, 'hit');
    expect(felt).toEqual(['b:hit', 'a:turbo']);
    b.controller.close();
    hub.buzz(1, 'hit');
    expect(felt).toEqual(['b:hit', 'a:turbo']);
  });
});
