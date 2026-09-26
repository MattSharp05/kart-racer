import { describe } from 'vitest';
import { SOAK_SEEDS, soakRaces } from './soak';

describe('netcode soak at net-bad, 4 players (MK-73), seeds 6–10', () => {
  soakRaces(SOAK_SEEDS.slice(5));
});
