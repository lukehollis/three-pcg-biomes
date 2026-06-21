import * as THREE from "three";
import type { SeededRandom } from "../random.js";
import { BiomeTerrain } from "../terrain.js";
import type { TerrainSample } from "../types.js";

/**
 * A 2D box that bounds where a biome generates, mirroring the box-collision
 * volume on `BP_PCGBiomeCore`. Splines/textures could extend this later.
 */
export interface BiomeBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function centeredBounds(size: number): BiomeBounds {
  const half = size / 2;
  return { minX: -half, maxX: half, minZ: -half, maxZ: half };
}

/**
 * A candidate placement flowing through the PCG-style pipeline. `density` is
 * the running 0..1 weight that filters multiply down and the sampler tests
 * against, matching PCG's density-driven point model.
 */
export interface BiomePoint {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  rotationY: number;
  scale: number;
  density: number;
  sample: TerrainSample;
}

export interface BiomeContext {
  terrain: BiomeTerrain;
  size: number;
  bounds: BiomeBounds;
  rng: SeededRandom;
}

export function makePoint(terrain: BiomeTerrain, x: number, z: number, rng: SeededRandom): BiomePoint {
  const sample = terrain.sampleAt(x, z);
  return {
    position: new THREE.Vector3(x, sample.height, z),
    normal: sample.normal.clone(),
    rotationY: rng.between(0, Math.PI * 2),
    scale: 1,
    density: 1,
    sample
  };
}
