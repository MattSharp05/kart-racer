/** What every piece of registered content has: a string id and a sort key for menus and tables. */
export interface ContentDef {
  id: string;
  /** Lists sort by this, then by id, so the order never depends on import order. */
  order: number;
}

/**
 * A table of content (tracks, racers, items) keyed by string id (ADR 0007). Ids are plain strings
 * validated here at registration and lookup, so adding content adds files and edits no shared
 * union or switch. Pure: safe to use from the sim.
 */
export class Registry<T extends ContentDef> {
  private readonly byId = new Map<string, T>();
  private sorted: readonly T[] | null = null;

  /** `kind` names the content in error messages ("track", "item"…). */
  constructor(readonly kind: string) {}

  /** Adds `def`; throws if its id is empty or already registered. Returns `def`. */
  register(def: T): T {
    if (!def.id) throw new Error(`Cannot register a ${this.kind} without an id`);
    if (this.byId.has(def.id)) throw new Error(`Duplicate ${this.kind} id: ${def.id}`);
    this.byId.set(def.id, def);
    this.sorted = null;
    return def;
  }

  /** Removes a registration (tests that register throwaway content clean up with this). */
  unregister(id: string): void {
    if (this.byId.delete(id)) this.sorted = null;
  }

  /** The def for `id`; throws for an unknown id. */
  get(id: string): T {
    const def = this.byId.get(id);
    if (!def) throw new Error(`Unknown ${this.kind}: ${id} (known: ${this.ids().join(', ')})`);
    return def;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Every def, sorted by `order` then id. */
  list(): readonly T[] {
    this.sorted ??= [...this.byId.values()].sort(
      (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return this.sorted;
  }

  ids(): string[] {
    return this.list().map((def) => def.id);
  }
}
