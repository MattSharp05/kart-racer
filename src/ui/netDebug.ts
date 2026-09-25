import './netDebug.css';

/** What the net debug overlay shows (`OnlineRace.debug()`); client fields only on a client. */
export interface NetDebugInfo {
  role: 'host' | 'client';
  ended: string | null;
  /** The tick this device is at (a client's prediction, or the host's truth). */
  tick?: number;
  // Client
  rttMs?: number;
  /** Snapshots that never arrived, of those the host sent since the first one, %. */
  lossPercent?: number;
  /** Real time since the newest snapshot arrived, ms (-1 before any). */
  snapshotAgeMs?: number;
  /** Ticks the prediction is ahead of the newest snapshot. */
  leadTicks?: number;
  /** Ticks re-simulated per snapshot, on average, and by the last reconcile. */
  resimPerSnapshot?: number;
  lastReplayTicks?: number;
  /** Snapshots that matched the prediction (no re-simulation), %. */
  matchedPercent?: number;
  /** Time to handle a snapshot, ms (average). */
  snapshotMs?: number;
  /** Own kart: how far the last reconcile moved it, the most any did, and the offset still drawn, m. */
  correction?: number;
  correctionMax?: number;
  offset?: number;
  // Host
  peers?: { kartId: number; connected: boolean; lateInputs: number; snapshotBytes: number }[];
}

/** Refreshes this often, s (fast enough to read, slow enough not to flicker). */
const REFRESH_SECONDS = 0.25;

/** `?netdebug=1` (MK-45): RTT, loss, snapshot age, re-simulation and corrections, top left. */
export class NetDebugOverlay {
  private readonly root = document.createElement('pre');
  private time = REFRESH_SECONDS;
  private lastText = '';

  constructor(private readonly read: () => NetDebugInfo | null) {
    this.root.className = 'net-debug';
    this.root.dataset.testid = 'net-debug';
    document.body.append(this.root);
  }

  /** Once per rendered frame. */
  frame(seconds: number): void {
    this.time += seconds;
    if (this.time < REFRESH_SECONDS) return;
    this.time = 0;
    this.update();
  }

  /** Redraws now (also used while paused, where frames don't advance time). */
  update(): void {
    const info = this.read();
    const text = info ? netDebugText(info) : 'net: offline';
    if (text !== this.lastText) {
      this.root.textContent = text;
      this.lastText = text;
    }
  }
}

/** The overlay's text for `info`. */
export function netDebugText(info: NetDebugInfo): string {
  const lines = [
    `net ${info.role}  tick ${info.tick ?? 0}${info.ended ? `  ended: ${info.ended}` : ''}`,
  ];
  if (info.role === 'client') {
    const age = info.snapshotAgeMs ?? -1;
    lines.push(
      `rtt ${fixed(info.rttMs, 0)} ms  loss ${fixed(info.lossPercent, 1)} %`,
      `snapshot age ${age < 0 ? '—' : `${fixed(age, 0)} ms`}  lead ${info.leadTicks ?? 0} ticks`,
      `re-sim ${fixed(info.resimPerSnapshot, 1)} ticks/snap (last ${info.lastReplayTicks ?? 0})  ` +
        `matched ${fixed(info.matchedPercent, 0)} %`,
      `snapshot ${fixed(info.snapshotMs, 2)} ms`,
      `correction ${cm(info.correction)}  max ${cm(info.correctionMax)}  drawn ${cm(info.offset)}`,
    );
  }
  for (const peer of info.peers ?? []) {
    lines.push(
      `kart ${peer.kartId}${peer.connected ? '' : ' (left)'}: late inputs ${peer.lateInputs}  ` +
        `snapshot ${fixed(peer.snapshotBytes, 0)} B`,
    );
  }
  return lines.join('\n');
}

function fixed(value: number | undefined, digits: number): string {
  return (value ?? 0).toFixed(digits);
}

function cm(metres: number | undefined): string {
  return `${((metres ?? 0) * 100).toFixed(1)} cm`;
}
