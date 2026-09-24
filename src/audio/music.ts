import { hz, type Synth } from './synth';

export type Track = 'menu' | 'race' | 'star' | 'none';

interface Style {
  bpm: number;
  /** Octave offset for the lead. */
  lead: number;
  leadType: OscillatorType;
}

const STYLES: Record<Exclude<Track, 'none'>, Style> = {
  menu: { bpm: 104, lead: 0, leadType: 'triangle' },
  race: { bpm: 144, lead: 12, leadType: 'square' },
  star: { bpm: 184, lead: 24, leadType: 'square' },
};

/** I–V–vi–IV in C, one bar each: root notes (MIDI) and arpeggio shapes. */
const BARS = [
  { root: 48, chord: [60, 64, 67, 72] },
  { root: 43, chord: [59, 62, 67, 71] },
  { root: 45, chord: [60, 64, 69, 72] },
  { root: 41, chord: [60, 65, 69, 72] },
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3];

/**
 * A tiny chiptune sequencer (MK-26): bass on the beat, an eighth-note arpeggio on top. Notes are
 * scheduled a little ahead of the audio clock so timing stays tight.
 */
export class Music {
  private track: Track = 'none';
  private step = 0;
  private nextTime = 0;
  private timer: number | undefined;

  constructor(private readonly synth: Synth) {}

  play(track: Track): void {
    if (track === this.track) return;
    this.track = track;
    window.clearInterval(this.timer);
    this.timer = undefined;
    if (track === 'none') return;
    this.step = 0;
    this.nextTime = this.synth.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  private schedule(): void {
    if (this.track === 'none') return;
    const style = STYLES[this.track];
    const eighth = 60 / style.bpm / 2;
    const ctx = this.synth.ctx;
    while (this.nextTime < ctx.currentTime + 0.2) {
      const bar = BARS[Math.floor(this.step / 8) % BARS.length];
      if (!bar) break;
      const i = this.step % 8;
      const at = this.nextTime - ctx.currentTime;
      if (i % 2 === 0) {
        this.synth.tone(hz(bar.root), eighth * 1.6, {
          type: 'triangle',
          volume: 0.5,
          at,
          out: this.synth.music,
        });
      }
      const note = bar.chord[ARP[i] ?? 0] ?? 60;
      this.synth.tone(hz(note + style.lead), eighth * 0.8, {
        type: style.leadType,
        volume: 0.16,
        at,
        out: this.synth.music,
      });
      this.nextTime += eighth;
      this.step += 1;
    }
  }
}
