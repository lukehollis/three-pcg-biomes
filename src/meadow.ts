import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { TGALoader } from "three/examples/jsm/loaders/TGALoader.js";
import {
  createVolumeCache,
  densityNoiseFilter,
  edgeGuard,
  pathDistanceFilter,
  pointSet,
  poissonSurfaceScatter,
  radialFilter,
  ringScatter,
  runGlobalBiomeCore,
  runLocalBiomeCore,
  SeededRandom,
  slopeFilter,
  splineScatter,
  surfaceScatter,
  waterDistanceFilter,
  type PCGAssetEntry,
  type PCGGeneratorBinding,
  type PCGPoint,
  type PCGPointFilter,
  type PCGSurface
} from "three-pcg-framework";
import { assetMap, assetUrl, textureUrl, withAssetBase } from "./asset-pack.js";
import { BiomeWorld } from "./biome-world.js";
import { createInstancedGroup } from "./scatter.js";
import { BiomeTerrain } from "./terrain.js";
import type {
  BiomeAssetDescriptor,
  BiomeLoadingEvent,
  BiomeModel,
  BiomePack,
  BiomePlacement,
  BiomeQuality,
  CreateBiomeOptions,
  TerrainOptions,
  Vec2
} from "./types.js";

const UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_ASSET_BASE = "/meadow-assets";
const SOURCE_SCALE = 0.01;

interface MeadowQualitySettings {
  segments: number;
  treeCount: number;
  bushCount: number;
  grassCount: number;
  tallGrassCount: number;
  flowerCount: number;
  rockCount: number;
}

interface MeadowAssetLoaderOptions {
  assetBaseUrl?: string;
  renderer?: THREE.WebGLRenderer;
}

interface MeadowFeature {
  id: string;
  assetId: string;
  x: number;
  z: number;
  rotationY?: number;
  scale?: number;
  radius?: number;
  priority?: number;
  yOffset?: number;
}

export interface MeadowAssetLoaderBundle {
  pack: BiomePack;
  materials: MeadowMaterialFactory;
  loader: MeadowAssetLoader;
}

const QUALITY: Record<BiomeQuality, MeadowQualitySettings> = {
  low: {
    segments: 96,
    treeCount: 24,
    bushCount: 38,
    grassCount: 700,
    tallGrassCount: 220,
    flowerCount: 320,
    rockCount: 32
  },
  medium: {
    segments: 128,
    treeCount: 34,
    bushCount: 52,
    grassCount: 1100,
    tallGrassCount: 360,
    flowerCount: 520,
    rockCount: 46
  },
  high: {
    segments: 160,
    treeCount: 46,
    bushCount: 72,
    grassCount: 1650,
    tallGrassCount: 560,
    flowerCount: 780,
    rockCount: 64
  },
  ultra: {
    segments: 192,
    treeCount: 60,
    bushCount: 92,
    grassCount: 2300,
    tallGrassCount: 820,
    flowerCount: 1100,
    rockCount: 84
  }
};

export const meadowAssets: BiomeAssetDescriptor[] = [
  asset("tree_meadow_01", "SM_Env_Tree_Meadow_01.fbx", "tree", { lod: 1, targetHeight: 13.8, materialHint: "tree-meadow-01", windStrength: 0.24 }),
  asset("tree_meadow_02", "SM_Env_Tree_Meadow_02.fbx", "tree", { lod: 1, targetHeight: 8.7, materialHint: "tree-meadow-02", windStrength: 0.22 }),
  asset("tree_birch_01", "SM_Env_Tree_Birch_01.fbx", "tree", { lod: 1, targetHeight: 9.7, materialHint: "tree-birch-01", windStrength: 0.22 }),
  asset("tree_birch_02", "SM_Env_Tree_Birch_02.fbx", "tree", { lod: 1, targetHeight: 9.2, materialHint: "tree-birch-02", windStrength: 0.22 }),
  asset("tree_birch_03", "SM_Env_Tree_Birch_03.fbx", "tree", { lod: 1, targetHeight: 5.0, materialHint: "tree-birch-03", windStrength: 0.22 }),
  asset("tree_fruit_01", "SM_Env_Tree_Fruit_01.fbx", "tree", { lod: 1, targetHeight: 8.8, materialHint: "tree-fruit-01", windStrength: 0.2 }),
  asset("tree_fruit_02", "SM_Env_Tree_Fruit_02.fbx", "tree", { lod: 1, targetHeight: 8.2, materialHint: "tree-fruit-02", windStrength: 0.2 }),
  asset("tree_fruit_03", "SM_Env_Tree_Fruit_03.fbx", "tree", { lod: 1, targetHeight: 7.5, materialHint: "tree-fruit-03", windStrength: 0.2 }),

  asset("bush_01", "SM_Env_Bush_01.fbx", "bush", { lod: 1, targetHeight: 2.6, materialHint: "bush-01", windStrength: 0.18 }),
  asset("bush_02", "SM_Env_Bush_02.fbx", "bush", { lod: 1, targetHeight: 2.35, materialHint: "bush-02", windStrength: 0.18 }),
  asset("bush_03", "SM_Env_Bush_03.fbx", "bush", { lod: 1, targetHeight: 3.0, materialHint: "bush-03", windStrength: 0.18 }),
  asset("grass_bush_01", "SM_Env_Grass_Bush_01.fbx", "grass", { lod: 1, targetHeight: 1.0, materialHint: "grass-tall", windStrength: 0.35 }),

  asset("grass_short_01", "SM_Env_Grass_Short_Clump_01.fbx", "grass", { lod: 1, materialHint: "grass-short", windStrength: 0.4 }),
  asset("grass_short_02", "SM_Env_Grass_Short_Clump_02.fbx", "grass", { lod: 1, materialHint: "grass-short", windStrength: 0.4 }),
  asset("grass_short_03", "SM_Env_Grass_Short_Clump_03.fbx", "grass", { lod: 2, materialHint: "grass-short", windStrength: 0.4 }),
  asset("grass_med_01", "SM_Env_Grass_Med_Clump_01.fbx", "grass", { lod: 1, materialHint: "grass-mid", windStrength: 0.38 }),
  asset("grass_med_02", "SM_Env_Grass_Med_Clump_02.fbx", "grass", { lod: 1, materialHint: "grass-mid", windStrength: 0.38 }),
  asset("grass_med_03", "SM_Env_Grass_Med_Clump_03.fbx", "grass", { lod: 2, materialHint: "grass-mid", windStrength: 0.38 }),
  asset("grass_tall_01", "SM_Env_Grass_Tall_Clump_01.fbx", "grass", { lod: 1, materialHint: "grass-tall", windStrength: 0.42 }),
  asset("grass_tall_02", "SM_Env_Grass_Tall_Clump_02.fbx", "grass", { lod: 1, materialHint: "grass-tall", windStrength: 0.42 }),
  asset("grass_tall_03", "SM_Env_Grass_Tall_Clump_03.fbx", "grass", { lod: 2, materialHint: "grass-tall", windStrength: 0.42 }),
  asset("grass_tall_04", "SM_Env_Grass_Tall_Clump_04.fbx", "grass", { lod: 2, materialHint: "grass-tall", windStrength: 0.42 }),
  asset("grass_tall_05", "SM_Env_Grass_Tall_Clump_05.fbx", "grass", { lod: 2, materialHint: "grass-tall", windStrength: 0.42 }),
  asset("ground_cover_01", "SM_Env_Ground_Cover_01.fbx", "grass", { materialHint: "ground-cover", windStrength: 0.28 }),
  asset("ground_cover_02", "SM_Env_Ground_Cover_02.fbx", "grass", { materialHint: "ground-cover", windStrength: 0.28 }),
  asset("ground_cover_03", "SM_Env_Ground_Cover_03.fbx", "grass", { materialHint: "ground-cover", windStrength: 0.28 }),

  asset("wildflowers_01", "SM_Env_Wildflowers_01.fbx", "flower", { lod: 1, materialHint: "wildflowers-01", windStrength: 0.32 }),
  asset("wildflowers_02", "SM_Env_Wildflowers_02.fbx", "flower", { lod: 1, materialHint: "wildflowers-02", windStrength: 0.32 }),
  asset("wildflowers_03", "SM_Env_Wildflowers_03.fbx", "flower", { lod: 1, materialHint: "wildflowers-03", windStrength: 0.32 }),
  asset("wildflowers_patch_01", "SM_Env_Wildflowers_Patch_01.fbx", "flower", { lod: 1, materialHint: "wildflowers-01", windStrength: 0.24 }),
  asset("wildflowers_patch_02", "SM_Env_Wildflowers_Patch_02.fbx", "flower", { lod: 1, materialHint: "wildflowers-02", windStrength: 0.24 }),
  asset("wildflowers_patch_03", "SM_Env_Wildflowers_Patch_03.fbx", "flower", { lod: 1, materialHint: "wildflowers-03", windStrength: 0.24 }),
  asset("flowers_flat_01", "SM_Env_Flowers_Flat_01.fbx", "flower", { materialHint: "flowers-flat", windStrength: 0.18 }),
  asset("flowers_flat_02", "SM_Env_Flowers_Flat_02.fbx", "flower", { materialHint: "flowers-flat", windStrength: 0.18 }),
  asset("flowers_flat_03", "SM_Env_Flowers_Flat_03.fbx", "flower", { materialHint: "flowers-flat", windStrength: 0.18 }),
  asset("sunflower_01", "SM_Env_Sunflower_01.fbx", "flower", { lod: 1, materialHint: "sunflower", windStrength: 0.28 }),
  asset("lillies_01", "SM_Env_Lillies_01.fbx", "water", { materialHint: "lillies", windStrength: 0.08 }),
  asset("lillies_02", "SM_Env_Lillies_02.fbx", "water", { materialHint: "lillies", windStrength: 0.08 }),
  asset("lillies_03", "SM_Env_Lillies_03.fbx", "water", { materialHint: "lillies", windStrength: 0.08 }),

  asset("rock_01", "SM_Env_Rock_01.fbx", "rock"),
  asset("rock_02", "SM_Env_Rock_02.fbx", "rock"),
  asset("rock_03", "SM_Env_Rock_03.fbx", "rock"),
  asset("rock_04", "SM_Env_Rock_04.fbx", "rock"),
  asset("rock_05", "SM_Env_Rock_05.fbx", "rock"),
  asset("rock_06", "SM_Env_Rock_06.fbx", "rock"),
  asset("rock_round_01", "SM_Env_Rock_Round_01.fbx", "rock"),
  asset("rock_small_01", "SM_Env_Rock_Small_01.fbx", "rock"),
  asset("rock_small_pile_01", "SM_Env_Rock_Small_Pile_01.fbx", "rock"),
  asset("rock_small_pile_02", "SM_Env_Rock_Small_Pile_02.fbx", "rock"),
  asset("rock_pile_01", "SM_Env_Rock_Pile_01.fbx", "rock"),
  asset("rock_pile_02", "SM_Env_Rock_Pile_02.fbx", "rock"),
  asset("rock_pile_03", "SM_Env_Rock_Pile_03.fbx", "rock"),
  asset("rock_pile_04", "SM_Env_Rock_Pile_04.fbx", "rock"),
  asset("rock_pile_05", "SM_Env_Rock_Pile_05.fbx", "rock"),
  asset("rock_pile_06", "SM_Env_Rock_Pile_06.fbx", "rock"),
  asset("rock_pile_07", "SM_Env_Rock_Pile_07.fbx", "rock"),
  asset("rock_ground_01", "SM_Env_Rock_Ground_01.fbx", "ground"),
  asset("rock_ground_02", "SM_Env_Rock_Ground_02.fbx", "ground"),
  asset("stone_pile_01", "SM_Prop_StonePile_01.fbx", "rock"),
  asset("stone_pile_02", "SM_Prop_StonePile_02.fbx", "rock"),
  asset("stone_pile_03", "SM_Prop_StonePile_03.fbx", "rock"),

  asset("windmill_01", "SM_Bld_Windmill_01.fbx", "prop"),
  asset("windmill_02", "SM_Bld_Windmill_02.fbx", "prop"),
  asset("stone_cabin_01", "SM_Bld_Stone_Cabin_01.fbx", "prop"),
  asset("bridge_01", "SM_Prop_Bridge_01.fbx", "prop"),
  asset("well_01", "SM_Prop_Well_01.fbx", "prop"),
  asset("waterwheel_01", "SM_Prop_WaterWheel_01.fbx", "prop"),
  asset("sign_01", "SM_Prop_Sign_01.fbx", "prop"),
  asset("sign_02", "SM_Prop_Sign_02.fbx", "prop"),
  asset("sign_03", "SM_Prop_Sign_03.fbx", "prop"),
  asset("handcart_01", "SM_Prop_HandCart_01.fbx", "prop"),
  asset("camp_crate_01", "SM_Prop_Camp_Crate_01.fbx", "prop"),
  asset("camp_tent_01", "SM_Prop_Camp_Tent_01.fbx", "prop"),
  asset("scarecrow_01", "SM_Prop_ScareCrow_01.fbx", "prop"),
  asset("wagon_broken_01", "SM_Prop_Wagon_Broken_01.fbx", "prop"),
  asset("birdhouse_01", "SM_Prop_Birdhouse_01.fbx", "prop"),
  asset("birdhouse_02", "SM_Prop_Birdhouse_02.fbx", "prop"),
  asset("fence_01", "SM_Prop_Meadow_Fence_01.fbx", "prop"),
  asset("fence_02", "SM_Prop_Meadow_Fence_02.fbx", "prop"),
  asset("fence_03", "SM_Prop_Meadow_Fence_03.fbx", "prop"),
  asset("fence_04", "SM_Prop_Meadow_Fence_04.fbx", "prop"),
  asset("fence_05", "SM_Prop_Meadow_Fence_05.fbx", "prop"),
  asset("fence_06", "SM_Prop_Meadow_Fence_06.fbx", "prop"),
  asset("fence_07", "SM_Prop_Meadow_Fence_07.fbx", "prop"),
  asset("fence_gate_set_01", "SM_Prop_Meadow_Fence_Gate_Set_01.fbx", "prop"),
  asset("fence_gate_set_02", "SM_Prop_Meadow_Fence_Gate_Set_02.fbx", "prop"),
  asset("fence_post_01", "SM_Prop_Meadow_Fence_Post_01.fbx", "prop"),
  asset("fence_post_02", "SM_Prop_Meadow_Fence_Post_02.fbx", "prop"),
  asset("fence_post_03", "SM_Prop_Meadow_Fence_Post_03.fbx", "prop"),
  asset("stonewall_01", "SM_Prop_StoneWall_01.fbx", "prop"),
  asset("stonewall_02", "SM_Prop_StoneWall_02.fbx", "prop"),
  asset("stonewall_small_01", "SM_Prop_Stonewall_Small_01.fbx", "prop"),
  asset("stonewall_small_02", "SM_Prop_Stonewall_Small_02.fbx", "prop"),
  asset("stonewall_long_01", "SM_Prop_Stonewall_Long_01.fbx", "prop"),
  asset("stonewall_pillar_01", "SM_Prop_Stonewall_Pillar_01.fbx", "prop"),
  asset("stonewall_pillar_02", "SM_Prop_Stonewall_Pillar_02.fbx", "prop"),
  asset("mushroom_01", "SM_Prop_Mushroom_01.fbx", "prop"),
  asset("mushroom_02", "SM_Prop_Mushroom_02.fbx", "prop"),
  asset("mushroom_03", "SM_Prop_Mushroom_03.fbx", "prop"),
  asset("mushroom_group_02", "SM_Prop_Mushroom_Group_02.fbx", "prop"),
  asset("mushroom_group_03", "SM_Prop_Mushroom_Group_03.fbx", "prop"),
  asset("mushroom_group_04", "SM_Prop_Mushroom_Group_04.fbx", "prop"),
  asset("mushroom_group_05", "SM_Prop_Mushroom_Group_05.fbx", "prop"),

  asset("background_hill_01", "SM_Env_Background_Hill_01.fbx", "ground", { castShadow: false, receiveShadow: true }),
  asset("cloud_ring_01", "SM_Env_Cloud_Ring_01.fbx", "sky", { castShadow: false, receiveShadow: false, materialHint: "cloud" }),
  asset("cloud_ring_02", "SM_Env_Cloud_Ring_02.fbx", "sky", { castShadow: false, receiveShadow: false, materialHint: "cloud" }),
  asset("cloud_ring_large_01", "Env_CloudRing_Larger_01_Smooth_03.fbx", "sky", { castShadow: false, receiveShadow: false, materialHint: "cloud" }),
  asset("cloud_ring_large_02", "Env_CloudRing_Larger_02.fbx", "sky", { castShadow: false, receiveShadow: false, materialHint: "cloud" })
];

export const meadowPack: BiomePack = {
  id: "polygon-biomes-meadow",
  label: "Polygon Biomes Meadow",
  assetBaseUrl: DEFAULT_ASSET_BASE,
  fbxRoot: "FBX",
  textureRoot: "Textures",
  sourceScale: SOURCE_SCALE,
  assets: meadowAssets
};

export class MeadowMaterialFactory {
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly tgaLoader = new TGALoader();
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly materials = new Map<string, THREE.Material>();
  private readonly animatedTextures: THREE.Texture[] = [];
  private readonly anisotropy: number;

  constructor(
    readonly pack: BiomePack,
    renderer?: THREE.WebGLRenderer
  ) {
    this.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 4;
  }

  createTerrainMaterial(): THREE.MeshStandardMaterial {
    const map = this.texture("Terrain/Grass_Texture_01.png", { repeat: 28 });
    const normalMap = this.texture("Terrain/Ground_Normals_01.png", { repeat: 28, colorSpace: false });
    const material = new THREE.MeshStandardMaterial({
      name: "MeadowTerrain_Grass",
      map,
      normalMap,
      color: "#b5cc62",
      roughness: 0.92,
      metalness: 0,
      vertexColors: true
    });
    material.normalScale.set(0.28, 0.28);
    return material;
  }

  createPathMaterial(): THREE.MeshStandardMaterial {
    const map = this.texture("Terrain/Footpath_Tiles_Texture_01.png", { repeat: 12 });
    const normalMap = this.texture("Terrain/Footpath_Tiles_Normals_01.png", { repeat: 12, colorSpace: false });
    const material = new THREE.MeshStandardMaterial({
      name: "MeadowTerrain_Footpath",
      map,
      normalMap,
      color: "#d6c08b",
      roughness: 0.96,
      metalness: 0
    });
    material.normalScale.set(0.36, 0.36);
    return material;
  }

  createWaterMaterial(): THREE.MeshPhysicalMaterial {
    const normalMap = this.texture("Core/WaterNormals_01.png", { repeat: 8, colorSpace: false });
    const material = new THREE.MeshPhysicalMaterial({
      name: "MeadowPond_Water",
      color: "#7db5b8",
      normalMap,
      roughness: 0.16,
      metalness: 0,
      transmission: 0.08,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    });
    material.normalScale.set(0.18, 0.18);
    this.animatedTextures.push(normalMap);
    return material;
  }

  materialFor(asset: BiomeAssetDescriptor, mesh: THREE.Mesh): THREE.Material {
    const meshName = mesh.name.toLowerCase();
    const hint = asset.materialHint ?? asset.category;
    const cardTexture = treeCardTexture(asset.id, meshName);
    if (cardTexture) {
      return this.foliageMaterial(`card:${asset.id}`, cardTexture, "#ffffff", asset.windStrength ?? 0.2, 0.28);
    }
    if (meshName.includes("branches")) {
      return this.foliageMaterial(`branches:${hint}`, hint.includes("birch") ? "Plants/Branches_02.tga" : "Plants/Branches_01.tga", "#eef2c5", asset.windStrength ?? 0.18, 0.36);
    }
    if (asset.category === "grass") {
      return this.foliageMaterial(`grass:${hint}`, grassTexture(hint), "#b5d870", asset.windStrength ?? 0.34, 0.42);
    }
    if (asset.category === "flower") {
      return this.foliageMaterial(`flower:${hint}`, flowerTexture(hint), "#ffffff", asset.windStrength ?? 0.28, 0.36);
    }
    if (asset.category === "bush") {
      return this.foliageMaterial(`bush:${hint}`, bushTexture(hint), "#d4e29b", asset.windStrength ?? 0.16, 0.34);
    }
    if (asset.category === "water") {
      return this.foliageMaterial(`waterplant:${hint}`, "Plants/LillyPads_Medows_01.tga", "#ffffff", asset.windStrength ?? 0.06, 0.3);
    }
    if (asset.category === "sky" || hint === "cloud") {
      return this.cloudMaterial();
    }
    if (asset.category === "tree") {
      return this.atlasMaterial(`tree:${hint}`, "#ffffff", true);
    }
    if (asset.category === "rock" || asset.category === "ground") {
      return this.atlasMaterial("stone-ground", "#d0c7a4", false);
    }
    return this.atlasMaterial("props", "#ffffff", false);
  }

  tick(deltaSeconds: number): void {
    for (const texture of this.animatedTextures) {
      texture.offset.x = (texture.offset.x + deltaSeconds * 0.018) % 1;
      texture.offset.y = (texture.offset.y + deltaSeconds * 0.011) % 1;
    }
  }

  dispose(): void {
    for (const material of this.materials.values()) {
      material.dispose();
    }
    for (const texture of this.textures.values()) {
      texture.dispose();
    }
  }

  private atlasMaterial(key: string, tint: THREE.ColorRepresentation, alphaTest: boolean): THREE.MeshStandardMaterial {
    return this.getMaterial(`atlas:${key}:${alphaTest}`, () => {
      const material = new THREE.MeshStandardMaterial({
        name: `MeadowAtlas_${key}`,
        map: this.texture("PolygonNatureBiomes_Meadow_Texture_01.png"),
        color: tint,
        roughness: 0.86,
        metalness: 0,
        side: alphaTest ? THREE.DoubleSide : THREE.FrontSide,
        alphaTest: alphaTest ? 0.28 : 0
      });
      return material;
    }) as THREE.MeshStandardMaterial;
  }

  private foliageMaterial(
    key: string,
    texturePath: string,
    tint: THREE.ColorRepresentation,
    windStrength: number,
    alphaTest: number
  ): THREE.MeshStandardMaterial {
    return this.getMaterial(`foliage:${key}:${texturePath}`, () => {
      const material = new THREE.MeshStandardMaterial({
        name: `MeadowFoliage_${key}`,
        map: this.texture(texturePath),
        color: tint,
        emissive: tint,
        emissiveIntensity: key.includes("grass") ? 0.22 : 0.14,
        roughness: 0.88,
        metalness: 0,
        side: THREE.DoubleSide,
        alphaTest
      });
      material.userData.windStrength = windStrength;
      return material;
    }) as THREE.MeshStandardMaterial;
  }

  private cloudMaterial(): THREE.MeshBasicMaterial {
    return this.getMaterial("cloud", () => {
      return new THREE.MeshBasicMaterial({
        name: "MeadowCloud",
        color: "#eef8f1",
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
        side: THREE.DoubleSide
      });
    }) as THREE.MeshBasicMaterial;
  }

  private texture(path: string, options: { repeat?: number; colorSpace?: boolean } = {}): THREE.Texture {
    const key = `${path}:${options.repeat ?? 1}:${options.colorSpace ?? true}`;
    const existing = this.textures.get(key);
    if (existing) {
      return existing;
    }
    const url = textureUrl(this.pack, path);
    const loader = path.toLowerCase().endsWith(".tga") ? this.tgaLoader : this.textureLoader;
    const texture = loader.load(url);
    texture.name = path;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const repeat = options.repeat ?? 1;
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = this.anisotropy;
    if (options.colorSpace ?? true) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    this.textures.set(key, texture);
    return texture;
  }

  private getMaterial(key: string, create: () => THREE.Material): THREE.Material {
    const existing = this.materials.get(key);
    if (existing) {
      return existing;
    }
    const material = create();
    this.materials.set(key, material);
    return material;
  }
}

export class MeadowAssetLoader {
  private readonly fbxLoader: FBXLoader;
  private readonly descriptors: Map<string, BiomeAssetDescriptor>;
  private readonly modelPromises = new Map<string, Promise<BiomeModel>>();

  constructor(
    readonly pack: BiomePack,
    private readonly materials: MeadowMaterialFactory
  ) {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => this.rewriteFbxTextureUrl(url));
    this.fbxLoader = new FBXLoader(manager);
    this.descriptors = assetMap(pack);
  }

  load(assetId: string): Promise<BiomeModel> {
    const existing = this.modelPromises.get(assetId);
    if (existing) {
      return existing;
    }
    const descriptor = this.descriptors.get(assetId);
    if (!descriptor) {
      return Promise.reject(new Error(`Unknown meadow asset "${assetId}".`));
    }
    const promise = this.loadDescriptor(descriptor);
    this.modelPromises.set(assetId, promise);
    return promise;
  }

  async preload(assetIds: Iterable<string>, onProgress?: (loaded: number, total: number, assetId: string) => void): Promise<Map<string, BiomeModel>> {
    const ids = [...new Set(assetIds)];
    const loaded = new Map<string, BiomeModel>();
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      if (!id) {
        continue;
      }
      const model = await this.load(id);
      loaded.set(id, model);
      onProgress?.(index + 1, ids.length, id);
    }
    return loaded;
  }

  private async loadDescriptor(assetDescriptor: BiomeAssetDescriptor): Promise<BiomeModel> {
    const object = await this.fbxLoader.loadAsync(assetUrl(this.pack, assetDescriptor));
    object.name = assetDescriptor.id;
    object.scale.setScalar(assetDescriptor.sourceScale ?? this.pack.sourceScale);
    object.updateMatrixWorld(true);

    const renderMeshes = selectRenderMeshes(object, assetDescriptor);
    for (const mesh of renderMeshes) {
      mesh.castShadow =
        assetDescriptor.castShadow ??
        (assetDescriptor.category !== "grass" && assetDescriptor.category !== "flower" && assetDescriptor.category !== "sky");
      mesh.receiveShadow = assetDescriptor.receiveShadow ?? assetDescriptor.category !== "sky";
      mesh.material = this.materials.materialFor(assetDescriptor, mesh);
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
    object.updateMatrixWorld(true);

    const bounds = new THREE.Box3();
    for (const mesh of renderMeshes) {
      bounds.union(new THREE.Box3().setFromObject(mesh));
    }
    const naturalSize = bounds.getSize(new THREE.Vector3());
    const normalizeScale = assetDescriptor.targetHeight && naturalSize.y > 0 ? assetDescriptor.targetHeight / naturalSize.y : 1;

    return {
      asset: assetDescriptor,
      object,
      renderMeshes,
      naturalSize,
      baseY: Number.isFinite(bounds.min.y) ? bounds.min.y : 0,
      normalizeScale
    };
  }

  private rewriteFbxTextureUrl(url: string): string {
    if (/\.fbx($|\?)/i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
      return url;
    }
    const rawName = decodeURIComponent(url.split(/[\\/]/).pop()?.split("?")[0] ?? "").toLowerCase();
    const texture = FBX_TEXTURE_REDIRECTS.get(rawName) ?? fallbackFbxTexture(rawName);
    return texture ? textureUrl(this.pack, texture) : url;
  }
}

export function createMeadowAssetLoader(options: MeadowAssetLoaderOptions = {}): MeadowAssetLoaderBundle {
  const pack = withAssetBase(meadowPack, options.assetBaseUrl ?? DEFAULT_ASSET_BASE);
  const materials = new MeadowMaterialFactory(pack, options.renderer);
  const loader = new MeadowAssetLoader(pack, materials);
  return { pack, materials, loader };
}

export async function createMeadowBiome(options: CreateBiomeOptions): Promise<BiomeWorld> {
  const size = options.size ?? 190;
  const quality = options.quality ?? "high";
  const qualitySettings = QUALITY[quality];
  const seed = options.seed ?? "polygon-biomes-meadow";
  const pathPoints = meadowPath(size);
  const loaderOptions: MeadowAssetLoaderOptions = { assetBaseUrl: options.assetBaseUrl ?? DEFAULT_ASSET_BASE };
  if (options.renderer) {
    loaderOptions.renderer = options.renderer;
  }
  const { pack, materials, loader } = createMeadowAssetLoader(loaderOptions);

  options.onProgress?.({ loaded: 0, total: 1, url: "terrain", progress: 0, phase: "terrain" });
  const terrain = new BiomeTerrain(
    {
      seed,
      size,
      segments: qualitySettings.segments,
      heightScale: 5.2,
      pathWidth: 5.7,
      waterCenter: { x: -size * 0.2, z: size * 0.12 },
      waterRadius: size * 0.105,
      pathPoints
    },
    materials.createTerrainMaterial(),
    materials.createPathMaterial(),
    materials.createWaterMaterial()
  );

  const world = new BiomeWorld(pack, terrain, materials, loader).addTo(options.scene);
  setupEnvironment(options.scene, size);
  if (options.camera) {
    options.camera.position.set(16, terrain.heightAt(16, 34) + 1.7, 34);
    options.camera.lookAt(8, terrain.heightAt(8, 12) + 1.4, 12);
  }

  const placements = createMeadowPlacements({
    terrain,
    size,
    seed,
    quality: qualitySettings,
    pathPoints
  });
  const skyPlacements = createSkyPlacements(size);
  const allPlacements = [...placements, ...skyPlacements];
  const requiredAssetIds = allPlacements.map((placement) => placement.assetId);
  const loadedModels = await loader.preload(requiredAssetIds, (loaded, total, assetId) => {
    options.onProgress?.({
      loaded,
      total,
      url: assetId,
      progress: loaded / Math.max(1, total),
      phase: "assets"
    });
  });

  const grouped = groupBiomePlacements(allPlacements);
  for (const [assetId, assetPlacements] of grouped) {
    const model = loadedModels.get(assetId);
    if (!model || assetPlacements.length === 0) {
      continue;
    }
    world.group.add(createInstancedGroup(model, assetPlacements));
  }

  options.onProgress?.({ loaded: requiredAssetIds.length, total: requiredAssetIds.length, url: "complete", progress: 1, phase: "complete" });
  return world;
}

function createMeadowPlacements(options: {
  terrain: BiomeTerrain;
  size: number;
  seed: string | number;
  quality: MeadowQualitySettings;
  pathPoints: Vec2[];
}): BiomePlacement[] {
  const bounds = centeredBounds(options.size);
  const cache = createVolumeCache({ id: "polygon-meadow-volume", bounds });
  const rng = new SeededRandom(options.seed);
  const generators: PCGGeneratorBinding[] = [];
  const assets: PCGAssetEntry[] = [];

  addFeatureGenerators(generators, assets, coreFeatures(options.size));
  addFenceLine(generators, assets, "fence-west", "fence_03", { x: -64, z: 18 }, { x: -18, z: 8 }, -80);
  addFenceLine(generators, assets, "fence-east", "fence_04", { x: 38, z: -6 }, { x: 76, z: 10 }, -80);
  addFenceLine(generators, assets, "stone-wall", "stonewall_small_01", { x: -16, z: -28 }, { x: 28, z: -38 }, -75, 4.8);

  const flatOpen = [edgeGuard(0.98), slopeFilter(0.5), waterDistanceFilter(2.2)];
  const awayFromPath = [pathDistanceFilter(8), waterDistanceFilter(5), slopeFilter(0.42), edgeGuard(0.96)];
  const woodland = [pathDistanceFilter(12), waterDistanceFilter(5), radialFilter(0.28, 0.95), densityNoiseFilter(-0.35, 0.68, "moisture"), slopeFilter(0.5)];
  const flowers = [pathDistanceFilter(1.8), waterDistanceFilter(2.5), densityNoiseFilter(-0.05, 0.72, "flower"), slopeFilter(0.48), edgeGuard(0.97)];
  const pathFlowers = [pathDistanceFilter(1.2, 9.5), waterDistanceFilter(2.5), slopeFilter(0.46)];

  generators.push(
    {
      id: "canopy",
      type: "tree",
      priority: 0,
      generator: poissonSurfaceScatter({ id: "canopy-points", count: options.quality.treeCount, radius: 8.5, maxAttempts: options.quality.treeCount * 40 })
    },
    {
      id: "rocks",
      type: "rock",
      priority: 4,
      generator: poissonSurfaceScatter({ id: "rock-points", count: options.quality.rockCount, radius: 5.2, maxAttempts: options.quality.rockCount * 34 })
    },
    {
      id: "shrubs",
      type: "bush",
      priority: 8,
      generator: poissonSurfaceScatter({ id: "shrub-points", count: options.quality.bushCount, radius: 3.5, maxAttempts: options.quality.bushCount * 32 })
    },
    {
      id: "ground-grass",
      type: "grass",
      priority: 20,
      allowOverlap: true,
      generator: surfaceScatter({ id: "grass-points", count: options.quality.grassCount, jitter: 1.1 })
    },
    {
      id: "tall-grass",
      type: "tall-grass",
      priority: 18,
      allowOverlap: true,
      generator: surfaceScatter({ id: "tall-grass-points", count: options.quality.tallGrassCount, jitter: 1.05 })
    },
    {
      id: "wildflowers",
      type: "flower",
      priority: 22,
      allowOverlap: true,
      generator: surfaceScatter({ id: "flower-points", count: options.quality.flowerCount, jitter: 1.15 })
    },
    {
      id: "path-bloom",
      type: "path-flower",
      priority: 19,
      allowOverlap: true,
      generator: splineScatter({ id: "path-bloom-points", points: options.pathPoints, count: Math.round(options.quality.flowerCount * 0.28), radius: 7.5, jitter: 1.0 })
    },
    {
      id: "pond-lillies",
      type: "water-plant",
      priority: 18,
      allowOverlap: true,
      generator: ringScatter({
        id: "pond-lillies-points",
        center: options.terrain.pondCenter,
        innerRadius: options.terrain.pondRadius * 0.12,
        outerRadius: options.terrain.pondRadius * 0.82,
        count: 24
      })
    }
  );

  assets.push(
    pcgAsset("tree_meadow_01", "tree", 2.8, { min: 0.86, max: 1.12 }, { type: "sphere", radius: 7.2 }, woodland, false, 0, 0),
    pcgAsset("tree_meadow_02", "tree", 4.2, { min: 0.92, max: 1.26 }, { type: "sphere", radius: 4.8 }, woodland, false, 0, 0),
    pcgAsset("tree_birch_01", "tree", 1.2, { min: 0.88, max: 1.14 }, { type: "sphere", radius: 3.8 }, woodland, false, 0, 0),
    pcgAsset("tree_birch_02", "tree", 1.4, { min: 0.9, max: 1.16 }, { type: "sphere", radius: 3.8 }, woodland, false, 0, 0),
    pcgAsset("tree_birch_03", "tree", 1.0, { min: 0.9, max: 1.2 }, { type: "sphere", radius: 2.3 }, woodland, false, 0, 0),
    pcgAsset("tree_fruit_01", "tree", 1.0, { min: 0.92, max: 1.16 }, { type: "sphere", radius: 4.2 }, woodland, false, 0, 0),
    pcgAsset("tree_fruit_02", "tree", 0.9, { min: 0.92, max: 1.16 }, { type: "sphere", radius: 4.2 }, woodland, false, 0, 0),
    pcgAsset("tree_fruit_03", "tree", 0.8, { min: 0.92, max: 1.16 }, { type: "sphere", radius: 3.7 }, woodland, false, 0, 0),

    pcgAsset("rock_01", "rock", 2, { min: 0.8, max: 1.55 }, { type: "sphere", radius: 1.4 }, awayFromPath, false, 0, 4),
    pcgAsset("rock_02", "rock", 1.4, { min: 0.8, max: 1.5 }, { type: "sphere", radius: 1.55 }, awayFromPath, false, 0, 4),
    pcgAsset("rock_03", "rock", 0.9, { min: 0.75, max: 1.3 }, { type: "sphere", radius: 1.9 }, awayFromPath, false, 0, 4),
    pcgAsset("rock_round_01", "rock", 1.6, { min: 0.85, max: 1.45 }, { type: "sphere", radius: 1.7 }, awayFromPath, false, 0, 4),
    pcgAsset("rock_small_pile_01", "rock", 2.8, { min: 0.8, max: 1.5 }, { type: "sphere", radius: 0.85 }, flatOpen, true, 0, 4),
    pcgAsset("rock_small_pile_02", "rock", 2.4, { min: 0.8, max: 1.5 }, { type: "sphere", radius: 0.75 }, flatOpen, true, 0, 4),
    pcgAsset("rock_pile_04", "rock", 0.5, { min: 0.7, max: 1.05 }, { type: "sphere", radius: 3.2 }, awayFromPath, false, 0, 4),

    pcgAsset("bush_01", "bush", 2.2, { min: 0.78, max: 1.25 }, { type: "sphere", radius: 1.7 }, awayFromPath, false, 0, 8),
    pcgAsset("bush_02", "bush", 1.5, { min: 0.74, max: 1.2 }, { type: "sphere", radius: 2.4 }, awayFromPath, false, 0, 8),
    pcgAsset("bush_03", "bush", 1.3, { min: 0.72, max: 1.08 }, { type: "sphere", radius: 2.6 }, awayFromPath, false, 0, 8),
    pcgAsset("grass_bush_01", "bush", 1.6, { min: 0.8, max: 1.4 }, { type: "sphere", radius: 1.1 }, flatOpen, true, 0, 8),

    pcgAsset("grass_short_01", "grass", 2, { min: 0.75, max: 1.35 }, { type: "sphere", radius: 0.45 }, flatOpen, true, 0.015, 20),
    pcgAsset("grass_short_02", "grass", 2, { min: 0.75, max: 1.35 }, { type: "sphere", radius: 0.55 }, flatOpen, true, 0.015, 20),
    pcgAsset("grass_short_03", "grass", 1.7, { min: 0.75, max: 1.35 }, { type: "sphere", radius: 0.55 }, flatOpen, true, 0.015, 20),
    pcgAsset("grass_med_01", "grass", 1.5, { min: 0.7, max: 1.28 }, { type: "sphere", radius: 0.6 }, flatOpen, true, 0.015, 20),
    pcgAsset("grass_med_02", "grass", 1.6, { min: 0.7, max: 1.28 }, { type: "sphere", radius: 0.8 }, flatOpen, true, 0.015, 20),
    pcgAsset("ground_cover_01", "grass", 0.8, { min: 0.8, max: 1.25 }, { type: "sphere", radius: 0.8 }, flowers, true, 0.015, 20),

    pcgAsset("grass_tall_01", "tall-grass", 1.4, { min: 0.75, max: 1.3 }, { type: "sphere", radius: 0.7 }, awayFromPath, true, 0.015, 18),
    pcgAsset("grass_tall_02", "tall-grass", 1.8, { min: 0.75, max: 1.3 }, { type: "sphere", radius: 0.95 }, awayFromPath, true, 0.015, 18),
    pcgAsset("grass_tall_03", "tall-grass", 1.6, { min: 0.75, max: 1.25 }, { type: "sphere", radius: 0.95 }, awayFromPath, true, 0.015, 18),
    pcgAsset("grass_tall_04", "tall-grass", 0.8, { min: 0.75, max: 1.12 }, { type: "sphere", radius: 2.1 }, awayFromPath, true, 0.015, 18),
    pcgAsset("grass_tall_05", "tall-grass", 0.45, { min: 0.65, max: 0.96 }, { type: "sphere", radius: 3.4 }, awayFromPath, true, 0.015, 18),

    pcgAsset("wildflowers_01", "flower", 1.4, { min: 0.75, max: 1.25 }, { type: "sphere", radius: 0.42 }, flowers, true, 0.018, 22),
    pcgAsset("wildflowers_02", "flower", 1.2, { min: 0.75, max: 1.25 }, { type: "sphere", radius: 0.42 }, flowers, true, 0.018, 22),
    pcgAsset("wildflowers_03", "flower", 1.1, { min: 0.75, max: 1.25 }, { type: "sphere", radius: 0.42 }, flowers, true, 0.018, 22),
    pcgAsset("flowers_flat_01", "flower", 0.65, { min: 0.55, max: 1.05 }, { type: "sphere", radius: 1.05 }, flowers, true, 0.02, 22),
    pcgAsset("flowers_flat_02", "flower", 0.65, { min: 0.55, max: 1.05 }, { type: "sphere", radius: 1.05 }, flowers, true, 0.02, 22),
    pcgAsset("flowers_flat_03", "flower", 0.65, { min: 0.55, max: 1.05 }, { type: "sphere", radius: 1.05 }, flowers, true, 0.02, 22),
    pcgAsset("path_sunflower_01", "path-flower", 0.9, { min: 0.82, max: 1.18 }, { type: "sphere", radius: 0.48 }, pathFlowers, true, 0.02, 19, "sunflower_01"),
    pcgAsset("path_wildflowers_01", "path-flower", 1.8, { min: 0.82, max: 1.24 }, { type: "sphere", radius: 0.42 }, pathFlowers, true, 0.02, 19, "wildflowers_01"),
    pcgAsset("path_wildflowers_02", "path-flower", 1.7, { min: 0.82, max: 1.24 }, { type: "sphere", radius: 0.42 }, pathFlowers, true, 0.02, 19, "wildflowers_02"),
    pcgAsset("lillies_01", "water-plant", 1.1, { min: 0.8, max: 1.35 }, { type: "sphere", radius: 0.85 }, [], true, options.terrain.pondSurfaceY - options.terrain.heightAt(options.terrain.pondCenter.x, options.terrain.pondCenter.z) + 0.03, 18),
    pcgAsset("lillies_02", "water-plant", 1, { min: 0.8, max: 1.35 }, { type: "sphere", radius: 0.85 }, [], true, options.terrain.pondSurfaceY - options.terrain.heightAt(options.terrain.pondCenter.x, options.terrain.pondCenter.z) + 0.03, 18),
    pcgAsset("lillies_03", "water-plant", 0.8, { min: 0.8, max: 1.35 }, { type: "sphere", radius: 0.85 }, [], true, options.terrain.pondSurfaceY - options.terrain.heightAt(options.terrain.pondCenter.x, options.terrain.pondCenter.z) + 0.03, 18)
  );

  const local = runLocalBiomeCore({
    id: "polygon-meadow",
    priority: 0,
    cache,
    surface: options.terrain as unknown as PCGSurface,
    rng,
    generators,
    assets,
    assetSelectionSeed: options.seed,
    rootFilters: [edgeGuard(0.995)],
    maxChildDepth: 2
  });
  const global = runGlobalBiomeCore([local], { padding: 0.15 });
  return global.points.map((point) => pointToPlacement(point, assets));
}

function setupEnvironment(scene: THREE.Scene, size: number): void {
  scene.background = new THREE.Color("#9fc6e5");
  scene.fog = new THREE.FogExp2("#b6d2df", 0.0045);
  const hemisphere = new THREE.HemisphereLight("#eaf7ff", "#6f8751", 2.15);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight("#fff0ca", 3.2);
  sun.position.set(-size * 0.28, size * 0.55, size * 0.22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = size * 1.2;
  sun.shadow.camera.left = -size * 0.55;
  sun.shadow.camera.right = size * 0.55;
  sun.shadow.camera.top = size * 0.55;
  sun.shadow.camera.bottom = -size * 0.55;
  scene.add(sun);
}

function createSkyPlacements(size: number): BiomePlacement[] {
  return [
    placement("background_hill_01", -size * 0.42, -size * 0.58, 0.2, 2.8),
    placement("background_hill_01", size * 0.32, -size * 0.54, -0.4, 2.4),
    placement("background_hill_01", -size * 0.55, size * 0.36, 2.8, 2.6),
    placement("cloud_ring_01", -size * 0.22, -size * 0.35, 0.2, 3.6, size * 0.28),
    placement("cloud_ring_02", size * 0.24, -size * 0.22, -0.4, 3.1, size * 0.32),
    placement("cloud_ring_large_01", -size * 0.5, size * 0.1, 0.15, 4.2, size * 0.35),
    placement("cloud_ring_large_02", size * 0.52, size * 0.2, -0.25, 4.0, size * 0.34)
  ];
}

function pointToPlacement(point: PCGPoint, assets: PCGAssetEntry[]): BiomePlacement {
  const asset = assets.find((entry) => entry.id === point.assetId && entry.generatorType === point.generatorType);
  const orientUpward = asset?.orientUpward ?? true;
  const renderAssetId = typeof point.attributes.renderAssetId === "string" ? point.attributes.renderAssetId : point.assetId;
  return {
    assetId: renderAssetId ?? "grass_short_01",
    position: point.position.clone(),
    rotationY: point.rotationY,
    scale: point.scale.clone(),
    normal: orientUpward ? UP.clone() : point.normal.clone()
  };
}

function addFeatureGenerators(generators: PCGGeneratorBinding[], assets: PCGAssetEntry[], features: MeadowFeature[]): void {
  for (const feature of features) {
    generators.push({
      id: feature.id,
      type: feature.id,
      priority: feature.priority ?? -100,
      generator: pointSet(feature.id, [{ x: feature.x, z: feature.z, rotationY: feature.rotationY ?? 0 }])
    });
    assets.push({
      id: feature.id,
      generator: feature.id,
      generatorType: feature.id,
      weight: 1,
      priority: feature.priority ?? -100,
      bounds: { type: "sphere", radius: feature.radius ?? 2 },
      scale: { min: feature.scale ?? 1, max: feature.scale ?? 1 },
      orientUpward: true,
      yOffset: feature.yOffset ?? 0,
      attributes: { renderAssetId: feature.assetId }
    });
  }
}

function addFenceLine(
  generators: PCGGeneratorBinding[],
  assets: PCGAssetEntry[],
  id: string,
  assetId: string,
  start: Vec2,
  end: Vec2,
  priority: number,
  spacing = 2.7
): void {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const count = Math.max(2, Math.floor(length / spacing));
  const rotationY = Math.atan2(dx, dz) + Math.PI / 2;
  const points: Array<{ x: number; z: number; rotationY: number }> = [];
  for (let index = 0; index <= count; index += 1) {
    const t = index / count;
    points.push({
      x: THREE.MathUtils.lerp(start.x, end.x, t),
      z: THREE.MathUtils.lerp(start.z, end.z, t),
      rotationY
    });
  }
  generators.push({ id, type: id, priority, generator: pointSet(id, points) });
  assets.push({
    id,
    generator: id,
    generatorType: id,
    weight: 1,
    priority,
    bounds: { type: "sphere", radius: 1.3 },
    scale: { min: 1, max: 1 },
    orientUpward: true,
    attributes: { renderAssetId: assetId }
  });
}

function pcgAsset(
  id: string,
  generatorType: string,
  weight: number,
  scale: { min: number; max: number },
  bounds: NonNullable<PCGAssetEntry["bounds"]>,
  filters: PCGPointFilter[],
  allowOverlap: boolean,
  yOffset: number,
  priority: number,
  renderAssetId = id
): PCGAssetEntry {
  const entry: PCGAssetEntry = {
    id,
    generatorType,
    weight,
    priority,
    bounds,
    scale,
    verticalScale: { min: 0.9, max: 1.12 },
    filters,
    allowOverlap,
    yOffset,
    orientUpward: true
  };
  if (renderAssetId !== id) {
    entry.attributes = { renderAssetId };
  }
  return entry;
}

function groupBiomePlacements(placements: BiomePlacement[]): Map<string, BiomePlacement[]> {
  const grouped = new Map<string, BiomePlacement[]>();
  for (const placement of placements) {
    const bucket = grouped.get(placement.assetId) ?? [];
    bucket.push(placement);
    grouped.set(placement.assetId, bucket);
  }
  return grouped;
}

function coreFeatures(size: number): MeadowFeature[] {
  void size;
  return [
    { id: "feature-oak-canopy", assetId: "tree_meadow_01", x: 26, z: 28, rotationY: -0.4, scale: 0.96, radius: 7.5, priority: -130 },
    { id: "feature-oak-path", assetId: "tree_meadow_02", x: -34, z: 12, rotationY: 0.9, scale: 1.04, radius: 4.8, priority: -125 },
    { id: "feature-birch-pair-a", assetId: "tree_birch_01", x: 50, z: -12, rotationY: 0.4, scale: 0.95, radius: 3.8, priority: -120 },
    { id: "feature-birch-pair-b", assetId: "tree_birch_03", x: 56, z: -7, rotationY: -0.2, scale: 1.1, radius: 2.4, priority: -119 },
    { id: "feature-windmill", assetId: "windmill_01", x: -54, z: -36, rotationY: 0.5, scale: 1.08, radius: 7.5, priority: -150 },
    { id: "feature-sign", assetId: "sign_01", x: 7.5, z: 22, rotationY: Math.PI * 0.82, scale: 0.95, radius: 1.2, priority: -118 },
    { id: "feature-handcart", assetId: "handcart_01", x: 12, z: 16, rotationY: -0.55, scale: 1, radius: 1.8, priority: -116 },
    { id: "feature-crate", assetId: "camp_crate_01", x: 14.4, z: 14.2, rotationY: 0.35, scale: 0.92, radius: 0.9, priority: -116 },
    { id: "feature-well", assetId: "well_01", x: -18, z: 35, rotationY: 1.4, scale: 0.9, radius: 2.2, priority: -116 },
    { id: "feature-mushrooms", assetId: "mushroom_group_03", x: 24, z: -18, rotationY: 1.9, scale: 1.1, radius: 1.2, priority: -90 },
    { id: "feature-rock-ground", assetId: "rock_ground_02", x: -2, z: 3, rotationY: -0.25, scale: 1.14, radius: 6.4, priority: -110 },
    { id: "feature-rock-pile", assetId: "rock_pile_04", x: -18, z: 2, rotationY: 0.75, scale: 0.76, radius: 3.2, priority: -108 },
    { id: "feature-gate", assetId: "fence_gate_set_01", x: -40, z: 13, rotationY: -1.35, scale: 1, radius: 1.6, priority: -100 },
    { id: "feature-sunflowers", assetId: "sunflower_01", x: 5, z: 17, rotationY: 0.25, scale: 1.15, radius: 0.6, priority: -40 },
    { id: "feature-flower-patch", assetId: "wildflowers_patch_02", x: 18, z: 8, rotationY: -0.2, scale: 0.38, radius: 2.8, priority: -35 },
    { id: "feature-flower-patch-red", assetId: "wildflowers_patch_03", x: -24, z: 18, rotationY: 0.4, scale: 0.3, radius: 2.3, priority: -35 }
  ];
}

function meadowPath(size: number): Vec2[] {
  const s = size / 2;
  return [
    { x: -s * 0.92, z: s * 0.12 },
    { x: -s * 0.62, z: s * 0.04 },
    { x: -s * 0.3, z: -s * 0.02 },
    { x: -s * 0.05, z: -s * 0.13 },
    { x: s * 0.18, z: -s * 0.1 },
    { x: s * 0.48, z: s * 0.02 },
    { x: s * 0.9, z: s * 0.11 }
  ];
}

function centeredBounds(size: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const half = size / 2;
  return { minX: -half, maxX: half, minZ: -half, maxZ: half };
}

function placement(assetId: string, x: number, z: number, rotationY: number, scale: number, y = 0): BiomePlacement {
  return {
    assetId,
    position: new THREE.Vector3(x, y, z),
    rotationY,
    scale: new THREE.Vector3(scale, scale, scale),
    normal: UP.clone()
  };
}

function asset(
  id: string,
  file: string,
  category: BiomeAssetDescriptor["category"],
  options: Partial<BiomeAssetDescriptor> = {}
): BiomeAssetDescriptor {
  return {
    id,
    file,
    category,
    sourceScale: SOURCE_SCALE,
    castShadow: category !== "grass" && category !== "flower" && category !== "sky",
    receiveShadow: category !== "sky",
    ...options
  };
}

function selectRenderMeshes(object: THREE.Group, assetDescriptor: BiomeAssetDescriptor): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const lods = new Set<number>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) {
      return;
    }
    meshes.push(mesh);
    const lod = lodOf(mesh.name);
    if (lod !== undefined) {
      lods.add(lod);
    }
  });
  if (meshes.length === 0) {
    throw new Error(`Meadow asset "${assetDescriptor.id}" did not contain renderable meshes.`);
  }
  const selectedLod = selectLod(lods, assetDescriptor);
  const renderMeshes = meshes.filter((mesh) => {
    const lod = lodOf(mesh.name);
    const visible = selectedLod === undefined || lod === undefined || lod === selectedLod;
    mesh.visible = visible;
    return visible;
  });
  return renderMeshes.length ? renderMeshes : meshes;
}

function selectLod(lods: Set<number>, assetDescriptor: BiomeAssetDescriptor): number | undefined {
  if (lods.size === 0) {
    return undefined;
  }
  const sorted = [...lods].sort((a, b) => a - b);
  const preferred = assetDescriptor.lod ?? defaultLod(assetDescriptor.category);
  return sorted.includes(preferred) ? preferred : sorted.reduce((best, lod) => (Math.abs(lod - preferred) < Math.abs(best - preferred) ? lod : best), sorted[0] ?? preferred);
}

function defaultLod(category: BiomeAssetDescriptor["category"]): number {
  if (category === "tree" || category === "bush") {
    return 1;
  }
  if (category === "grass" || category === "flower") {
    return 1;
  }
  return 0;
}

function lodOf(name: string): number | undefined {
  const match = /_LOD(\d+)/i.exec(name);
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
}

function treeCardTexture(assetId: string, meshName: string): string | undefined {
  if (!meshName.includes("lod3")) {
    return undefined;
  }
  if (assetId === "tree_meadow_01") {
    return "LOD_Cards/treeMeadow_01.tga";
  }
  if (assetId === "tree_meadow_02") {
    return "LOD_Cards/treeMeadow_02.tga";
  }
  if (assetId === "tree_birch_01") {
    return "LOD_Cards/treeBirch_01.tga";
  }
  if (assetId === "tree_birch_02") {
    return "LOD_Cards/treeBirch_02.tga";
  }
  if (assetId === "tree_birch_03") {
    return "LOD_Cards/treeBirch_03.tga";
  }
  if (assetId === "tree_fruit_01") {
    return "LOD_Cards/treeFruit_01.tga";
  }
  if (assetId === "tree_fruit_02") {
    return "LOD_Cards/treeFruit_02.tga";
  }
  if (assetId === "tree_fruit_03") {
    return "LOD_Cards/treeFruit_03.tga";
  }
  return undefined;
}

function grassTexture(hint: string): string {
  if (hint.includes("short")) {
    return "Plants/Grass_Short_01.tga";
  }
  if (hint.includes("mid")) {
    return "Plants/Grass_Mid_01.tga";
  }
  if (hint.includes("ground-cover")) {
    return "Plants/GroundCover_01.tga";
  }
  return "Plants/Grass_01.tga";
}

function flowerTexture(hint: string): string {
  if (hint.includes("wildflowers-02")) {
    return "Plants/WildFlowers_02.tga";
  }
  if (hint.includes("wildflowers-03")) {
    return "Plants/WildFlowers_03.tga";
  }
  if (hint.includes("flowers-flat")) {
    return "Plants/FlowersFlat_01.tga";
  }
  if (hint.includes("sunflower")) {
    return "LOD_Cards/Sunflower_01.tga";
  }
  return "Plants/WildFlowers_01.tga";
}

function bushTexture(hint: string): string {
  if (hint.includes("02")) {
    return "Plants/leafPatch_02.tga";
  }
  if (hint.includes("03")) {
    return "Plants/leafPatch_04.tga";
  }
  return "Plants/leafPatch_01.tga";
}

const FBX_TEXTURE_REDIRECTS = new Map<string, string>([
  ["grass_01.tga", "Plants/Grass_01.tga"],
  ["grass_mid_01.tga", "Plants/Grass_Mid_01.tga"],
  ["grass_short_01.tga", "Plants/Grass_Short_01.tga"],
  ["groundcover_01.tga", "Plants/GroundCover_01.tga"],
  ["flowers_flat_01.tga", "Plants/FlowersFlat_01.tga"],
  ["flowersflat_01.tga", "Plants/FlowersFlat_01.tga"],
  ["wildflowers_01.tga", "Plants/WildFlowers_01.tga"],
  ["wildflowers_02.tga", "Plants/WildFlowers_02.tga"],
  ["wildflowers_03.tga", "Plants/WildFlowers_03.tga"],
  ["sunflower_01.tga", "LOD_Cards/Sunflower_01.tga"],
  ["lillypads_medows_01.tga", "Plants/LillyPads_Medows_01.tga"],
  ["base_tree_branch_alpha.tga", "Plants/Branches_01.tga"],
  ["branches_01.tga", "Plants/Branches_01.tga"],
  ["branches_02.tga", "Plants/Branches_02.tga"],
  ["treebirch_01.tga", "LOD_Cards/treeBirch_01.tga"],
  ["treebirch_02.tga", "LOD_Cards/treeBirch_02.tga"],
  ["treebirch_03.tga", "LOD_Cards/treeBirch_03.tga"],
  ["treemeadow_01.tga", "LOD_Cards/treeMeadow_01.tga"],
  ["treemeadow_02.tga", "LOD_Cards/treeMeadow_02.tga"],
  ["treefruit_01.tga", "LOD_Cards/treeFruit_01.tga"],
  ["treefruit_02.tga", "LOD_Cards/treeFruit_02.tga"],
  ["treefruit_03.tga", "LOD_Cards/treeFruit_03.tga"],
  ["polygonnaturebiomes_meadow_texture_01.png", "PolygonNatureBiomes_Meadow_Texture_01.png"],
  ["polygonnaturebiomes_texture_01_justin.psd", "PolygonNatureBiomes_Meadow_Texture_01.png"],
  ["polygonnaturebiomes_texture_01_tom.png", "PolygonNatureBiomes_Meadow_Texture_01.png"],
  ["polygonexplorers_texture_01_cameron.png", "PolygonNatureBiomes_Meadow_Texture_01.png"],
  ["polygonancientworlds_texture_01.png", "PolygonNatureBiomes_Meadow_Texture_01.png"],
  ["polygoncastle_texture_01_a.psd", "PolygonNatureBiomes_Meadow_Texture_01.png"],
  ["ropebridge.png", "PolygonNatureBiomes_Meadow_Texture_01.png"]
]);

function fallbackFbxTexture(fileName: string): string | undefined {
  if (!/\.(png|jpe?g|tga|psd)$/i.test(fileName)) {
    return undefined;
  }
  return "Core/White.png";
}
