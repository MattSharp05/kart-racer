import { describe } from 'vitest';
import { SOAK_SEEDS, soakRaces } from './soak';

describe('netcode soak at net-bad, 4 players (MK-73), seeds 1–5', () => {
  soakRaces(SOAK_SEEDS.slice(0, 5));
});
