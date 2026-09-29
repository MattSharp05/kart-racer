import type { RacerContent } from '..';

export default {
  id: 'coral',
  name: 'Coral',
  order: 80,
  tagline: 'Rides the drift like a wave: mini-turbos charge faster than anyone’s.',
  stats: { speed: 3, acceleration: 3, handling: 3, weight: 3 },
  strongDrift: true,
} satisfies RacerContent;
