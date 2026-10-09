import { readMuted, writeMuted, type KeyValueStore } from '../game/storage';
import { isTextEntry } from '../input/keyboard';
import { tuning } from '../sim/tuning';
import type { KartState, SimEvent, SimState } from '../sim/types';
import { Music } from './music';
import { rumbleLevel } from './rumble';
import { soundSkin } from './skin';
import { cueFor, type SoundCue } from './soundMap';
import { Synth } from './synth';

/** Sounds from other karts fade out over this distance, m. */
const HEARING_RANGE = 60;
const AI_ENGINES = 3;
const AI_ENGINE_RANGE = 40;
/**
 * Split-screen (MK-145): the other local players' own sounds (item, boost, hit…) play this much
 * quieter than P1's, who is the listener; their engines take the nearby-engine voices first.
 */
export const OTHER_PLAYER_VOLUME = 0.6;
const OTHER_PLAYER_ENGINE_VOLUME = 0.05;
/** Loudness of the rumble right next to a rolling snowball (MK-59). */
const RUMBLE_VOLUME = 0.5;

interface EngineVoice {
  osc: OscillatorNode;
  sub: OscillatorNode;
  gain: GainNode;
}

/**
 * Events iOS Safari accepts as a user gesture for starting audio. A touch going *down* is not one,
 * which is why sound never started on iPhone when we listened for `pointerdown` (MK-26 QA round 2).
 */
export const AUDIO_GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;

/** Calls `onGesture` for every audio gesture, in the capture phase so no handler can swallow it. */
export function listenForAudioGestures(target: EventTarget, onGesture: () => void): void {
  for (const type of AUDIO_GESTURES) {
    target.addEventListener(type, onGesture, { capture: true, passive: true });
  }
}

export interface AudioView {
  /** A menu screen is showing (menu music, no engines). */
  menu: boolean;
  paused: boolean;
  followId: number;
  /** The local players' karts by slot (MK-145), the listener's (`followId`) among them. */
  players?: readonly number[];
}

/**
 * Game audio (MK-26): sim events → sound effects, engine hum from speed, music per screen (a faster
 * loop during star power), mute (M key / menu button, remembered). Audio only starts after the
 * first tap or key press (browsers, iOS in particular, require a user gesture).
 */
export class SoundManager {
  private synth: Synth | undefined;
  private music: Music | undefined;
  private engines: EngineVoice[] = [];
  /** Low rumble of rolling hazards nearby (MK-59: snowballs); silent otherwise. */
  private rumble: GainNode | undefined;
  private muted: boolean;
  private lastRouletteTick = -1;
  private suspended = false;

  constructor(
    private readonly store: KeyValueStore,
    /** Called after the M key changes mute, so on-screen buttons can update. */
    private readonly onMuteChange: () => void = () => {},
  ) {
    this.muted = readMuted(store);
    listenForAudioGestures(window, () => this.onGesture());
    window.addEventListener('keydown', (e) => {
      // Typing an "m" into the nickname field (MK-42) isn't the mute key.
      if (e.code === 'KeyM' && !e.repeat && !isTextEntry(e.target)) {
        this.toggleMute();
        this.onMuteChange();
      }
    });
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Whether audio has started (after the first user gesture). */
  get unlocked(): boolean {
    return this.synth !== undefined;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    writeMuted(this.store, this.muted);
    this.applyMute();
  }

  /** Every qualifying gesture: start audio, or resume it if iOS left or put it back to sleep. */
  private onGesture(): void {
    this.unlock();
    const ctx = this.synth?.ctx;
    if (ctx && ctx.state !== 'running' && !this.suspended) void ctx.resume();
  }

  private unlock(): void {
    if (this.synth || typeof AudioContext === 'undefined') return;
    try {
      // iPhone: play through the ring/silent switch like a game, not like a ringtone.
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
      this.synth = new Synth();
      this.music = new Music(this.synth);
      this.engines = Array.from({ length: 1 + AI_ENGINES }, () => this.engineVoice());
      this.rumble = this.rumbleVoice();
      this.applyMute();
      // iOS only starts a context that plays something inside the gesture: a one-sample silence.
      const ctx = this.synth.ctx;
      const blip = ctx.createBufferSource();
      blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      blip.connect(ctx.destination);
      blip.start();
      void ctx.resume();
    } catch {
      this.synth = undefined; // no audio on this device; the game still runs
    }
  }

  private applyMute(): void {
    if (this.synth) this.synth.master.gain.value = this.muted ? 0 : 1;
  }

  private engineVoice(): EngineVoice {
    const synth = this.synth as Synth;
    const ctx = synth.ctx;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    osc.type = 'sawtooth';
    sub.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(synth.sfx);
    osc.start();
    sub.start();
    return { osc, sub, gain };
  }

  /** Looped noise through a low-pass filter: a deep rumble, at zero volume until something rolls. */
  private rumbleVoice(): GainNode {
    const synth = this.synth as Synth;
    const ctx = synth.ctx;
    const source = ctx.createBufferSource();
    source.buffer = synth.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 110;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(synth.sfx);
    source.start();
    return gain;
  }

  /**
   * `players`: the local players' karts (MK-145). The listener is `followId`'s; the other players'
   * own sounds still play, quieter, and sounds near any of them are heard.
   */
  onEvents(
    events: SimEvent[],
    state: SimState,
    followId: number,
    players: readonly number[] = [],
  ): void {
    if (this.suspended) return;
    const synth = this.synth;
    // A race's own sounds (MK-129: MK8's items) come first; they start on their own gesture.
    // Muted, everything goes to the (silent) synth.
    const skin = soundSkin();
    const skinned = !this.muted && skin?.owns(state) ? skin : undefined;
    for (const event of events) {
      if (skinned?.play(event, state, followId)) continue;
      if (!synth) continue;
      const cue = cueFor(event, state.race.laps);
      if (!cue) continue;
      const volume = cueVolume(cue, state, followId, players);
      if (volume === null) continue;
      synth.play(cue.id, volume, cue.pitch ?? 0);
    }
  }

  update(state: SimState, view: AudioView): void {
    // The skin's own loops (MK-111: MK8's engines and terrain) follow the race, pause and mute;
    // its player starts on its own gesture, so it's updated before ours has started too.
    const skin = soundSkin();
    const skinned = !this.muted && skin?.owns(state) === true;
    skin?.update?.(state, view, skinned && !view.paused && !view.menu);
    const synth = this.synth;
    if (!synth) return;
    // Paused: freeze all audio.
    if (view.paused !== this.suspended) {
      this.suspended = view.paused;
      void (view.paused ? synth.ctx.suspend() : synth.ctx.resume());
    }
    if (view.paused) return;

    const me = state.karts[view.followId];
    const racing = !view.menu;
    // The skin's own star music (MK-129) replaces our star loop: the race music rests meanwhile.
    const star = !!me && me.starTimer > 0;
    const skinStar = star && skinned && skin.starMusic();
    const skinEngines = skinned && skin.engines?.() === true;
    this.music?.play(!racing ? 'menu' : skinStar ? 'none' : star ? 'star' : 'race');

    // Roulette ticking while your item slot spins.
    if (racing && me && me.item.roulette > 0 && state.tick !== this.lastRouletteTick) {
      if (state.tick % 6 === 0) synth.tone(1800 + (state.tick % 12) * 60, 0.03, { volume: 0.06 });
      this.lastRouletteTick = state.tick;
    }

    // Engines: yours, plus the 3 nearest other karts (quieter, fading with distance).
    const now = synth.ctx.currentTime;
    const top = tuning.topSpeed[state.engineClass];
    const voices: { kart: KartState | undefined; volume: number }[] = [];
    voices.push({ kart: racing ? me : undefined, volume: 0.09 });
    const nearby = nearbyEngines(state, view.followId, view.players ?? []);
    for (let i = 0; i < AI_ENGINES; i += 1) {
      const o = nearby[i];
      voices.push({ kart: racing ? o?.kart : undefined, volume: o?.volume ?? 0 });
    }
    const rumble = racing ? rumbleLevel(state, view.followId) : 0;
    this.rumble?.gain.setTargetAtTime(rumble * RUMBLE_VOLUME, now, 0.1);
    voices.forEach(({ kart, volume }, i) => {
      const voice = this.engines[i];
      if (!voice) return;
      const ratio = kart ? Math.min(1.3, Math.abs(kart.speed) / top) : 0;
      const freq = 55 + ratio * 130 + (kart?.boostTimer ? 25 : 0);
      voice.osc.frequency.setTargetAtTime(freq, now, 0.05);
      voice.sub.frequency.setTargetAtTime(freq / 2, now, 0.05);
      const on = kart && !skinEngines;
      voice.gain.gain.setTargetAtTime(on ? volume * (0.4 + ratio * 0.6) : 0, now, 0.08);
    });
  }
}

/**
 * How loud `cue` plays for the listener (kart `followId`), or null if they don't hear it. A
 * player's own sounds: only theirs, plus (split-screen, MK-145) the other local `players`', quieter.
 * Sounds near a kart fade with its distance from the nearest local player.
 */
export function cueVolume(
  cue: SoundCue,
  state: SimState,
  followId: number,
  players: readonly number[] = [],
): number | null {
  let volume = cue.volume ?? 1;
  if (cue.kartId === followId) return volume;
  if (cue.scope === 'player') {
    return cue.kartId !== undefined && players.includes(cue.kartId)
      ? volume * OTHER_PLAYER_VOLUME
      : null;
  }
  if (cue.scope === 'near') {
    const from = cue.kartId !== undefined ? state.karts[cue.kartId] : undefined;
    const me = state.karts[followId];
    if (!from || !me) return null;
    const others = players.flatMap((id) => {
      const kart = state.karts[id];
      return kart ? [distance(from, kart)] : [];
    });
    const d = Math.min(distance(from, me), ...others);
    if (d > HEARING_RANGE) return null;
    volume *= 1 - d / HEARING_RANGE;
  }
  return volume;
}

/**
 * The engines heard besides the listener's (kart `followId`), loudest first, at most `AI_ENGINES`:
 * the other local players' (split-screen, MK-145) wherever they are, then the nearest other karts,
 * quieter with distance.
 */
export function nearbyEngines(
  state: SimState,
  followId: number,
  players: readonly number[] = [],
): { kart: KartState; volume: number }[] {
  const me = state.karts[followId];
  if (!me) return [];
  const others = state.karts.filter((k) => k.id !== followId);
  const local = others
    .filter((k) => players.includes(k.id))
    .map((kart) => ({ kart, volume: OTHER_PLAYER_ENGINE_VOLUME }));
  const near = others
    .filter((k) => !players.includes(k.id))
    .map((kart) => ({ kart, d: distance(kart, me) }))
    .filter((o) => o.d < AI_ENGINE_RANGE)
    .sort((a, b) => a.d - b.d)
    .map((o) => ({ kart: o.kart, volume: 0.035 * (1 - o.d / AI_ENGINE_RANGE) }));
  return [...local, ...near].slice(0, AI_ENGINES);
}

function distance(a: KartState, b: KartState): number {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}
