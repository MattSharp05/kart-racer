import type { RacerContent } from '..';

export default {
  id: 'boulder',
  name: 'Boulder',
  order: 30,
  tagline: 'Heavy bruiser with the highest top speed. Slow to get going.',
  stats: { speed: 5, acceleration: 1, handling: 2, weight: 4 },
} satisfies RacerContent;
