import type * as THREE from "three";

export type BiomeQuality = "low" | "medium" | "high" | "ultra";

export interface Vec2 {
  x: number;
  z: number;
}

export interface ScalarRange {
  min: number;
  max: number;
}

export interface BiomeAssetDescriptor {
  id: string;
  file: string;
  category:
    | "grass"
    | "flower"
    | "tree"
    | "bush"
    | "rock"
    | "ground"
    | "prop"
    | "water"
    | "sky"
    | "fx";
  lod?: number;
  sourceScale?: number;
  /** Desired real-world height in metres; instances are normalized to it. */
  targetHeight?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  windStrength?: number;
  materialHint?: string;
}

export interface BiomePack {
  id: string;
  label: string;
  assetBaseUrl: string;
  fbxRoot: string;
  textureRoot: string;
  sourceScale: number;
  assets: BiomeAssetDescriptor[];
}

export interface BiomePlacement {
  assetId: string;
  position: THREE.Vector3;
  rotationY: number;
  scale: THREE.Vector3;
  normal?: THREE.Vector3;
  userData?: Record<string, unknown>;
}

export interface WeightedAsset {
  assetId: string;
  weight?: number;
  scale?: ScalarRange;
}

export type ScatterDistribution = "open" | "edge" | "nearPath" | "awayFromPath" | "woodland" | "rocks";

export interface ScatterLayer {
  id: string;
  assets: WeightedAsset[];
  count: number;
  distribution?: ScatterDistribution;
  minDistanceFromPath?: number;
  maxDistanceFromPath?: number;
  minDistanceFromWater?: number;
  maxSlope?: number;
  alignToTerrain?: boolean;
  yOffset?: number;
}

export interface TerrainOptions {
  seed: string | number;
  size: number;
  segments: number;
  heightScale: number;
  pathWidth: number;
  waterCenter?: Vec2;
  waterRadius?: number;
  pathPoints?: Vec2[];
}

export interface TerrainSample {
  x: number;
  z: number;
  height: number;
  normal: THREE.Vector3;
  slope: number;
  radial: number;
  pathDistance: number;
  waterDistance: number;
  moisture: number;
  flowerField: number;
}

export interface CreateBiomeOptions {
  scene: THREE.Scene;
  renderer?: THREE.WebGLRenderer;
  camera?: THREE.PerspectiveCamera;
  assetBaseUrl?: string;
  seed?: string | number;
  quality?: BiomeQuality;
  size?: number;
  onProgress?: (event: BiomeLoadingEvent) => void;
}

export interface BiomeLoadingEvent {
  loaded: number;
  total: number;
  url: string;
  progress: number;
  phase?: string;
}

export interface BiomeModel {
  asset: BiomeAssetDescriptor;
  object: THREE.Group;
  renderMeshes: THREE.Mesh[];
  /** Natural bounding-box size in metres after source scale, before normalization. */
  naturalSize: THREE.Vector3;
  /** Lowest geometry point in metres (negative = extends below pivot). */
  baseY: number;
  /** Multiplier that brings the model to its target height (1 when unset). */
  normalizeScale: number;
}

export interface ControllerOptions {
  domElement: HTMLElement;
  camera: THREE.PerspectiveCamera;
  heightAt: (x: number, z: number) => number;
  start?: THREE.Vector3;
  eyeHeight?: number;
  walkSpeed?: number;
  sprintSpeed?: number;
  jumpSpeed?: number;
  gravity?: number;
}
