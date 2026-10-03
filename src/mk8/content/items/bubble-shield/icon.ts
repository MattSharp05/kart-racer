// The Bubble Shield's MK8-style icon (MK-115): a translucent glossy bubble with a rainbow band and
// MK8's star-shine, outlined; SVG in a 64 × 64 box (no three, so `tools/mk8` can read it).

/** A four-pointed sparkle at (x, y), `r` from centre to tip. */
const star = (x: number, y: number, r: number, fill: string) =>
  `<path d="M${x} ${y - r}Q${x + r * 0.16} ${y - r * 0.16} ${x + r} ${y}Q${x + r * 0.16} ${y + r * 0.16} ${x} ${y + r}Q${x - r * 0.16} ${y + r * 0.16} ${x - r} ${y}Q${x - r * 0.16} ${y - r * 0.16} ${x} ${y - r}z" fill="${fill}" stroke="#1b1530" stroke-width="1.6" stroke-linejoin="round"/>`;

export default [
  '<defs><radialGradient id="bubble-shield-fill" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="0.45" stop-color="#9fe3ff" stop-opacity="0.7"/><stop offset="1" stop-color="#2f9bff" stop-opacity="0.85"/></radialGradient></defs>',
  '<circle cx="31" cy="33" r="27" fill="url(#bubble-shield-fill)" stroke="#1b4f9e" stroke-width="3.2"/>',
  '<path d="M9 41a24 24 0 0 0 38 11" fill="none" stroke="#ff7ad9" stroke-width="3" stroke-linecap="round"/>',
  '<path d="M11 44a24 24 0 0 0 31 10" fill="none" stroke="#ffe14a" stroke-width="2.2" stroke-linecap="round"/>',
  '<ellipse cx="21" cy="21" rx="8" ry="4.6" fill="#ffffff" transform="rotate(-38 21 21)"/>',
  '<circle cx="33" cy="15" r="2.6" fill="#ffffff"/>',
  star(50, 13, 10, '#fff27a'),
  star(43, 43, 5.5, '#ffffff'),
].join('');
