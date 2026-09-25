import { BroadcastChannelTransport, type Transport } from './transport';

/**
 * `?net=local` rooms (MK-46): a host and clients in tabs of one browser find each other over a
 * BroadcastChannel, no server (docs/TDD.md → v2 testing). A client posts `join` until the host
 * answers `welcome` (or `full`); each link runs on a `BroadcastChannelTransport` sharing one
 * race channel per room. Stands in for the Supabase lobby (MK-47) in tests and QA links.
 */

/** How often a client repeats `join` until the host answers, ms (the host tab may open later). */
export const JOIN_RETRY_MS = 250;

/** The host's id on the race channel. */
const HOST_ID = 'host';

type ControlMessage =
  { type: 'join'; from: string } | { type: 'welcome'; to: string } | { type: 'full'; to: string };

function channelNames(room: string) {
  return { control: `kart-racer/${room}/control`, race: `kart-racer/${room}/race` };
}

/**
 * Hosts room `room`: every new client's link is offered to `accept`, which returns false when the
 * room is full. Returns a function that closes the room (not the links already handed out).
 */
export function hostLocalRoom(
  room: string,
  accept: (transport: Transport, clientId: string) => boolean,
): () => void {
  const names = channelNames(room);
  const control = new BroadcastChannel(names.control);
  const joined = new Set<string>();
  control.onmessage = (event: MessageEvent<ControlMessage>) => {
    const msg = event.data;
    if (msg.type !== 'join') return;
    // A repeated join (the client missed our welcome) just gets the welcome again.
    if (!joined.has(msg.from)) {
      const transport = new BroadcastChannelTransport(names.race, HOST_ID, msg.from);
      if (!accept(transport, msg.from)) {
        transport.close();
        control.postMessage({ type: 'full', to: msg.from } satisfies ControlMessage);
        return;
      }
      joined.add(msg.from);
    }
    control.postMessage({ type: 'welcome', to: msg.from } satisfies ControlMessage);
  };
  return () => control.close();
}

/** Why joining ended without a race. */
export type JoinFailure = 'full';

/** A client's side of a local room: its link to the host, usable at once. */
export interface LocalRoomJoin {
  /** The link to the host. Listening already, so the host's first Start isn't lost. */
  readonly transport: Transport;
  /** Stops asking to join (the link stays open). */
  stop(): void;
}

/**
 * Joins room `room` as `clientId`: posts `join` every `JOIN_RETRY_MS` until the host answers.
 * `full` closes the link and calls `onFailed`.
 */
export function joinLocalRoom(
  room: string,
  clientId: string,
  onFailed: (reason: JoinFailure) => void = () => undefined,
): LocalRoomJoin {
  const names = channelNames(room);
  const control = new BroadcastChannel(names.control);
  const transport = new BroadcastChannelTransport(names.race, clientId, HOST_ID);
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    clearInterval(timer);
    control.close();
  };
  control.onmessage = (event: MessageEvent<ControlMessage>) => {
    const msg = event.data;
    if (done || msg.type === 'join' || msg.to !== clientId) return;
    stop();
    if (msg.type === 'full') {
      transport.close();
      onFailed('full');
    }
  };
  const join = () => control.postMessage({ type: 'join', from: clientId } satisfies ControlMessage);
  const timer = setInterval(join, JOIN_RETRY_MS);
  join();
  return { transport, stop };
}
