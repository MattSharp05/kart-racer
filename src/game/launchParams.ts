/** What the URL asks the game to boot into: `/?scenario=<name>&seed=<n>&paused=1&tune=1&kart=<id>`. */
export interface LaunchParams {
  scenario?: string;
  seed?: number;
  paused: boolean;
  /** Show the live tuning panel. */
  tune: boolean;
  /** Player kart override, e.g. `&kart=boulder`. */
  kart?: string;
  /** Give the player an item straight away, e.g. `&item=mushroom`. */
  item?: string;
  /** Turn off camera shake and FOV kick (MK-27); the OS setting does the same. */
  reducedMotion: boolean;
}

const TRUE_VALUES = ['1', 'true'];

export function parseLaunchParams(search: string): LaunchParams {
  const params = new URLSearchParams(search);
  const scenario = params.get('scenario') ?? undefined;
  const seedText = params.get('seed');
  const seed = seedText !== null && seedText !== '' ? Number(seedText) : undefined;
  const flag = (name: string) => TRUE_VALUES.includes(params.get(name) ?? '');
  const kart = params.get('kart') ?? undefined;
  const item = params.get('item') ?? undefined;
  return {
    ...(scenario ? { scenario } : {}),
    ...(seed !== undefined && Number.isFinite(seed) ? { seed } : {}),
    ...(kart ? { kart } : {}),
    ...(item ? { item } : {}),
    paused: flag('paused'),
    tune: flag('tune'),
    reducedMotion: flag('reduced-motion'),
  };
}
