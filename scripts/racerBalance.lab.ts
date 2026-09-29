import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { KART_IDS } from '../src/sim/data/karts';
import {
  BALANCE_KARTS,
  balanceRace,
  balanceRacePlan,
  finishOrder,
  formatSummary,
  tallyRaces,
  type RacerSummary,
} from '../src/sim/race/racerBalance';
import { tuning } from '../src/sim/tuning';

/**
 * The racer balance pass (MK-88): `pnpm racer-balance`. 100 seeded 8-AI races over every race
 * track and engine class, every racer on the grid equally often (`src/sim/race/racerBalance.ts`),
 * once with items on and once with items off. Prints win %, mean place and podium % per racer and
 * checks the targets: nobody wins more than 20% (items on and off), everybody wins at least 3%
 * (items on), and every mean place is within 1.0 of the field's 4.5 (items on).
 *
 * Minutes of CPU, so it runs the races in parallel child processes (this same file, one shard
 * each) and is never part of `pnpm test` (`racerBalance.balance.test.ts` is the CI smoke).
 * `RACES=30` runs fewer, `FIRST=100` other seeds, `ITEMS=on|off` one half only, `WORKERS=n` sets the processes (default:
 * the CPU count), `TUNING='{"stats":{"speedPerPoint":0.02}}'` overrides tuning values for a sweep.
 */
const RACES = Number(process.env.RACES ?? 100);
/** First race index (`FIRST=100` checks the result holds on another 100 seeds). */
const FIRST = Number(process.env.FIRST ?? 0);
const MODES = (process.env.ITEMS ?? 'on,off').split(',').map((m) => m === 'on');
const WORKERS = Number(process.env.WORKERS ?? availableParallelism());
/** Most of the races one racer may win (items on or off). */
const MAX_WIN_SHARE = 0.2;
/** Fewest of the races every racer must win (items on). */
const MIN_WIN_SHARE = 0.03;
/** Largest distance of a racer's mean place from the field's average place (items on). */
const MAX_PLACE_OFFSET = 1.0;

/** One finished balance race, as a shard reports it. */
interface RaceResult {
  index: number;
  itemsOn: boolean;
  order: string[];
  entered: string[];
}

/** Deep-merges plain objects from `TUNING` into `tuning` (sweeps only). */
function applyTuningOverride(json: string | undefined): void {
  if (!json) return;
  const merge = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(source)) {
      const current = target[key];
      if (value && typeof value === 'object' && current && typeof current === 'object')
        merge(current as Record<string, unknown>, value as Record<string, unknown>);
      else target[key] = value;
    }
  };
  merge(tuning as unknown as Record<string, unknown>, JSON.parse(json) as Record<string, unknown>);
}

const shard = process.env.BALANCE_SHARD;

if (shard) {
  // A child process: race every WORKERS-th race and write the results for the parent.
  it(`racer balance shard ${shard}`, { timeout: 60 * 60_000 }, () => {
    applyTuningOverride(process.env.TUNING);
    const [k = 0, n = 1] = shard.split('/').map(Number);
    const results: RaceResult[] = [];
    for (const itemsOn of MODES) {
      for (let index = FIRST + k; index < FIRST + RACES; index += n) {
        const order = finishOrder(balanceRace(index, { itemsOn }));
        results.push({ index, itemsOn, order, entered: balanceRacePlan(index).kartIds });
      }
    }
    writeFileSync(process.env.BALANCE_OUT ?? '', JSON.stringify(results));
  });
} else {
  it(`racer balance over ${RACES} races`, { timeout: 60 * 60_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'racer-balance-'));
    const workers = Math.max(1, Math.min(WORKERS, RACES));
    const started = performance.now();
    const results: RaceResult[] = [];
    try {
      await Promise.all(
        Array.from({ length: workers }, (_, k) => {
          const out = join(dir, `shard-${k}.json`);
          return new Promise<void>((resolve, reject) => {
            const child = spawn(
              process.execPath,
              [
                'node_modules/vitest/vitest.mjs',
                'run',
                '-c',
                'vitest.lab.config.ts',
                'scripts/racerBalance.lab.ts',
              ],
              {
                env: { ...process.env, BALANCE_SHARD: `${k}/${workers}`, BALANCE_OUT: out },
                stdio: ['ignore', 'ignore', 'inherit'],
              },
            );
            child.on('error', reject);
            child.on('exit', (code) => {
              if (code !== 0) return reject(new Error(`shard ${k} exited with ${code}`));
              results.push(...(JSON.parse(readFileSync(out, 'utf8')) as RaceResult[]));
              resolve();
            });
          });
        }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const seconds = (performance.now() - started) / 1000;
    const summaries = new Map<boolean, RacerSummary[]>();
    const lines = [
      `${RACES} races per mode (from #${FIRST}), ${BALANCE_KARTS} AI each, ${workers} workers, ${seconds.toFixed(0)} s` +
        (process.env.TUNING ? `, TUNING ${process.env.TUNING}` : ''),
    ];
    for (const itemsOn of MODES) {
      const mine = results.filter((r) => r.itemsOn === itemsOn).sort((a, b) => a.index - b.index);
      const incomplete = mine.filter((r) => r.order.length < BALANCE_KARTS);
      const summary = tallyRaces(
        mine.map((r) => r.order),
        mine.map((r) => r.entered),
      );
      summaries.set(itemsOn, summary);
      lines.push(
        '',
        `items ${itemsOn ? 'on' : 'off'}` +
          (incomplete.length
            ? ` (${incomplete.length} races with a kart still racing at the limit)`
            : ''),
        formatSummary(summary),
      );
    }
    process.stdout.write(`${lines.join('\n')}\n`);

    const fieldAverage = (BALANCE_KARTS + 1) / 2;
    for (const [itemsOn, summary] of summaries) {
      const mode = `items ${itemsOn ? 'on' : 'off'}`;
      for (const r of summary) {
        if (RACES % KART_IDS.length === 0)
          expect(r.races, `${r.id} races entered (${mode})`).toBe(
            (RACES * BALANCE_KARTS) / KART_IDS.length,
          );
        expect(r.winShare, `${r.id} win share (${mode})`).toBeLessThanOrEqual(MAX_WIN_SHARE);
        if (!itemsOn) continue;
        expect(r.winShare, `${r.id} win share (${mode})`).toBeGreaterThanOrEqual(MIN_WIN_SHARE);
        expect(
          Math.abs(r.meanPlace - fieldAverage),
          `${r.id} mean place (${mode})`,
        ).toBeLessThanOrEqual(MAX_PLACE_OFFSET);
      }
    }
  });
}
