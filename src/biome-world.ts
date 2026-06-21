import * as THREE from "three";
import type { BiomeTerrain } from "./terrain.js";
import type { BiomePack } from "./types.js";

export interface BiomeWorldMaterials {
  tick(deltaSeconds: number): void;
}

export type BiomeWorldAssetLoader = object;

export class BiomeWorld {
  readonly group = new THREE.Group();
  private lastUpdate = nowSeconds();

  constructor(
    readonly pack: BiomePack,
    readonly terrain: BiomeTerrain,
    readonly materials: BiomeWorldMaterials,
    readonly loader: BiomeWorldAssetLoader
  ) {
    this.group.name = `BiomeWorld_${pack.id}`;
    this.group.add(terrain.group);
  }

  addTo(scene: THREE.Scene): this {
    scene.add(this.group);
    return this;
  }

  update(deltaSeconds?: number): void {
    if (deltaSeconds !== undefined) {
      this.materials.tick(deltaSeconds);
      this.lastUpdate = nowSeconds();
      return;
    }
    const current = nowSeconds();
    this.materials.tick(Math.min(current - this.lastUpdate, 0.05));
    this.lastUpdate = current;
  }

  heightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  dispose(): void {
    this.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        material?.dispose();
      }
    });
    this.group.removeFromParent();
  }
}

function nowSeconds(): number {
  if (typeof performance !== "undefined") {
    return performance.now() / 1000;
  }
  return Date.now() / 1000;
}
