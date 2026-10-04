import type { TrackContent } from '../../content/tracks';
import type { TrackRecord } from '../../game/storage/records';
import { trackGeometry } from '../../sim/track';
import { formatTime } from '../hud/format';
import './trackCard.css';

/** Points sampled round the lap for the outline. */
const OUTLINE_SAMPLES = 160;
/** Space round the outline, as a share of its larger side. */
const OUTLINE_MARGIN = 0.08;
/** The outline's viewBox, px (the SVG scales it to the card). */
const OUTLINE_BOX = 100;
/** The start-line dot's radius, in viewBox px. */
const START_DOT_RADIUS = 5;
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A top-down outline of a track (MK-50): its centre line as an SVG polyline, north (−Z) up, with a
 * dot on the start line. Drawn from the spline data, so a new track gets one by registering (no
 * screenshots, no WebGL). `null` for tracks without a spline (the test arena).
 */
export function trackOutline(track: CardTrack): SVGSVGElement | null {
  if (track.def?.kind !== 'spline') return null;
  const geometry = trackGeometry(track.def);
  const points = Array.from({ length: OUTLINE_SAMPLES }, (_, i) =>
    geometry.pointAt(i / OUTLINE_SAMPLES),
  );
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const width = Math.max(...xs) - minX;
  const depth = Math.max(...zs) - minZ;
  const size = Math.max(width, depth) * (1 + 2 * OUTLINE_MARGIN) || 1;
  const scale = OUTLINE_BOX / size;
  // Centred in the square box.
  const offsetX = (OUTLINE_BOX - width * scale) / 2;
  const offsetY = (OUTLINE_BOX - depth * scale) / 2;
  const toBox = (p: { x: number; z: number }) =>
    [(p.x - minX) * scale + offsetX, (p.z - minZ) * scale + offsetY].map((n) => n.toFixed(1));

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${OUTLINE_BOX} ${OUTLINE_BOX}`);
  svg.setAttribute('class', 'track-outline');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(SVG_NS, 'polygon');
  line.setAttribute('points', points.map((p) => toBox(p).join(',')).join(' '));
  const [startX = '0', startY = '0'] = points[0] ? toBox(points[0]) : [];
  const start = document.createElementNS(SVG_NS, 'circle');
  start.setAttribute('cx', startX);
  start.setAttribute('cy', startY);
  start.setAttribute('r', String(START_DOT_RADIUS));
  start.setAttribute('class', 'track-start');
  svg.append(line, start);
  return svg;
}

/** What a card shows of a track: an MK8 room's course (MK-132) has no track data until it loads. */
export type CardTrack = Pick<TrackContent, 'id' | 'name' | 'hazard'> &
  Partial<Pick<TrackContent, 'def'>>;

/** A track's saved records as the card's lines: best race and best lap, or none yet. */
export function recordText(record: TrackRecord): string[] {
  const lines = [
    ...(record.race ? [`Race ${formatTime(record.race.time)}`] : []),
    ...(record.lap ? [`Lap ${formatTime(record.lap.time)}`] : []),
  ];
  return lines.length ? lines : ['No record yet'];
}

/**
 * One track's card (MK-50, reused by the online lobby): its outline, name, hazard in a few words
 * and the player's records (none in the lobby, MK-78). A button, so it works with a tap, a click
 * and the keyboard; `aria-checked` marks the selected one.
 */
export function trackCard(
  track: CardTrack,
  record: TrackRecord | null,
  onPick: () => void,
): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'track-card';
  card.dataset.track = track.id;
  card.setAttribute('role', 'radio');
  card.setAttribute('aria-checked', 'false');
  const outline = trackOutline(track);
  if (outline) card.append(outline);
  const name = document.createElement('span');
  name.className = 'track-name';
  name.textContent = track.name;
  card.append(name);
  if (track.hazard) {
    const hazard = document.createElement('span');
    hazard.className = 'track-hazard';
    hazard.textContent = track.hazard;
    card.append(hazard);
  }
  if (record) {
    const records = document.createElement('span');
    records.className = 'track-records';
    if (!record.race && !record.lap) records.classList.add('none');
    for (const text of recordText(record)) {
      const line = document.createElement('span');
      line.textContent = text;
      records.append(line);
    }
    card.append(records);
  }
  card.addEventListener('click', onPick);
  return card;
}
