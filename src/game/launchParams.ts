/** What the URL asks the game to boot into: `/?scenario=<name>&seed=<n>&paused=1`. */
export interface LaunchParams {
  scenario?: string;
  seed?: number;
  paused: boolean;
}

export function parseLaunchParams(search: string): LaunchParams {
  const params = new URLSearchParams(search);
  const scenario = params.get('scenario') ?? undefined;
  const seedText = params.get('seed');
  const seed = seedText !== null && seedText !== '' ? Number(seedText) : undefined;
  const paused = ['1', 'true'].includes(params.get('paused') ?? '');
  return {
    ...(scenario ? { scenario } : {}),
    ...(seed !== undefined && Number.isFinite(seed) ? { seed } : {}),
    paused,
  };
}
