/**
 * Loads the game waits on outside the sim (MK-97: the MK8 pack). `__game.whenReady()` resolves
 * once every load tracked here has settled, so tests and scenario links never race a fetch.
 */
const pending = new Set<Promise<unknown>>();

/** Tracks `load` until it settles; returns it unchanged. */
export function trackLoad<T>(load: Promise<T>): Promise<T> {
  const settled = load.then(
    () => undefined,
    () => undefined,
  );
  pending.add(settled);
  void settled.then(() => pending.delete(settled));
  return load;
}

/** Resolves when no tracked load is pending (loads started meanwhile are waited for too). */
export async function whenLoadsSettle(): Promise<void> {
  while (pending.size > 0) await Promise.all(pending);
}
