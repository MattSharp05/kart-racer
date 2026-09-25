import { afterEach, describe, expect, it, vi } from 'vitest';
import { onlineScenarios } from '../scenarios/online';
import { createRace } from '../sim/race/createRace';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from '../sim/types';
import { OnlineRace, type OnlineLaunch } from './online';

const races: OnlineRace[] = [];
afterEach(() => {
  for (const race of races.splice(0)) race.close();
});

function launchOf(name: string, role: OnlineLaunch['role'], room: string): OnlineLaunch {
  const online = onlineScenarios.find((s) => s.name === name)?.setup(1).online;
  if (!online) throw new Error(`${name} isn't an online scenario`);
  return { role, room, race: { ...online.race, laps: 1 } };
}

function open(launch: OnlineLaunch, onLocalKart?: (kartId: number) => void): OnlineRace {
  const race = new OnlineRace(launch, onLocalKart);
  races.push(race);
  return race;
}

/** Steps a race's stepper like `Game` does, with `input` on its own kart. */
function stepper(race: OnlineRace, initial: SimState) {
  let state = initial;
  return (ticks: number, input: Partial<InputFrame> = {}) => {
    for (let i = 0; i < ticks; i += 1) {
      const inputs: InputFrame[] = [];
      if (race.localKartId >= 0) inputs[race.localKartId] = { ...NEUTRAL_INPUT, ...input };
      state = race.stepper(state, inputs).state;
    }
    return state;
  };
}

describe('OnlineRace (MK-46)', () => {
  it('holds the countdown until every player joined, then races with the host in charge', async () => {
    const hostLaunch = launchOf('online-race-2p', 'host', 'online-a');
    const placeholder = createRace(hostLaunch.race);
    const host = open(hostLaunch);
    const stepHost = stepper(host, placeholder);
    expect(stepHost(10).tick).toBe(0);
    expect(host.info()).toMatchObject({ role: 'host', kartId: 0, players: 1, started: false });

    const onLocalKart = vi.fn();
    const client = open(launchOf('online-race-2p', 'client', 'online-a'), onLocalKart);
    expect(client.info()).toMatchObject({ role: 'client', kartId: -1, lastSnapshotTick: -1 });
    await vi.waitFor(() => expect(onLocalKart).toHaveBeenCalledWith(1));
    expect(host.info()).toMatchObject({ players: 2, expectedPlayers: 2, started: true });

    const stepClient = stepper(client, placeholder);
    let clientState = placeholder;
    // Lock-step, letting the BroadcastChannel deliver between rounds.
    for (let round = 0; round < 120; round += 1) {
      stepHost(3, { throttle: 1 });
      await new Promise((resolve) => setTimeout(resolve, 0));
      clientState = stepClient(3, { throttle: 1 });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const net = client.info();
    expect(net.started).toBe(true);
    expect(net.kartId).toBe(1);
    expect(net.lastSnapshotTick).toBeGreaterThan(300);
    expect(host.info().lastSnapshotTick).toBeGreaterThanOrEqual(net.lastSnapshotTick);
    // The client's own kart is local in its copy, and it drove (the host applied its input).
    expect(clientState.karts[1]?.controller).toBe('local');
    expect(clientState.karts[0]?.controller).toBe('remote');
    expect(clientState.tick).toBeGreaterThan(net.lastSnapshotTick);
    expect(clientState.phase).toBe('racing');
    expect(clientState.karts[1]!.speed).toBeGreaterThan(5);
  });

  it('ends the race for the client when the host closes it', async () => {
    const host = open(launchOf('online-race-2p', 'host', 'online-b'));
    const client = open(launchOf('online-race-2p', 'client', 'online-b'));
    await vi.waitFor(() => expect(client.info().kartId).toBe(1));
    host.close();
    expect(host.info().ended).toBe('ended');
    await vi.waitFor(() => expect(client.info().ended).toBe('ended'));
  });

  it('turns a client away from a full room', async () => {
    open(launchOf('online-race-2p', 'host', 'online-c'));
    open(launchOf('online-race-2p', 'client', 'online-c'));
    const third = open(launchOf('online-race-2p', 'client', 'online-c'));
    await vi.waitFor(() => expect(third.info().ended).toBe('full'));
  });
});
