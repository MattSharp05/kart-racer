/**
 * A deep copy of plain-JSON data (objects, arrays, primitives), such as `SimState`. About 5× faster
 * than `structuredClone` on a race state (MK-74: `step` clones the state every tick, and an online
 * client re-simulates a dozen ticks per snapshot). Not for Maps, Sets, Dates or class instances.
 */
export function cloneJson<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) {
    const out: unknown[] = new Array(value.length);
    for (let i = 0; i < value.length; i += 1) out[i] = cloneJson(value[i] as unknown);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value))
    out[key] = cloneJson((value as Record<string, unknown>)[key]);
  return out as T;
}
