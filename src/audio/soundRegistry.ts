import type { Synth } from './synth';

/** Plays one registered sound on the synth: `volume` 0..1, `pitch` a step some sounds use. */
export type SoundRecipe = (synth: Synth, volume: number, pitch: number) => void;

/**
 * Sounds that content brings along (MK-52), next to the built-in ones in `synth.ts`: an item's
 * `ItemView.sounds` are registered here as `<item>.<name>` (`content/items/render.ts`).
 */
const recipes = new Map<string, SoundRecipe>();

export function registerSound(id: string, recipe: SoundRecipe): void {
  if (recipes.has(id)) throw new Error(`Duplicate sound id: ${id}`);
  recipes.set(id, recipe);
}

export function unregisterSound(id: string): void {
  recipes.delete(id);
}

export function soundRecipe(id: string): SoundRecipe | undefined {
  return recipes.get(id);
}
