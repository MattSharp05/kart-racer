import { kartDef } from '../../sim/data/karts';
import type { SimState } from '../../sim/types';
import type { HudView } from './hud';

/** A local player on the overview (MK-145): their kart, label and colour. */
export interface OverviewPlayer {
  kartId: number;
  label: string;
  colour: string;
  /** Where their kart is in the quadrant (fractions from its top left), if known. */
  spot: { x: number; y: number } | null;
}

/**
 * The race overview quadrant's HUD (MK-145: 3 players, the fourth quadrant shows the whole track
 * from above): the lap and the running order, each player's row in their colour.
 */
export class OverviewPanel {
  readonly root = document.createElement('div');
  private readonly title = document.createElement('div');
  private readonly list = document.createElement('ol');
  /** A "P2" marker over each player's kart on the map. */
  private readonly markers: HTMLDivElement[] = [];
  private shown = '';

  constructor() {
    this.root.className = 'hud hud-view hud-overview';
    this.root.hidden = true;
    this.title.className = 'hud-overview-title';
    this.list.className = 'hud-overview-order';
    this.root.append(this.title, this.list);
    document.body.append(this.root);
  }

  /** Shows the panel over `rect` with `state`'s order, or hides it (`rect` null). */
  update(state: SimState, rect: HudView['rect'] | null, players: readonly OverviewPlayer[]): void {
    this.root.hidden = rect === null;
    if (!rect) return;
    const style = this.root.style;
    const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`;
    style.left = percent(rect.x);
    style.top = percent(rect.y);
    style.width = percent(rect.w);
    style.height = percent(rect.h);
    this.placeMarkers(players);
    const leader = state.karts[state.positions[0] ?? -1];
    const lap = Math.min(Math.max(1, leader?.race.lap ?? 1), state.race.laps);
    const rows = state.positions.map((kartId, i) => {
      const player = players.find((p) => p.kartId === kartId);
      const kart = state.karts[kartId];
      return {
        place: i + 1,
        player,
        name: kart ? (kart.name ?? kartDef(kart.kartType).name) : '?',
      };
    });
    const key = `${lap}/${state.race.laps}|${rows.map((r) => `${r.place}${r.player?.label ?? r.name}`).join(',')}`;
    if (key === this.shown) return;
    this.shown = key;
    this.title.textContent = `RACE · LAP ${lap}/${state.race.laps}`;
    this.list.replaceChildren(
      ...rows.map(({ place, player, name }) => {
        const item = document.createElement('li');
        const number = document.createElement('span');
        number.className = 'hud-overview-place';
        number.textContent = String(place);
        const label = document.createElement('span');
        label.textContent = player ? `${player.label} ${name}` : name;
        if (player) {
          item.dataset.player = player.label;
          item.style.setProperty('--player-colour', player.colour);
        }
        item.append(number, label);
        return item;
      }),
    );
  }

  private placeMarkers(players: readonly OverviewPlayer[]): void {
    players.forEach((player, i) => {
      let marker = this.markers[i];
      if (!marker) {
        marker = document.createElement('div');
        marker.className = 'hud-overview-marker';
        this.root.append(marker);
        this.markers[i] = marker;
      }
      marker.hidden = player.spot === null;
      if (!player.spot) return;
      marker.textContent = player.label;
      marker.style.setProperty('--player-colour', player.colour);
      marker.style.left = `${(player.spot.x * 100).toFixed(2)}%`;
      marker.style.top = `${(player.spot.y * 100).toFixed(2)}%`;
    });
    for (const extra of this.markers.slice(players.length)) extra.hidden = true;
  }
}
