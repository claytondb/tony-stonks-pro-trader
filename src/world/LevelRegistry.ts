/**
 * Levels built by code (src/world/*Level.ts) rather than from LevelData object lists. Game
 * installs any level listed here through Game.installInterior; the office has its own path
 * (Game.buildOfficeFloorplate) because it also owns the lift and the levelsim layout.
 */
import type { OfficeInterior } from './OfficeLevel';
import { buildGarageInterior, garageMinimapFootprints, garageScatterOk } from './GarageLevel';
import { buildStairwellInterior, stairwellMinimapFootprints } from './StairwellLevel';

export type Footprint = { x: number; z: number; w: number; d: number; rail: boolean };

export interface BuiltLevelDef {
  build(): OfficeInterior;
  minimap(): Footprint[];
  /** Where loose knockables may be scattered; absent = none at all. */
  scatterOk?(x: number, z: number): boolean;
  /** Candidates generated before the filter (most are rejected). */
  scatterCandidates?: number;
}

export const BUILT_LEVELS: Record<string, BuiltLevelDef> = {
  ch1_garage: { build: () => buildGarageInterior(), minimap: garageMinimapFootprints, scatterOk: garageScatterOk, scatterCandidates: 400 },
  story_2_stairwell: { build: () => buildStairwellInterior(), minimap: stairwellMinimapFootprints },
};
