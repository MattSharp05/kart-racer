import type { RacerContent } from '..';

export default {
  id: 'pixie',
  name: 'Pixie',
  order: 20,
  tagline: 'Tiny and zippy. Off the line first, but gets pushed around.',
  stats: { speed: 2, acceleration: 5, handling: 4, weight: 1 },
} satisfies RacerContent;
