export { BiomeWorld } from "./biome-world.js";
export type { BiomeWorldAssetLoader, BiomeWorldMaterials } from "./biome-world.js";
export { BiomeFirstPersonController } from "./controller.js";
export { computeSeed, computeSeedFromPosition, hashSeed, pickWeighted, SeededRandom } from "./random.js";
export { createInstancedGroup, generateScatterPlacements, groupPlacementsByAsset, isBlocked } from "./scatter.js";
export type { Obstacle } from "./scatter.js";
export * from "./biome/index.js";
export {
  createCircleCache,
  createCompositeCache,
  createPolygonCache,
  createSplineCache,
  createTextureCache,
  createVolumeCache,
  differenceByPriority,
  runGlobalBiomeCore,
  runLocalBiomeCore
} from "three-pcg-framework";
export type {
  PCGAssetEntry,
  PCGBiomeCache,
  PCGGeneratorBinding,
  PCGGlobalBiomeResult,
  PCGLocalBiomeDefinition,
  PCGLocalBiomeResult,
  PCGPoint,
  PCGPointBounds,
  PCGSurface,
  PCGSurfaceSample
} from "three-pcg-framework";
export { BiomeTerrain } from "./terrain.js";
export type {
  BiomeAssetDescriptor,
  BiomeLoadingEvent,
  BiomeModel,
  BiomePack,
  BiomePlacement,
  BiomeQuality,
  ControllerOptions,
  CreateBiomeOptions,
  ScalarRange,
  ScatterDistribution,
  ScatterLayer,
  TerrainOptions,
  TerrainSample,
  Vec2,
  WeightedAsset
} from "./types.js";
