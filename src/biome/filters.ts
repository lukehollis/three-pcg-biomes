import * as THREE from "three";
import type { BiomeContext, BiomePoint } from "./context.js";

/**
 * A point filter returns a 0..1 density multiplier for a point, mirroring the
 * PCG Biome Core compute/projection filter graphs (height, density, flow,
 * slope). 0 rejects the point; values in-between thin it probabilistically.
 */
export type PointFilter = (point: BiomePoint, ctx: BiomeContext) => number;

const smooth = THREE.MathUtils.smoothstep;

/** Accept within [min,max] height, feathered by `feather` metres at each edge. */
export function heightFilter(min: number, max: number, feather = 1): PointFilter {
  return (point) => {
    const y = point.position.y;
    return smooth(y, min - feather, min + feather) * (1 - smooth(y, max - feather, max + feather));
  };
}

/** Reject above `maxSlope` (0 flat .. 1 vertical), feathered. */
export function slopeFilter(maxSlope: number, feather = 0.06): PointFilter {
  return (point) => 1 - smooth(point.sample.slope, maxSlope - feather, maxSlope + feather);
}

/** Keep points at least `min` (and at most `max`) metres from the path. */
export function pathDistanceFilter(min: number, max = Number.POSITIVE_INFINITY): PointFilter {
  return (point) => {
    const d = point.sample.pathDistance;
    if (d < min || d > max) {
      return 0;
    }
    return 1;
  };
}

/** Bias toward the path verge: full near it, fading out by `falloff` metres. */
export function nearPathFilter(falloff: number): PointFilter {
  return (point) => 1 - smooth(point.sample.pathDistance, 1, falloff);
}

/** Keep points at least `min` metres outside the pond. */
export function waterDistanceFilter(min: number): PointFilter {
  return (point) => (point.sample.waterDistance < min ? 0 : 1);
}

/** Radial band from the biome centre (0 centre .. 1 edge). */
export function radialFilter(inner: number, outer: number): PointFilter {
  return (point) => smooth(point.sample.radial, inner, outer);
}

/** Keep points away from the very edge of the volume. */
export function edgeGuard(maxRadial = 0.97): PointFilter {
  return (point) => (point.sample.radial > maxRadial ? 0 : 1);
}

/**
 * Clumping mask from the terrain's flow/flower noise field — emulates PCG's
 * texture/flow projection filters so scatter forms organic patches rather than
 * a uniform field. `low`/`high` map the noise to a 0..1 multiplier.
 */
export function densityNoiseFilter(low: number, high: number, source: "moisture" | "flower" = "flower"): PointFilter {
  return (point) => {
    const value = source === "moisture" ? point.sample.moisture : point.sample.flowerField;
    return smooth(value, low, high);
  };
}

/** Multiply a set of filters together into one (PCG filter chaining). */
export function combineFilters(filters: PointFilter[]): PointFilter {
  return (point, ctx) => {
    let density = 1;
    for (const filter of filters) {
      density *= filter(point, ctx);
      if (density <= 0) {
        return 0;
      }
    }
    return density;
  };
}
