import { afterEach, describe, expect, it, vi } from 'vitest';
import { onlineScenarios } from '../scenarios/online';
import { createRace } from '../sim/race/createRace';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from '../sim/types';
import { PendingTransport, type RaceLinks } from '../net/raceLinks';
import type { JoinFailure } from '../net/localRoom';
import type { Transport } from '../net/transport';
import { connectFailedMessage, nameList, OnlineRace, type OnlineLaunch } from './online';

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

/** A link that never connects. */
function idleTransport(): Transport {
  return new PendingTransport(new Promise(() => undefined));
}

/** Race links that never connect by themselves: the test says who joins and whose link fails. */
function fakeLinks(kartOf: Record<string, number>) {
  const calls: {
    accept?: (transport: Transport, clientId: string) => boolean;
    hostFailed?: (clientId: string) => void;
    joinFailed?: (reason: JoinFailure) => void;
  } = {};
  const links: RaceLinks = {
    host: (accept, onFailed) => {
      calls.accept = accept;
      if (onFailed) calls.hostFailed = onFailed;
      return () => undefined;
    },
    join: (onFailed) => {
      calls.joinFailed = onFailed;
      return { transport: idleTransport(), stop: () => undefined };
    },
    kartOf: (clientId) => kartOf[clientId],
  };
  return { links, calls };
}

/** A lobby race of 3 humans (host Hosty first, as the lobby seats it) from `role`'s side. */
function lobbyLaunch(role: OnlineLaunch['role'], links: RaceLinks): OnlineLaunch {
  const base = launchOf('online-race-4p', role, 'unused');
  const names = ['Hosty', 'Sam', 'Alex'];
  const self = role === 'host' ? 0 : 1;
  const racers = base.race.racers.map((r, i) =>
    i < names.length
      ? { ...r, name: names[i], controller: i === self ? ('local' as const) : ('remote' as const) }
      : { ...r, controller: 'ai' as const },
  );
  return { ...base, race: { ...base.race, racers }, links };
}

describe('connecting before the race runs (MK-73)', () => {
  it('lists names the way the lobby says them', () => {
    expect(nameList(['Sam'])).toBe('Sam');
    expect(nameList(['Sam', 'Alex'])).toBe('Sam and Alex');
    expect(nameList(['Sam', 'Alex', 'Jo'])).toBe('Sam, Alex and Jo');
    expect(connectFailedMessage(['Sam'])).toMatch(/^Couldn't connect to Sam\. /);
    expect(connectFailedMessage([])).toMatch(/^Couldn't connect to every player\. /);
  });

  it("host: waits for the players who haven't connected, and names the ones whose link failed", () => {
    const { links, calls } = fakeLinks({ 'id-sam': 1, 'id-alex': 2 });
    const host = open(lobbyLaunch('host', links));
    expect(host.waitingFor()).toEqual(['Sam', 'Alex']);
    expect(host.unreachable()).toEqual([]);

    // Sam connects; Alex's link fails (ICE found no way through).
    expect(calls.accept?.(idleTransport(), 'id-sam')).toBe(true);
    expect(host.waitingFor()).toEqual(['Alex']);
    calls.hostFailed?.('id-alex');
    expect(host.unreachable()).toEqual(['Alex']);
    expect(host.info().started).toBe(false);
  });

  it('client: waits for the host, and knows when the link to it failed', () => {
    const { links, calls } = fakeLinks({});
    const client = open(lobbyLaunch('client', links));
    expect(client.waitingFor()).toEqual(['Hosty']);
    expect(client.unreachable()).toEqual([]);
    calls.joinFailed?.('unreachable');
    expect(client.unreachable()).toEqual(['Hosty']);
    expect(client.info().ended).toBe('unreachable');
  });
});
