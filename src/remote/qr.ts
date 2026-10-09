import { encode } from 'uqr';

/** Quiet zone around the code, modules (the spec asks for 4; 2 scans fine on a white card). */
const BORDER = 2;

/**
 * A QR code for `text` as one SVG path (MK-146, ADR 0013: `uqr` encodes, we draw): `size` modules
 * square including the quiet zone, a 1×1 square per dark module. Error correction M copes with a
 * glare spot on a screen.
 */
export function qrPath(text: string): { size: number; d: string } {
  const { size, data } = encode(text, { ecc: 'M', border: BORDER });
  let d = '';
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return { size, d };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The QR code for `text` as an `<svg>` that scales to its box (dark on white, crisp edges). */
export function qrSvg(text: string, label: string): SVGSVGElement {
  const { size, d } = qrPath(text);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.dataset.qr = text;
  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('width', String(size));
  background.setAttribute('height', String(size));
  background.setAttribute('fill', '#fff');
  const modules = document.createElementNS(SVG_NS, 'path');
  modules.setAttribute('d', d);
  modules.setAttribute('fill', '#000');
  svg.append(background, modules);
  return svg;
}
