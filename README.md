# three-pcg-biomes

`three-pcg-biomes` is the Three.js rendering layer for biome worlds built on `three-pcg-framework`. It provides terrain helpers, instanced mesh creation, and a first-person controller while delegating PCG-style generation primitives to the framework package.

Use `three-pcg-framework` to define PCG graphs, tagged data, local biome caches, generators, root asset tables, filters, recursive child transforms, and global priority merging. Use `three-pcg-biomes` when those generated points need to become Three.js terrain and instanced renderable objects. The graph executor and UE-style node registry are re-exported here for apps that want one import surface.

```ts
import {
  BiomeFirstPersonController,
  BiomeTerrain,
  createVolumeCache,
  runPCGGraph,
  runGlobalBiomeCore,
  runLocalBiomeCore,
  surfaceScatter
} from "three-pcg-biomes";

const cache = createVolumeCache({
  id: "forest-volume",
  bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }
});

const local = runLocalBiomeCore({
  id: "forest",
  priority: 0,
  cache,
  surface,
  rng,
  generators: [
    {
      id: "trees",
      type: "tree",
      priority: 0,
      generator: surfaceScatter({ id: "tree-surface", count: 500 })
    }
  ],
  assets: [{ id: "oak", generatorType: "tree", bounds: { type: "sphere", radius: 3 } }]
});

const { byAsset } = runGlobalBiomeCore([local]);

const controller = new BiomeFirstPersonController({
  domElement: renderer.domElement,
  camera,
  heightAt: (x, z) => terrain.heightAt(x, z)
});
```

Priority merging follows the PCG Biome Core convention implemented by `three-pcg-framework`: lower biome and generator priority values win, equal priorities can overlap, and `allowOverlap` bypasses the difference pass.

The package also includes a Polygon Biomes Meadow adapter for the local source-art layout:

```ts
import { createMeadowBiome, createMeadowAssetLoader, meadowAssets } from "three-pcg-biomes";

const world = await createMeadowBiome({
  scene,
  renderer,
  camera,
  assetBaseUrl: "/meadow-assets",
  seed: "polygon-meadow"
});
```

`createMeadowBiome` uses `runLocalBiomeCore`/`runGlobalBiomeCore` from `three-pcg-framework` for placement generation, then renders the accepted PCG points with the `three-pcg-biomes` terrain, asset loader, material remapping, and instancing helpers. `createMeadowAssetLoader` and `meadowAssets` are exported for inspection tools and apps that need to load individual FBX assets from the same pack.
