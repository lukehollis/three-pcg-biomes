import * as THREE from "three";

export interface UvSpanSplitResult {
  /** Triangles whose UVs span more than the threshold (full-texture cards). */
  cards?: THREE.Mesh;
  /** Triangles whose UVs stay inside a small island (conventionally-mapped surfaces). */
  solid?: THREE.Mesh;
}

/**
 * Split a mesh into two meshes by per-triangle UV span.
 *
 * Synty source meshes combine two UV conventions in one draw call and rely on a
 * custom UE shader to tell them apart: foliage cards span the full 0..1 UV square
 * (each card displays an entire alpha texture) while solid surfaces sit inside a
 * small atlas island. Splitting them lets each half take its own material.
 */
export function splitMeshByUvSpan(mesh: THREE.Mesh, spanThreshold = 0.5): UvSpanSplitResult {
  const geometry = mesh.geometry;
  const uv = geometry.getAttribute("uv");
  const position = geometry.getAttribute("position");
  if (!uv || !position) {
    return { solid: mesh };
  }

  const index = geometry.getIndex();
  const triangleCount = (index ? index.count : position.count) / 3;
  const cardFaces: number[] = [];
  const solidFaces: number[] = [];

  for (let face = 0; face < triangleCount; face += 1) {
    let minU = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = index ? index.getX(face * 3 + corner) : face * 3 + corner;
      const u = uv.getX(vertex);
      const v = uv.getY(vertex);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const span = Math.max(maxU - minU, maxV - minV);
    (span > spanThreshold ? cardFaces : solidFaces).push(face);
  }

  if (cardFaces.length === 0) {
    return { solid: mesh };
  }
  if (solidFaces.length === 0) {
    return { cards: mesh };
  }

  const result: UvSpanSplitResult = {
    cards: subsetMesh(mesh, cardFaces),
    solid: subsetMesh(mesh, solidFaces)
  };
  return result;
}

function subsetMesh(mesh: THREE.Mesh, faces: number[]): THREE.Mesh {
  const geometry = mesh.geometry;
  const index = geometry.getIndex();
  const subset = new THREE.BufferGeometry();

  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const source = attribute as THREE.BufferAttribute;
    const itemSize = source.itemSize;
    const array = new Float32Array(faces.length * 3 * itemSize);
    let cursor = 0;
    for (const face of faces) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = index ? index.getX(face * 3 + corner) : face * 3 + corner;
        for (let component = 0; component < itemSize; component += 1) {
          array[cursor++] = source.getComponent(vertex, component);
        }
      }
    }
    subset.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  }
  subset.computeBoundingBox();
  subset.computeBoundingSphere();

  const clone = new THREE.Mesh(subset, mesh.material);
  clone.name = mesh.name;
  clone.position.copy(mesh.position);
  clone.quaternion.copy(mesh.quaternion);
  clone.scale.copy(mesh.scale);
  clone.castShadow = mesh.castShadow;
  clone.receiveShadow = mesh.receiveShadow;
  return clone;
}
