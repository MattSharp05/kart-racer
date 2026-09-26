import { itemEffects } from '../../content/items/registries';
import { itemViews, type ScreenOverlay } from '../../content/items/views';
import type { KartState, SimEvent } from '../../sim/types';
import './screenEffects.css';

/** How long an `itemFx` overlay stays up when its view gives no `seconds`. */
const DEFAULT_FX_SECONDS = 1;

/**
 * Item screen overlays on the player's own HUD (MK-52): ink on the screen and the like. An item
 * view's `overlays` are keyed by effect id (shown while that effect lasts on the followed kart, so
 * it follows the sim state and online snapshots) or by `itemFx` name (shown for a while after the
 * event, only when the event is about the followed kart).
 */
export class ScreenEffects {
  readonly root = document.createElement('div');
  private readonly shown = new Map<string, HTMLElement>();
  /** `itemFx` overlays: key → time (ms) they come down. */
  private readonly fxUntil = new Map<string, { overlay: ScreenOverlay; until: number }>();

  constructor() {
    this.root.className = 'hud-screen-effects';
  }

  onEvents(events: readonly SimEvent[], kartId: number, now: number): void {
    for (const event of events) {
      if (event.type !== 'itemFx' || event.kartId !== kartId) continue;
      const overlay = overlayFor(event.item, event.fx);
      if (!overlay) continue;
      const ms = (overlay.seconds ?? DEFAULT_FX_SECONDS) * 1000;
      this.fxUntil.set(`fx:${event.item}.${event.fx}`, { overlay, until: now + ms });
    }
  }

  /** Shows the overlays for `kart` (the followed kart) right now. */
  update(kart: KartState | undefined, now: number): void {
    const want = new Map<string, ScreenOverlay>();
    for (const effect of kart?.effects ?? []) {
      const overlay = effectOverlay(effect.kind);
      if (overlay) want.set(`effect:${effect.kind}`, overlay);
    }
    for (const [key, { overlay, until }] of this.fxUntil) {
      if (now < until) want.set(key, overlay);
      else this.fxUntil.delete(key);
    }
    for (const [key, overlay] of want) {
      if (this.shown.has(key)) continue;
      const el = document.createElement('div');
      el.className = `hud-screen-effect ${overlay.className}`;
      el.dataset.overlay = key;
      el.innerHTML = overlay.html ?? '';
      this.root.append(el);
      this.shown.set(key, el);
    }
    for (const [key, el] of this.shown) {
      if (want.has(key)) continue;
      el.remove();
      this.shown.delete(key);
    }
  }
}

function overlayFor(item: string, key: string): ScreenOverlay | undefined {
  return itemViews.has(item) ? itemViews.get(item).overlays?.[key] : undefined;
}

/** An effect's overlay, from the view of the item that owns the effect. */
function effectOverlay(kind: string): ScreenOverlay | undefined {
  return itemEffects.has(kind) ? overlayFor(itemEffects.get(kind).item, kind) : undefined;
}
