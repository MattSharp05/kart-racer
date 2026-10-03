// The Hornet Swarm's MK8-style icon (MK-115): three glossy striped hornets in a V, with MK8's dark
// outline and white shine; SVG in a 64 × 64 box (no three, so `tools/mk8` can read it).

/** One hornet facing left, centred on the origin, about 30 × 24. */
const HORNET =
  '<ellipse cx="-3" cy="-9" rx="6.5" ry="4.5" fill="#e6f7ff" stroke="#1b1530" stroke-width="2" transform="rotate(-25 -3 -9)"/><ellipse cx="5" cy="-9.5" rx="6.5" ry="4.5" fill="#e6f7ff" stroke="#1b1530" stroke-width="2" transform="rotate(20 5 -9.5)"/><path d="M13 0l5 1.5-5 1.5z" fill="#1b1530" stroke="#1b1530" stroke-width="1.5" stroke-linejoin="round"/><ellipse rx="12" ry="8" fill="#ffc21a" stroke="#1b1530" stroke-width="2.5"/><path d="M-2-7.6v15.2M5-6.6v13.2" stroke="#1b1530" stroke-width="3.4"/><ellipse cx="-4" cy="-4" rx="4" ry="1.8" fill="#fff6c2"/><circle cx="-13" cy="0" r="5.5" fill="#2a2140" stroke="#1b1530" stroke-width="2.5"/><circle cx="-15" cy="-1.5" r="2.2" fill="#ffffff"/><circle cx="-15.4" cy="-1.3" r="1" fill="#1b1530"/>';

const at = (x: number, y: number, scale: number) =>
  `<g transform="translate(${x} ${y}) scale(${scale})">${HORNET}</g>`;

export default [at(45, 21, 0.9), at(45, 47, 0.9), at(24, 34, 1.08)].join('');
