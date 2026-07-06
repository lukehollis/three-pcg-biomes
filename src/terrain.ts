import * as THREE from "three";
import { createValueNoise2D, fractalNoise2D, smoothstep } from "./noise.js";
import type { TerrainOptions, TerrainSample, Vec2 } from "./types.js";

const UP = new THREE.Vector3(0, 1, 0);

export class BiomeTerrain {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly pathMesh: THREE.Mesh;
  readonly waterMesh?: THREE.Mesh;

  private readonly noise: (x: number, y: number) => number;
  private readonly moistureNoise: (x: number, y: number) => number;
  private readonly flowerNoise: (x: number, y: number) => number;
  private readonly halfSize: number;
  private readonly pathPoints: Vec2[];
  private readonly waterCenter: Vec2;
  private readonly waterRadius: number;
  private readonly basinDepth: number;
  private readonly waterSurfaceY: number;

  constructor(
    private readonly options: TerrainOptions,
    terrainMaterial: THREE.Material,
    pathMaterial: THREE.Material,
    waterMaterial?: THREE.Material
  ) {
    this.noise = createValueNoise2D(`${this.options.seed}:terrain`);
    this.moistureNoise = createValueNoise2D(`${this.options.seed}:moisture`);
    this.flowerNoise = createValueNoise2D(`${this.options.seed}:flowers`);
    this.halfSize = this.options.size / 2;
    this.pathPoints = options.pathPoints ?? defaultPath(options.size);
    this.waterCenter = options.waterCenter ?? { x: -options.size * 0.22, z: options.size * 0.12 };
    this.waterRadius = options.waterRadius ?? options.size * 0.095;
    // Carve a real basin so the pond reads at grazing angles, and float the
    // flat water surface partway up it.
    this.basinDepth = this.options.heightScale * 0.62;
    this.waterSurfaceY = this.landHeightAt(this.waterCenter.x, this.waterCenter.z) - this.basinDepth * 0.34;

    this.mesh = new THREE.Mesh(this.createTerrainGeometry(), terrainMaterial);
    this.mesh.name = "BiomeTerrain";
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    this.pathMesh = new THREE.Mesh(this.createPathGeometry(), pathMaterial);
    this.pathMesh.name = "BiomeFootpath";
    this.pathMesh.receiveShadow = true;
    this.group.add(this.pathMesh);

    if (waterMaterial) {
      this.waterMesh = new THREE.Mesh(this.createWaterGeometry(), waterMaterial);
      this.waterMesh.name = "BiomePond";
      this.waterMesh.receiveShadow = true;
      this.group.add(this.waterMesh);
    }
  }

  /** Terrain height before the pond basin is carved (the surrounding land). */
  private landHeightAt(x: number, z: number): number {
    const nx = x / this.options.size;
    const nz = z / this.options.size;
    const broad = fractalNoise2D(this.noise, nx * 2.2 + 31.7, nz * 2.2 - 18.1, 4, 2, 0.55);
    const detail = fractalNoise2D(this.noise, nx * 8.5 - 9.2, nz * 8.5 + 44.1, 3, 2.05, 0.42);
    const edgeLift = smoothstep(0.58, 0.98, Math.hypot(x, z) / this.halfSize) * 1.2;
    const pathFlatten = smoothstep(this.options.pathWidth * 1.5, 0, this.distanceToPath(x, z));
    const raw = (broad * 0.82 + detail * 0.18) * this.options.heightScale + edgeLift;
    return THREE.MathUtils.lerp(raw, raw * 0.18, pathFlatten * 0.88);
  }

  heightAt(x: number, z: number): number {
    const land = this.landHeightAt(x, z);
    const waterFlatten = smoothstep(this.waterRadius * 1.0, this.waterRadius * 0.55, this.waterDistance(x, z));
    let height = THREE.MathUtils.lerp(land, land - this.basinDepth, waterFlatten);
    // Raise a small island back up through the pond surface (demo scene has a
    // tree-topped islet in the middle of the pond).
    const distToCenter = Math.hypot(x - this.waterCenter.x, z - this.waterCenter.z);
    const islandLift = smoothstep(this.waterRadius * 0.4, this.waterRadius * 0.12, distToCenter) * (this.basinDepth + 0.9);
    return height + islandLift;
  }

  get pondCenter(): Vec2 {
    return this.waterCenter;
  }

  get pondRadius(): number {
    return this.waterRadius;
  }

  get pondSurfaceY(): number {
    return this.waterSurfaceY;
  }

  normalAt(x: number, z: number): THREE.Vector3 {
    const step = this.options.size / this.options.segments;
    const hL = this.heightAt(x - step, z);
    const hR = this.heightAt(x + step, z);
    const hD = this.heightAt(x, z - step);
    const hU = this.heightAt(x, z + step);
    return new THREE.Vector3(hL - hR, step * 2, hD - hU).normalize();
  }

  sampleAt(x: number, z: number): TerrainSample {
    const height = this.heightAt(x, z);
    const normal = this.normalAt(x, z);
    const radial = Math.hypot(x, z) / this.halfSize;
    const moisture = fractalNoise2D(this.moistureNoise, x * 0.024, z * 0.024, 4);
    const flowerField = fractalNoise2D(this.flowerNoise, x * 0.035 + 7, z * 0.035 - 3, 4);
    return {
      x,
      z,
      height,
      normal,
      slope: 1 - Math.max(0, Math.min(1, normal.dot(UP))),
      radial,
      pathDistance: this.distanceToPath(x, z),
      waterDistance: this.waterDistance(x, z),
      moisture,
      flowerField,
      attributes: {
        radial,
        pathDistance: this.distanceToPath(x, z),
        waterDistance: this.waterDistance(x, z),
        moisture,
        flowerField,
        slope: 1 - Math.max(0, Math.min(1, normal.dot(UP)))
      }
    };
  }

  distanceToPath(x: number, z: number): number {
    let closest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.pathPoints.length - 1; index += 1) {
      const a = this.pathPoints[index];
      const b = this.pathPoints[index + 1];
      if (!a || !b) {
        continue;
      }
      closest = Math.min(closest, distanceToSegment(x, z, a, b));
    }
    return closest;
  }

  waterDistance(x: number, z: number): number {
    return Math.hypot(x - this.waterCenter.x, z - this.waterCenter.z) - this.waterRadius;
  }

  private createTerrainGeometry(): THREE.BufferGeometry {
    const { size, segments } = this.options;
    const vertexCount = (segments + 1) * (segments + 1);
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices: number[] = [];

    let cursor = 0;
    let uvCursor = 0;
    let colorCursor = 0;
    for (let iz = 0; iz <= segments; iz += 1) {
      for (let ix = 0; ix <= segments; ix += 1) {
        const sourceX = (ix / segments - 0.5) * size;
        const sourceZ = (iz / segments - 0.5) * size;
        const x = sourceX;
        const z = sourceZ;
        const height = this.heightAt(x, z);
        positions[cursor++] = x;
        positions[cursor++] = height;
        positions[cursor++] = z;
        uvs[uvCursor++] = ix / segments;
        uvs[uvCursor++] = iz / segments;

        const sample = this.sampleAt(sourceX, sourceZ);
        const pathMix = smoothstep(this.options.pathWidth * 2.05, this.options.pathWidth * 0.3, sample.pathDistance);
        const flowerMix = smoothstep(0.12, 0.72, sample.flowerField) * (1 - pathMix);
        const edgeDry = smoothstep(0.55, 1, sample.radial);
        // Keep the default terrain palette bright enough for vertex-color shading.
        const color = new THREE.Color("#c7da5f")
          .lerp(new THREE.Color("#dfbe80"), pathMix * 0.42)
          .lerp(new THREE.Color("#dbe875"), flowerMix * 0.45)
          .lerp(new THREE.Color("#cdd57b"), edgeDry * 0.15);
        colors[colorCursor++] = color.r;
        colors[colorCursor++] = color.g;
        colors[colorCursor++] = color.b;

      }
    }

    for (let iz = 0; iz < segments; iz += 1) {
      for (let ix = 0; ix < segments; ix += 1) {
        const a = iz * (segments + 1) + ix;
        const b = a + 1;
        const c = a + segments + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private createPathGeometry(): THREE.BufferGeometry {
    const halfWidth = this.options.pathWidth * 0.5;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const curve = new THREE.CatmullRomCurve3(
      this.pathPoints.map((point) => new THREE.Vector3(point.x, 0, point.z)),
      false,
      "catmullrom",
      0.45
    );
    const sampleCount = Math.max(24, (this.pathPoints.length - 1) * 16);
    let distance = 0;
    let previousPoint: THREE.Vector3 | undefined;

    for (let index = 0; index <= sampleCount; index += 1) {
      const t = index / sampleCount;
      const current = curve.getPoint(t);
      if (previousPoint) {
        distance += Math.hypot(current.x - previousPoint.x, current.z - previousPoint.z);
      }
      previousPoint = current;

      const tangent3 = curve.getTangent(t);
      const tangent = new THREE.Vector2(tangent3.x, tangent3.z).normalize();
      const normal = new THREE.Vector2(-tangent.y, tangent.x);
      const widthNoise = fractalNoise2D(this.noise, current.x * 0.045 + 17.2, current.z * 0.045 - 28.4, 3, 2, 0.48);
      const localHalfWidth = halfWidth * THREE.MathUtils.clamp(0.9 + widthNoise * 0.22 + Math.sin(distance * 0.13) * 0.08, 0.76, 1.14);
      const left = { x: current.x + normal.x * localHalfWidth, z: current.z + normal.y * localHalfWidth };
      const right = { x: current.x - normal.x * localHalfWidth, z: current.z - normal.y * localHalfWidth };
      const leftY = this.heightAt(left.x, left.z) + 0.045;
      const rightY = this.heightAt(right.x, right.z) + 0.045;

      positions.push(left.x, leftY, left.z, right.x, rightY, right.z);
      uvs.push(0, distance * 0.026, 1, distance * 0.026);
    }

    for (let index = 0; index < sampleCount; index += 1) {
      const a = index * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private createWaterGeometry(): THREE.BufferGeometry {
    const segments = 72;
    // A flat disc at the water surface level; the carved basin gives it a shore.
    const surfaceY = this.waterSurfaceY;
    const positions: number[] = [this.waterCenter.x, surfaceY, this.waterCenter.z];
    const uvs: number[] = [0.5, 0.5];
    const indices: number[] = [];

    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const radiusNoise = 0.92 + 0.12 * Math.sin(angle * 3.1) + 0.07 * Math.cos(angle * 5.7);
      const x = this.waterCenter.x + Math.cos(angle) * this.waterRadius * radiusNoise;
      const z = this.waterCenter.z + Math.sin(angle) * this.waterRadius * radiusNoise;
      positions.push(x, surfaceY, z);
      uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
      if (index < segments) {
        indices.push(0, index + 1, index + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function defaultPath(size: number): Vec2[] {
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

function distanceToSegment(x: number, z: number, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const apx = x - a.x;
  const apz = z - a.z;
  const lengthSq = abx * abx + abz * abz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apz * abz) / lengthSq));
  const px = a.x + abx * t;
  const pz = a.z + abz * t;
  return Math.hypot(x - px, z - pz);
}
