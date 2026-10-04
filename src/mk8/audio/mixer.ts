// MK8 races' running kart sounds (MK-111): each heard kart's engine (its body's idle loop at a
// standstill, else its accelerate loop pitched by speed) and the terrain under its wheels (the
// running loop, or the slip loop while drifting), from the bank. The camera's kart is loud; the
// nearest few others quieter with distance. Loops fade in and out over `FADE_SECONDS`, so a change
// of surface or engine loop crossfades instead of clicking. Without a sample, nothing loops (our
// synth's engine hum keeps playing: `hasEngines`).
import { tuning } from '../../sim/tuning';
import { isDrifting } from '../../sim/drift';
import type { KartState, SimState } from '../../sim/types';
import { engineRate, kartBody, kartTerrain } from './kartSounds';
import type { SoundLoop } from './player';
import { KART_BODIES, type SoundId } from './soundIds';

/** What the mixer needs from MK8's player (`Mk8AudioPlayer`). */
export interface MixerPlayer {
  loop(id: SoundId, volume: number): SoundLoop | undefined;
  has(id: SoundId): boolean;
}

/** A loop fades fully in or out over this long, s (a surface change switches within 0.2 s). */
export const FADE_SECONDS = 0.12;
/** Other karts heard (the nearest), and how far out, m. */
export const OTHER_KARTS = 3;
export const OTHER_RANGE = 40;
/** Loudness of the camera's kart's loops, and of the others' at zero distance. */
export const MIX = {
  engine: 0.55,
  terrain: 0.35,
  slip: 0.45,
  others: 0.35,
} as const;
/** Below this share of top speed the engine idles and the wheels make no running sound. */
export const IDLE_RATIO = 0.06;
/** The longest frame a fade steps over, s (a stalled tab mustn't jump). */
const MAX_STEP = 0.1;

/** Every engine sample: their presence means MK8's engines replace our synth's hum. */
const ENGINE_SAMPLES: readonly SoundId[] = KART_BODIES.flatMap((body) => [
  `kart/${body}/idle` as const,
  `kart/${body}/accel` as const,
]);

interface Channel {
  id: SoundId;
  loop: SoundLoop | undefined;
  /** 0–1: how far faded in. */
  level: number;
  /** Loudness when fully in. */
  gain: number;
  rate: number;
  wanted: boolean;
}

export interface MixerOptions {
  /** Records loop starts and stops (`start <id>` / `stop <id>`) for e2e tests. */
  log?: string[];
}

export class KartSoundMixer {
  private readonly channels = new Map<string, Channel>();
  private lastNow: number | undefined;

  constructor(
    private readonly player: () => MixerPlayer,
    private readonly options: MixerOptions = {},
  ) {}

  /** Whether the pack's engine sounds are here (then they replace our synth's engine hum). */
  hasEngines(): boolean {
    const player = this.player();
    return ENGINE_SAMPLES.some((id) => player.has(id));
  }

  /**
   * Every frame: the loops for `state`, heard from kart `followId`, at time `now` (s). Not `active`
   * (paused, a menu, muted, not an MK8 race): every loop fades out.
   */
  update(state: SimState, followId: number, active: boolean, now: number): void {
    const dt = this.lastNow === undefined ? 0 : Math.min(MAX_STEP, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    for (const channel of this.channels.values()) channel.wanted = false;
    if (active) this.want(state, followId);
    const player = this.player();
    for (const [key, channel] of this.channels) {
      const step = FADE_SECONDS > 0 ? dt / FADE_SECONDS : 1;
      channel.level = channel.wanted
        ? Math.min(1, channel.level + step)
        : Math.max(0, channel.level - step);
      if (!channel.wanted && channel.level === 0) {
        if (channel.loop) {
          channel.loop.stop();
          this.options.log?.push(`stop ${channel.id}`);
        }
        this.channels.delete(key);
        continue;
      }
      if (!channel.loop && player.has(channel.id)) {
        // Audio starts on the first tap or key press: until then, try again each frame.
        channel.loop = player.loop(channel.id, 0);
        if (channel.loop) this.options.log?.push(`start ${channel.id}`);
      }
      channel.loop?.setVolume(channel.level * channel.gain);
      channel.loop?.setRate?.(channel.rate);
    }
  }

  /** The loudness (level × gain) of loop `id` for kart `kartId`; 0 when it isn't playing. */
  volume(kartId: number, id: SoundId): number {
    const channel = this.channels.get(`${kartId}:${id}`);
    return channel ? channel.level * channel.gain : 0;
  }

  /** Stops every loop at once (the race is gone). */
  stop(): void {
    for (const channel of this.channels.values()) {
      if (!channel.loop) continue;
      channel.loop.stop();
      this.options.log?.push(`stop ${channel.id}`);
    }
    this.channels.clear();
    this.lastNow = undefined;
  }

  private want(state: SimState, followId: number): void {
    const me = state.karts[followId];
    if (!me) return;
    this.wantKart(state, me, 1);
    const others = state.karts
      .filter((k) => k.id !== followId)
      .map((kart) => ({ kart, d: distance(kart, me) }))
      .filter((o) => o.d < OTHER_RANGE)
      .sort((a, b) => a.d - b.d)
      .slice(0, OTHER_KARTS);
    for (const { kart, d } of others)
      this.wantKart(state, kart, MIX.others * (1 - d / OTHER_RANGE));
  }

  private wantKart(state: SimState, kart: KartState, loudness: number): void {
    if (kart.respawnTimer > 0) return; // Lakitu has it
    const body = kartBody(kart);
    const top = tuning.topSpeed[state.engineClass];
    const ratio = top > 0 ? Math.abs(kart.speed) / top : 0;
    if (ratio < IDLE_RATIO) {
      this.set(kart.id, `kart/${body}/idle`, MIX.engine * loudness, 1);
    } else {
      const gain = MIX.engine * loudness * (0.6 + 0.4 * Math.min(1, ratio));
      this.set(kart.id, `kart/${body}/accel`, gain, engineRate(kart.speed, top));
    }
    const terrain = kartTerrain(state, kart);
    if (!terrain || ratio < IDLE_RATIO) return;
    if (isDrifting(kart)) this.set(kart.id, `terrain/${terrain}/slip`, MIX.slip * loudness, 1);
    else {
      const gain = MIX.terrain * loudness * Math.min(1, ratio);
      this.set(kart.id, `terrain/${terrain}/run`, gain, 1);
    }
  }

  private set(kartId: number, id: SoundId, gain: number, rate: number): void {
    const key = `${kartId}:${id}`;
    const channel = this.channels.get(key);
    if (channel) {
      channel.wanted = true;
      channel.gain = gain;
      channel.rate = rate;
    } else {
      this.channels.set(key, { id, loop: undefined, level: 0, gain, rate, wanted: true });
    }
  }
}

function distance(a: KartState, b: KartState): number {
  return Math.hypot(
    a.position.x - b.position.x,
    a.position.y - b.position.y,
    a.position.z - b.position.z,
  );
}
