import { it } from 'vitest';
import { NET } from '../src/net/config';
import { runLab, type LabClientReport } from '../src/net/netLab';
import { oneWayOf } from '../src/net/netsim';
import { tuning } from '../src/sim/tuning';

/**
 * The netcode tuning sweep (MK-73): `pnpm net:sweep`. Races a 4-player room over loopback for each
 * setting below at `net-good` and `net-bad`, and prints what the clients measured (ADR 0005 →
 * "Tuning (MK-73)" has a run). Minutes of CPU: narrow it down with the environment:
 * - `NETS=bad` · `SEEDS=1,2` · `RACING=1800` (ticks after GO; 0 = the whole lap)
 * - `FRAME=2`: clients at 30 fps (two ticks a frame, as a slow phone runs)
 * - `COMBOS='[["mine",{"smoothingSeconds":0.2,"snapshotEveryTicks":2}]]'`: `tuning.net` fields
 *   and `NET` constants to try.
 */

type Setting = Partial<Record<keyof typeof tuning.net | keyof typeof NET, number | string>>;

const NETS = {
  good: oneWayOf({ lagMs: 80, jitterMs: 10, loss: 0.01 }),
  bad: oneWayOf({ lagMs: 200, jitterMs: 50, loss: 0.08 }),
};

const DEFAULT_COMBOS: [string, Setting][] = [
  ['defaults', {}],
  ['smoothing 0.1 s', { smoothingSeconds: 0.1 }],
  ['smoothing 0.2 s', { smoothingSeconds: 0.2 }],
  ['smoothing 0.25 s', { smoothingSeconds: 0.25 }],
  ['snap at 3 m', { snapDistance: 3 }],
  ['snap at 8 m', { snapDistance: 8 }],
  ['input delay 0', { inputDelayTicks: 0 }],
  ['input delay 2', { inputDelayTicks: 2 }],
  ['input delay 3', { inputDelayTicks: 3 }],
  ['snapshots 30 Hz', { snapshotEveryTicks: 2 }],
  ['snapshots 15 Hz', { snapshotEveryTicks: 4 }],
  ['remote karts interpolated', { remoteKarts: 'interpolate' }],
  ['extra lead ≤ 2', { maxExtraLeadTicks: 2 }],
];

const env = process.env;
const combos: [string, Setting][] = env.COMBOS
  ? (JSON.parse(env.COMBOS) as [string, Setting][])
  : DEFAULT_COMBOS;

/** Applies `setting` (a mix of `tuning.net` and `NET` fields); returns the undo. */
function apply(setting: Setting): () => void {
  const net = NET as unknown as Record<string, unknown>;
  const feel = tuning.net as unknown as Record<string, unknown>;
  const saved = [{ ...net }, { ...feel }] as const;
  for (const [key, value] of Object.entries(setting)) (key in net ? net : feel)[key] = value;
  return () => {
    Object.assign(net, saved[0]);
    Object.assign(feel, saved[1]);
  };
}

const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const fixed = (value: number, digits = 2) => value.toFixed(digits);

const COLUMNS = [
  'net',
  'setting',
  'RTT ms',
  'snapshot loss %',
  'own correction p99/max m',
  'remote correction p99 m',
  'own jump p99/max m',
  'remote jump p99/max m',
  'own vs truth p50/p99 m',
  'remote vs truth p50/p99 m',
  're-sim ticks/snapshot',
  'matched %',
  'snapshot ms avg/max',
  'lead ticks',
  'late inputs',
  'down/up KB/s',
];

function row(net: string, name: string, clients: LabClientReport[]): string {
  const mean = (read: (c: LabClientReport) => number) => avg(clients.map(read));
  const most = (read: (c: LabClientReport) => number) => Math.max(...clients.map(read));
  return [
    net,
    name,
    fixed(
      mean((c) => c.rttMs),
      0,
    ),
    fixed(
      mean((c) => c.snapshotLossPercent),
      1,
    ),
    `${fixed(mean((c) => c.ownCorrection.p99))}/${fixed(most((c) => c.ownCorrection.max))}`,
    fixed(mean((c) => c.remoteCorrection.p99)),
    `${fixed(
      mean((c) => c.ownJump.p99),
      3,
    )}/${fixed(most((c) => c.ownJump.max))}`,
    `${fixed(
      mean((c) => c.remoteJump.p99),
      3,
    )}/${fixed(most((c) => c.remoteJump.max))}`,
    `${fixed(mean((c) => c.ownTruthError.p50))}/${fixed(mean((c) => c.ownTruthError.p99))}`,
    `${fixed(mean((c) => c.remoteTruthError.p50))}/${fixed(mean((c) => c.remoteTruthError.p99))}`,
    fixed(
      mean((c) => c.resimTicksPerSnapshot),
      1,
    ),
    fixed(
      mean((c) => c.matchedPercent),
      0,
    ),
    `${fixed(mean((c) => c.snapshotMsAvg))}/${fixed(
      most((c) => c.snapshotMsMax),
      1,
    )}`,
    fixed(
      mean((c) => c.leadTicks),
      1,
    ),
    fixed(
      mean((c) => c.lateInputs),
      1,
    ),
    `${fixed(
      mean((c) => c.downKBps),
      1,
    )}/${fixed(
      mean((c) => c.upKBps),
      1,
    )}`,
  ].join(' | ');
}

it('net tuning sweep', () => {
  const seeds = (env.SEEDS ?? '1,2').split(',').map(Number);
  const racingTicks = Number(env.RACING ?? 1800);
  const clientFrameTicks = Number(env.FRAME ?? 1);
  const nets = env.NETS?.split(',') ?? Object.keys(NETS);
  const lines = [`| ${COLUMNS.join(' | ')} |`, `|${COLUMNS.map(() => ' --- |').join('')}`];
  for (const [net, conditions] of Object.entries(NETS)) {
    if (!nets.includes(net)) continue;
    for (const [name, setting] of combos) {
      const undo = apply(setting);
      try {
        const clients = seeds.flatMap(
          (seed) => runLab({ clients: 3, conditions, seed, racingTicks, clientFrameTicks }).clients,
        );
        lines.push(`| ${row(net, name, clients)} |`);
        console.log(lines.at(-1));
      } finally {
        undo();
      }
    }
  }
  console.log(`\n${lines.join('\n')}`);
}, 3_600_000);
