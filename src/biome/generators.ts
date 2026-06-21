import type { SeededRandom } from "../random.js";
import { type BiomeContext, type BiomePoint, makePoint } from "./context.js";

/**
 * A generator emits candidate points within the biome bounds, mirroring PCG
 * Biome Core's "generator subtypes" (ground scatter, ring/edge, explicit
 * points). Filters then thin the result and assets are assigned downstream.
 */
export interface Generator {
  id: string;
  generate(ctx: BiomeContext): BiomePoint[];
}

/** Jittered-grid ground scatter across the volume (the workhorse subtype). */
export function surfaceScatter(options: { id: string; count: number; jitter?: number }): Generator {
  const jitter = options.jitter ?? 1;
  return {
    id: options.id,
    generate(ctx) {
      const { bounds, rng } = ctx;
      const width = bounds.maxX - bounds.minX;
      const depth = bounds.maxZ - bounds.minZ;
      const cells = Math.max(1, Math.ceil(Math.sqrt(options.count * (depth / width || 1))));
      const colsX = Math.ceil(options.count / cells);
      const points: BiomePoint[] = [];
      for (let iz = 0; iz < cells; iz += 1) {
        for (let ix = 0; ix < colsX && points.length < options.count; ix += 1) {
          const fx = (ix + 0.5 + (rng.next() - 0.5) * jitter) / colsX;
          const fz = (iz + 0.5 + (rng.next() - 0.5) * jitter) / cells;
          points.push(makePoint(ctx.terrain, bounds.minX + fx * width, bounds.minZ + fz * depth, rng));
        }
      }
      return points;
    }
  };
}

/** Scatter inside an annulus around a centre — pond fringes, glade rings. */
export function ringScatter(options: {
  id: string;
  center: { x: number; z: number };
  innerRadius: number;
  outerRadius: number;
  count: number;
}): Generator {
  return {
    id: options.id,
    generate(ctx) {
      const points: BiomePoint[] = [];
      for (let index = 0; index < options.count; index += 1) {
        const angle = ctx.rng.between(0, Math.PI * 2);
        const r = ctx.rng.between(options.innerRadius, options.outerRadius);
        const x = options.center.x + Math.cos(angle) * r;
        const z = options.center.z + Math.sin(angle) * r;
        points.push(makePoint(ctx.terrain, x, z, ctx.rng));
      }
      return points;
    }
  };
}

/** Explicit authored points (hero placements / spline-like sequences). */
export function pointSet(id: string, positions: { x: number; z: number; rotationY?: number }[]): Generator {
  return {
    id,
    generate(ctx) {
      return positions.map((entry) => {
        const point = makePoint(ctx.terrain, entry.x, entry.z, ctx.rng);
        if (entry.rotationY !== undefined) {
          point.rotationY = entry.rotationY;
        }
        return point;
      });
    }
  };
}

export function jitterScale(point: BiomePoint, rng: SeededRandom, min: number, max: number): void {
  point.scale = rng.between(min, max);
}
