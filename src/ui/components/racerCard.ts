import type { KartStats, RacerContent } from '../../content/racers';
import { racerViews } from '../../content/racers/render';

/** The stat rows every racer shows, in order (PRD → Karts). */
export const STAT_LABELS = [
  ['speed', 'Speed'],
  ['acceleration', 'Acceleration'],
  ['handling', 'Handling'],
  ['weight', 'Weight'],
] as const satisfies readonly (readonly [keyof KartStats, string])[];

/** Stats run 1–5. */
export const STAT_MAX = 5;

/** A `#rrggbb` string for a 0xRRGGBB colour. */
function css(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

/**
 * One racer's card in the grid (MK-51): its paint as a swatch and its name. A button, so it works
 * with a tap, a click and the keyboard; `aria-checked` marks the selected one.
 */
export function racerCard(racer: RacerContent, onPick: () => void): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'racer-card';
  card.dataset.racer = racer.id;
  card.setAttribute('role', 'radio');
  card.setAttribute('aria-checked', 'false');
  const { body, accent } = racerViews.get(racer.id).colours;
  const swatch = document.createElement('span');
  swatch.className = 'racer-swatch';
  swatch.style.background = `linear-gradient(135deg, ${css(body)} 62%, ${css(accent)} 62%)`;
  const name = document.createElement('span');
  name.className = 'racer-name';
  name.textContent = racer.name;
  card.append(swatch, name);
  card.addEventListener('click', onPick);
  return card;
}

/** The stat bars (1–5 pips each) for `stats`, as a `<dl>`. */
export function statBars(stats: KartStats): HTMLDListElement {
  const list = document.createElement('dl');
  list.className = 'stats';
  for (const [key, label] of STAT_LABELS) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.dataset.stat = key;
    dd.setAttribute('aria-label', `${label} ${stats[key]} of ${STAT_MAX}`);
    for (let i = 1; i <= STAT_MAX; i += 1) {
      const pip = document.createElement('span');
      pip.className = i <= stats[key] ? 'pip on' : 'pip';
      dd.append(pip);
    }
    list.append(dt, dd);
  }
  return list;
}
