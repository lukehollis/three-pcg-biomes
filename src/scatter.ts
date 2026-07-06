import * as THREE from "three";
import { pickWeighted, SeededRandom } from "./random.js";
import type { BiomeModel, BiomePlacement, ScatterDistribution, ScatterLayer, TerrainSample } from "./types.js";
import { BiomeTerrain } from "./terrain.js";

const UP = new THREE.Vector3(0, 1, 0);

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

export function generateScatterPlacements(
  layer: ScatterLayer,
  terrain: BiomeTerrain,
  size: number,
  rng: SeededRandom,
  obstacles: Obstacle[] = []
): BiomePlacement[] {
  const placements: BiomePlacement[] = [];
  const cells = Math.ceil(Math.sqrt(layer.count * 1.75));
  const cellSize = size / cells;
  const halfSize = size / 2;
  const maxAttempts = cells * cells * 3;

  for (let attempt = 0; attempt < maxAttempts && placements.length < layer.count; attempt += 1) {
    const cellX = attempt % cells;
    const cellZ = Math.floor(attempt / cells) % cells;
    const x = -halfSize + (cellX + rng.next()) * cellSize;
    const z = -halfSize + (cellZ + rng.next()) * cellSize;
    const sample = terrain.sampleAt(x, z);

    if (!acceptSample(layer, sample, rng)) {
      continue;
    }
    if (isBlocked(x, z, obstacles)) {
      continue;
    }

    const asset = pickWeighted(layer.assets, rng);
    const scaleValue = asset.scale ? rng.range(asset.scale) : rng.between(0.9, 1.18);
    const normal = layer.alignToTerrain ? sample.normal.clone() : UP.clone();
    placements.push({
      assetId: asset.assetId,
      position: new THREE.Vector3(x, sample.height + (layer.yOffset ?? 0), z),
      rotationY: rng.between(0, Math.PI * 2),
      scale: new THREE.Vector3(scaleValue, scaleValue * rng.between(0.92, 1.12), scaleValue),
      normal
    });
  }

  return placements;
}

export function isBlocked(x: number, z: number, obstacles: Obstacle[]): boolean {
  for (const obstacle of obstacles) {
    const dx = x - obstacle.x;
    const dz = z - obstacle.z;
    if (dx * dx + dz * dz < obstacle.radius * obstacle.radius) {
      return true;
    }
  }
  return false;
}

export function groupPlacementsByAsset(placements: BiomePlacement[]): Map<string, BiomePlacement[]> {
  const grouped = new Map<string, BiomePlacement[]>();
  for (const placement of placements) {
    const bucket = grouped.get(placement.assetId) ?? [];
    bucket.push(placement);
    grouped.set(placement.assetId, bucket);
  }
  return grouped;
}

export function createInstancedGroup(model: BiomeModel, placements: BiomePlacement[]): THREE.Group {
  const group = new THREE.Group();
  group.name = `BiomeInstances_${model.asset.id}`;
  group.userData.assetId = model.asset.id;
  group.userData.instanceCount = placements.length;

  model.object.updateMatrixWorld(true);
  for (const sourceMesh of model.renderMeshes) {
    sourceMesh.updateMatrixWorld(true);
    const geometry = sourceMesh.geometry.clone();
    geometry.applyMatrix4(sourceMesh.matrixWorld);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = sourceMesh.material;
    const instanced = new THREE.InstancedMesh(geometry, material, placements.length);
    instanced.name = `${model.asset.id}_${sourceMesh.name}_instances`;
    instanced.castShadow = model.asset.castShadow ?? true;
    instanced.receiveShadow = model.asset.receiveShadow ?? true;
    instanced.frustumCulled = true;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const yaw = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let index = 0; index < placements.length; index += 1) {
      const placement = placements[index];
      if (!placement) {
        continue;
      }
      if (placement.quaternion) {
        quaternion.copy(placement.quaternion);
      } else if (placement.normal) {
        yaw.setFromAxisAngle(UP, placement.rotationY);
        quaternion.setFromUnitVectors(UP, placement.normal).multiply(yaw);
      } else {
        yaw.setFromAxisAngle(UP, placement.rotationY);
        quaternion.copy(yaw);
      }
      scale.copy(placement.scale).multiplyScalar(placementScaleMultiplier(model, placement));
      const position = placement.position.clone();
      position.y -= anchorOffsetY(model, scale.y);
      matrix.compose(position, quaternion, scale);
      instanced.setMatrixAt(index, matrix);
    }
    geometry.setAttribute("instanceWindPhase", createWindPhaseAttribute(placements));
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
  }

  return group;
}

export function createClonePlacement(model: BiomeModel, placement: BiomePlacement): THREE.Group {
  const clone = model.object.clone(true) as THREE.Group;
  clone.name = `BiomePlacement_${model.asset.id}`;
  const yaw = new THREE.Quaternion().setFromAxisAngle(UP, placement.rotationY);
  const quaternion = placement.quaternion
    ? placement.quaternion
    : placement.normal
      ? new THREE.Quaternion().setFromUnitVectors(UP, placement.normal).multiply(yaw)
      : yaw;
  const scale = placement.scale.clone().multiplyScalar(placementScaleMultiplier(model, placement));
  clone.position.copy(placement.position);
  clone.position.y -= anchorOffsetY(model, scale.y);
  clone.quaternion.copy(quaternion);
  clone.scale.multiply(scale);
  return clone;
}

function anchorOffsetY(model: BiomeModel, scaleY: number): number {
  return model.asset.anchor === "origin" ? 0 : model.baseY * scaleY;
}

function placementScaleMultiplier(model: BiomeModel, placement: BiomePlacement): number {
  return placement.userData?.preserveSourceScale === true ? 1 : model.normalizeScale;
}

function createWindPhaseAttribute(placements: BiomePlacement[]): THREE.InstancedBufferAttribute {
  const phases = new Float32Array(placements.length);
  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    if (!placement) {
      continue;
    }
    const provided = placement.userData?.windPhase;
    phases[index] =
      typeof provided === "number"
        ? provided
        : fract(Math.sin(placement.position.x * 12.9898 + placement.position.z * 78.233 + index * 37.719) * 43758.5453) *
          Math.PI *
          2;
  }
  return new THREE.InstancedBufferAttribute(phases, 1);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function acceptSample(layer: ScatterLayer, sample: TerrainSample, rng: SeededRandom): boolean {
  if (sample.radial > 0.98) {
    return false;
  }
  if (layer.maxSlope !== undefined && sample.slope > layer.maxSlope) {
    return false;
  }
  if (layer.minDistanceFromPath !== undefined && sample.pathDistance < layer.minDistanceFromPath) {
    return false;
  }
  if (layer.maxDistanceFromPath !== undefined && sample.pathDistance > layer.maxDistanceFromPath) {
    return false;
  }
  if (layer.minDistanceFromWater !== undefined && sample.waterDistance < layer.minDistanceFromWater) {
    return false;
  }

  const weight = distributionWeight(layer.distribution ?? "open", sample);
  return rng.next() < weight;
}

function distributionWeight(distribution: ScatterDistribution, sample: TerrainSample): number {
  switch (distribution) {
    case "edge":
      return THREE.MathUtils.smoothstep(sample.radial, 0.55, 0.92) * (sample.pathDistance > 6 ? 1 : 0.25);
    case "nearPath":
      return THREE.MathUtils.smoothstep(sample.pathDistance, 10, 1.5) * (sample.waterDistance > 4 ? 1 : 0.2);
    case "awayFromPath":
      return THREE.MathUtils.smoothstep(sample.pathDistance, 4, 18) * (sample.waterDistance > 4 ? 1 : 0.2);
    case "woodland":
      return THREE.MathUtils.smoothstep(sample.radial, 0.35, 0.96) * THREE.MathUtils.smoothstep(sample.moisture, -0.25, 0.75);
    case "rocks":
      return THREE.MathUtils.smoothstep(sample.radial, 0.25, 0.95) * (0.42 + Math.abs(sample.moisture) * 0.48);
    case "open":
    default:
      return THREE.MathUtils.smoothstep(sample.pathDistance, 1.8, 7) * THREE.MathUtils.smoothstep(sample.waterDistance, 1.5, 7);
  }
}
