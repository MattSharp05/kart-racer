import type { RacerContent } from '..';

export default {
  id: 'sprocket',
  name: 'Sprocket',
  order: 50,
  tagline: 'Robot mechanic: jumps off the line and out of every corner, but tops out early.',
  stats: { speed: 2, acceleration: 4, handling: 3, weight: 3 },
} satisfies RacerContent;
