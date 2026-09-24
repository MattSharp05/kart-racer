import { readMuted, writeMuted, type KeyValueStore } from '../game/storage';
import { tuning } from '../sim/tuning';
import type { KartState, SimEvent, SimState } from '../sim/types';
import { Music } from './music';
import { cueFor } from './soundMap';
import { Synth } from './synth';

/** Sounds from other karts fade out over this distance, m. */
const HEARING_RANGE = 60;
const AI_ENGINES = 3;
const AI_ENGINE_RANGE = 40;

interface EngineVoice {
  osc: OscillatorNode;
  sub: OscillatorNode;
  gain: GainNode;
}

export interface AudioView {
  /** A menu screen is showing (menu music, no engines). */
  menu: boolean;
  paused: boolean;
  followId: number;
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
  private muted: boolean;
  private lastRouletteTick = -1;
  private suspended = false;

  constructor(
    private readonly store: KeyValueStore,
    /** Called after the M key changes mute, so on-screen buttons can update. */
    private readonly onMuteChange: () => void = () => {},
  ) {
    this.muted = readMuted(store);
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat) {
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

  private unlock(): void {
    if (this.synth || typeof AudioContext === 'undefined') return;
    try {
      this.synth = new Synth();
      this.music = new Music(this.synth);
      this.engines = Array.from({ length: 1 + AI_ENGINES }, () => this.engineVoice());
      this.applyMute();
      void this.synth.ctx.resume();
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

  onEvents(events: SimEvent[], state: SimState, followId: number): void {
    const synth = this.synth;
    if (!synth || this.suspended) return;
    const me = state.karts[followId];
    for (const event of events) {
      const cue = cueFor(event, state.race.laps);
      if (!cue) continue;
      let volume = cue.volume ?? 1;
      if (cue.scope === 'player' && cue.kartId !== followId) continue;
      if (cue.scope === 'near' && cue.kartId !== followId) {
        const from = cue.kartId !== undefined ? state.karts[cue.kartId] : undefined;
        if (!from || !me) continue;
        const d = distance(from, me);
        if (d > HEARING_RANGE) continue;
        volume *= 1 - d / HEARING_RANGE;
      }
      synth.play(cue.id, volume, cue.pitch ?? 0);
    }
  }

  update(state: SimState, view: AudioView): void {
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
    this.music?.play(!racing ? 'menu' : me && me.starTimer > 0 ? 'star' : 'race');

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
    const others = me
      ? state.karts
          .filter((k) => k.id !== view.followId)
          .map((k) => ({ kart: k, d: distance(k, me) }))
          .filter((o) => o.d < AI_ENGINE_RANGE)
          .sort((a, b) => a.d - b.d)
          .slice(0, AI_ENGINES)
      : [];
    for (let i = 0; i < AI_ENGINES; i += 1) {
      const o = others[i];
      voices.push({
        kart: racing ? o?.kart : undefined,
        volume: o ? 0.035 * (1 - o.d / AI_ENGINE_RANGE) : 0,
      });
    }
    voices.forEach(({ kart, volume }, i) => {
      const voice = this.engines[i];
      if (!voice) return;
      const ratio = kart ? Math.min(1.3, Math.abs(kart.speed) / top) : 0;
      const freq = 55 + ratio * 130 + (kart?.boostTimer ? 25 : 0);
      voice.osc.frequency.setTargetAtTime(freq, now, 0.05);
      voice.sub.frequency.setTargetAtTime(freq / 2, now, 0.05);
      voice.gain.gain.setTargetAtTime(kart ? volume * (0.4 + ratio * 0.6) : 0, now, 0.08);
    });
  }
}

function distance(a: KartState, b: KartState): number {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}
