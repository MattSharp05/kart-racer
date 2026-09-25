/** Tiny key/value store so the game works (and tests run) with or without localStorage. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, string>();
  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/** localStorage when it works (private mode and some embeds throw), otherwise in-memory. */
export function browserStore(): KeyValueStore {
  try {
    const probe = '__kart_racer_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return {
      get: (key) => {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      set: (key, value) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // Storage full or blocked: bests just aren't remembered.
        }
      },
    };
  } catch {
    return new MemoryStore();
  }
}

/** Parses a stored JSON object; anything missing, broken or not an object reads as `{}`. */
export function readJson(store: KeyValueStore, key: string): Record<string, unknown> {
  try {
    const raw = store.get(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
