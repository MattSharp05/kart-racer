import type { Transport } from '../net/transport';
import type { RaceLinks } from '../net/raceLinks';
import { NEUTRAL_INPUT, type InputFrame } from '../sim/types';
import { REMOTE } from './config';
import { decodeRemote, encodeRemote, SequenceFilter, type RemoteMessage } from './protocol';
import { RttMeter } from './rtt';

/**
 * The desktop's side of phone controllers (MK-146): accepts phone links, seats each in the slot
 * its QR code named, keeps the newest input per slot, and notices a phone going (Bye, a closed
 * link, or `REMOTE.dropAfterMs` of silence). A phone that comes back (rescans) takes its slot again;
 * a new phone in a slot replaces the old one.
 */

/** `waiting`: no phone yet · `connected` · `disconnected`: had one, lost it (rescan to rejoin). */
export type SlotState = 'waiting' | 'connected' | 'disconnected';

export interface SlotInfo {
  /** 0-based (the QR code and the panel say Player `slot + 1`). */
  slot: number;
  state: SlotState;
  rttMs: number | null;
  /** The phone's controls (neutral unless connected). */
  input: InputFrame;
  /** The newest input sequence number accepted (-1 before any). */
  seq: number;
  /** Input packets dropped as late or repeated. */
  stale: number;
}

interface Link {
  transport: Transport;
  clientId: string;
  since: number;
  slot: number | null;
}

interface Slot {
  state: SlotState;
  link: Link | null;
  input: InputFrame;
  filter: SequenceFilter;
  heardAt: number;
  stale: number;
  rtt: RttMeter;
}

export class RemoteHub {
  /** The pairing service couldn't be reached (no phone can pair until a reload). */
  unavailable = false;
  private readonly slots: Slot[];
  private readonly pending = new Set<Link>();
  private readonly changeListeners = new Set<() => void>();
  private readonly dropListeners = new Set<(slot: number) => void>();
  private stopAccepting: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly code: string,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.slots = Array.from({ length: REMOTE.slots }, () => ({
      state: 'waiting' as SlotState,
      link: null,
      input: NEUTRAL_INPUT,
      filter: new SequenceFilter(),
      heardAt: 0,
      stale: 0,
      rtt: new RttMeter(),
    }));
  }

  /** Starts taking phones on `links`, checking the slots every `REMOTE.watchEveryMs`. */
  listen(links: RaceLinks): void {
    this.stopAccepting = links.host((transport, clientId) => this.accept(transport, clientId));
    this.timer ??= setInterval(() => this.tick(), REMOTE.watchEveryMs);
  }

  /** The links couldn't be set up (the panel says so). */
  markUnavailable(): void {
    this.unavailable = true;
    this.changed();
  }

  /** A new phone link: it's seated when its Hello says which slot. */
  accept(transport: Transport, clientId: string): boolean {
    const link: Link = { transport, clientId, since: this.now(), slot: null };
    this.pending.add(link);
    transport.onMessage((bytes) => {
      const message = decodeRemote(bytes);
      if (message) this.receive(link, message);
    });
    transport.onStateChange((state) => {
      if (state !== 'closed') return;
      this.pending.delete(link);
      if (link.slot !== null && this.slots[link.slot]?.link === link) this.drop(link.slot);
    });
    return true;
  }

  /** The controls of the phone in `slot` (neutral when none is connected). */
  input(slot: number): InputFrame {
    const entry = this.slots[slot];
    return entry?.state === 'connected' ? entry.input : NEUTRAL_INPUT;
  }

  info(): SlotInfo[] {
    return this.slots.map((s, slot) => ({
      slot,
      state: s.state,
      rttMs: s.state === 'connected' ? s.rtt.rttMs : null,
      input: this.input(slot),
      seq: s.filter.last,
      stale: s.stale,
    }));
  }

  /** Calls `listener` whenever a slot's state or RTT changes; returns the unsubscribe function. */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Calls `listener` with the slot whenever a connected phone drops. */
  onDrop(listener: (slot: number) => void): () => void {
    this.dropListeners.add(listener);
    return () => this.dropListeners.delete(listener);
  }

  /** Pings the phones, and drops the silent ones and links that never said hello. */
  tick(): void {
    const now = this.now();
    for (const link of this.pending) {
      if (now - link.since > REMOTE.helloTimeoutMs) {
        this.pending.delete(link);
        link.transport.close();
      }
    }
    this.slots.forEach((s, slot) => {
      if (s.state !== 'connected' || !s.link) return;
      if (now - s.heardAt > REMOTE.dropAfterMs) return this.drop(slot);
      if (s.rtt.due(now)) this.send(s.link, { type: 'ping', time: now });
    });
  }

  /** Stops taking phones and lets every link go. */
  close(): void {
    this.stopAccepting?.();
    this.stopAccepting = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const link of this.pending) link.transport.close();
    this.pending.clear();
    for (const s of this.slots) {
      if (s.link) this.send(s.link, { type: 'bye' });
      s.link?.transport.close();
      s.link = null;
    }
    this.changeListeners.clear();
    this.dropListeners.clear();
  }

  private receive(link: Link, message: RemoteMessage): void {
    const now = this.now();
    const seated = link.slot === null ? undefined : this.slots[link.slot];
    if (seated?.link === link) seated.heardAt = now;
    if (message.type === 'hello') return this.seat(link, message.slot);
    if (message.type === 'ping') return this.send(link, { type: 'pong', time: message.time });
    // A link that was replaced (the phone rescanned) or never seated has no say.
    if (!seated || seated.link !== link || link.slot === null) return;
    const slot = seated;
    if (message.type === 'input') {
      if (slot.filter.accept(message.seq)) slot.input = message.input;
      else slot.stale += 1;
    } else if (message.type === 'pong') {
      slot.rtt.pong(message.time, now);
    } else if (message.type === 'bye') {
      this.drop(link.slot);
    }
  }

  private seat(link: Link, slotIndex: number): void {
    const slot = this.slots[slotIndex];
    if (!slot) return link.transport.close();
    if (link.slot === null) {
      this.pending.delete(link);
      // The slot's previous phone (a rescan, or another phone taking over) lets go quietly.
      const previous = slot.link;
      if (previous && previous !== link) {
        previous.slot = null;
        this.send(previous, { type: 'bye' });
        previous.transport.close();
      }
      link.slot = slotIndex;
      slot.link = link;
      slot.state = 'connected';
      slot.input = NEUTRAL_INPUT;
      slot.filter = new SequenceFilter();
      slot.rtt = new RttMeter();
      slot.stale = 0;
      slot.heardAt = this.now();
      this.changed();
    }
    // Every Hello is welcomed (a lost Welcome is asked for again).
    if (link.slot === slotIndex) this.send(link, { type: 'welcome', slot: slotIndex });
  }

  private drop(slotIndex: number): void {
    const slot = this.slots[slotIndex];
    if (!slot || slot.state !== 'connected') return;
    const link = slot.link;
    slot.state = 'disconnected';
    slot.link = null;
    slot.input = NEUTRAL_INPUT;
    if (link) {
      link.slot = null;
      this.send(link, { type: 'bye' });
      link.transport.close();
    }
    this.changed();
    for (const listener of [...this.dropListeners]) listener(slotIndex);
  }

  private send(link: Link, message: RemoteMessage): void {
    link.transport.send(encodeRemote(message));
  }

  private changed(): void {
    for (const listener of [...this.changeListeners]) listener();
  }
}
