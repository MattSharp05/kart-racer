/** What the URL asks the game to boot into: `/?scenario=<name>&seed=<n>&paused=1&tune=1`. */
export interface LaunchParams {
  scenario?: string;
  seed?: number;
  paused: boolean;
  /** Show the live tuning panel. */
  tune: boolean;
}

const TRUE_VALUES = ['1', 'true'];

export function parseLaunchParams(search: string): LaunchParams {
  const params = new URLSearchParams(search);
  const scenario = params.get('scenario') ?? undefined;
  const seedText = params.get('seed');
  const seed = seedText !== null && seedText !== '' ? Number(seedText) : undefined;
  const flag = (name: string) => TRUE_VALUES.includes(params.get(name) ?? '');
  return {
    ...(scenario ? { scenario } : {}),
    ...(seed !== undefined && Number.isFinite(seed) ? { seed } : {}),
    paused: flag('paused'),
    tune: flag('tune'),
  };
}
