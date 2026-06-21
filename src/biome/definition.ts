import * as THREE from "three";
import { pickWeighted } from "../random.js";
import { isBlocked, type Obstacle } from "../scatter.js";
import type { BiomePlacement, ScalarRange, WeightedAsset } from "../types.js";
import type { BiomeContext, BiomePoint } from "./context.js";
import { combineFilters, type PointFilter } from "./filters.js";
import type { Generator } from "./generators.js";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Recursive child spawning: each accepted parent point can spawn children in a
 * ring around it (e.g. a tree skirted by bushes/ferns), mirroring PCG Biome
 * Core's hierarchical transform/spawn with multiple children per recursion.
 */
export interface ChildSpawnRule {
  assetId: string;
  count: ScalarRange;
  radius: ScalarRange;
  scale?: ScalarRange;
  align?: "up" | "terrain";
}

/**
 * One layer of a biome: generators emit points, filters thin them, an asset
 * palette is sampled per point, optional self-spacing prevents overlap, and
 * children spawn recursively. Layers run highest-priority first so big anchors
 * (trees, rocks) claim space before ground cover fills in.
 */
export interface BiomeLayer {
  id: string;
  priority: number;
  generators: Generator[];
  filters: PointFilter[];
  assets: WeightedAsset[];
  align?: "up" | "terrain";
  yOffset?: number;
  /** Vertical scale jitter [min,max] applied on top of horizontal scale. */
  verticalJitter?: ScalarRange;
  /** Minimum spacing (metres) between accepted points in this layer. */
  selfSpacing?: (assetId: string) => number;
  /** Register accepted points as global obstacles at this fraction of spacing. */
  obstacleFactor?: number;
  children?: ChildSpawnRule[];
}

export interface BiomeDefinition {
  id: string;
  layers: BiomeLayer[];
}

export interface BiomeRunResult {
  placements: BiomePlacement[];
}

/**
 * Executes a biome definition: the faithful equivalent of running the PCG
 * Biome Core graph over a volume. `obstacles` carries hero placements in and
 * accumulates layer anchors so later layers avoid them.
 */
export function runBiomeDefinition(
  definition: BiomeDefinition,
  ctx: BiomeContext,
  obstacles: Obstacle[]
): BiomeRunResult {
  const placements: BiomePlacement[] = [];
  const layers = [...definition.layers].sort((a, b) => b.priority - a.priority);

  for (const layer of layers) {
    const layerRng = ctx.rng.fork(layer.id);
    const layerCtx: BiomeContext = { ...ctx, rng: layerRng };
    const filter = combineFilters(layer.filters);
    const localObstacles: Obstacle[] = [];

    const candidates: BiomePoint[] = [];
    for (const generator of layer.generators) {
      candidates.push(...generator.generate(layerCtx));
    }

    for (const point of candidates) {
      const density = point.density * filter(point, layerCtx);
      if (density <= 0 || layerRng.next() > density) {
        continue;
      }

      const asset = pickWeighted(layer.assets, layerRng);
      const x = point.position.x;
      const z = point.position.z;

      if (layer.selfSpacing && isBlocked(x, z, localObstacles)) {
        continue;
      }
      if (isBlocked(x, z, obstacles)) {
        continue;
      }

      const placement = toPlacement(layer, asset, point, layerRng);
      placements.push(placement);

      if (layer.selfSpacing) {
        const radius = layer.selfSpacing(asset.assetId);
        localObstacles.push({ x, z, radius });
        obstacles.push({ x, z, radius: radius * (layer.obstacleFactor ?? 0.7) });
      }

      if (layer.children) {
        spawnChildren(layer.children, placement, layerCtx, placements);
      }
    }
  }

  return { placements };
}

function toPlacement(
  layer: BiomeLayer,
  asset: WeightedAsset,
  point: BiomePoint,
  rng: ReturnType<BiomeContext["rng"]["fork"]>
): BiomePlacement {
  const base = asset.scale ? rng.range(asset.scale) : point.scale;
  const vertical = layer.verticalJitter ? rng.range(layer.verticalJitter) : 1;
  const normal = layer.align === "terrain" ? point.normal.clone() : UP.clone();
  return {
    assetId: asset.assetId,
    position: new THREE.Vector3(point.position.x, point.position.y + (layer.yOffset ?? 0), point.position.z),
    rotationY: point.rotationY,
    scale: new THREE.Vector3(base, base * vertical, base),
    normal
  };
}

function spawnChildren(
  rules: ChildSpawnRule[],
  parent: BiomePlacement,
  ctx: BiomeContext,
  out: BiomePlacement[]
): void {
  for (const rule of rules) {
    const count = Math.round(ctx.rng.range(rule.count));
    for (let index = 0; index < count; index += 1) {
      const angle = ctx.rng.between(0, Math.PI * 2);
      const radius = ctx.rng.range(rule.radius);
      const x = parent.position.x + Math.cos(angle) * radius;
      const z = parent.position.z + Math.sin(angle) * radius;
      const sample = ctx.terrain.sampleAt(x, z);
      const scale = rule.scale ? ctx.rng.range(rule.scale) : 1;
      out.push({
        assetId: rule.assetId,
        position: new THREE.Vector3(x, sample.height, z),
        rotationY: ctx.rng.between(0, Math.PI * 2),
        scale: new THREE.Vector3(scale, scale, scale),
        normal: rule.align === "terrain" ? sample.normal.clone() : UP.clone()
      });
    }
  }
}
