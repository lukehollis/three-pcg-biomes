import * as THREE from "three";

export interface BiomeWindOptions {
  /** World-space displacement multiplier in metres. */
  strength?: number;
  /** Time multiplier for the wave motion. */
  speed?: number;
  /** Horizontal spatial frequency; larger values make tighter waves. */
  spatialFrequency?: number;
  /** Height at which bending reaches full strength in local mesh space. */
  heightScale?: number;
}

interface BiomeWindState extends Required<BiomeWindOptions> {
  elapsed: number;
  uniforms?: {
    time: { value: number };
    strength: { value: number };
    spatialFrequency: { value: number };
    heightScale: { value: number };
  };
}

const DEFAULT_WIND: Required<BiomeWindOptions> = {
  strength: 0.18,
  speed: 1,
  spatialFrequency: 0.18,
  heightScale: 2.4
};

/**
 * Opt a material into lightweight biome wind.
 *
 * The shader is intentionally generic: it reads an optional per-instance phase
 * and bends vertices more strongly as local height increases. Meadow-specific
 * material choices remain in the app package.
 */
export function enableBiomeWind(material: THREE.Material, options: BiomeWindOptions = {}): THREE.Material {
  const wind: BiomeWindState = {
    ...DEFAULT_WIND,
    ...options,
    elapsed: 0
  };
  material.userData.biomeWind = wind;

  const existingOnBeforeCompile = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    existingOnBeforeCompile(shader, renderer);
    shader.uniforms.biomeWindTime = { value: wind.elapsed * wind.speed };
    shader.uniforms.biomeWindStrength = { value: wind.strength };
    shader.uniforms.biomeWindSpatialFrequency = { value: wind.spatialFrequency };
    shader.uniforms.biomeWindHeightScale = { value: wind.heightScale };
    wind.uniforms = {
      time: shader.uniforms.biomeWindTime as { value: number },
      strength: shader.uniforms.biomeWindStrength as { value: number },
      spatialFrequency: shader.uniforms.biomeWindSpatialFrequency as { value: number },
      heightScale: shader.uniforms.biomeWindHeightScale as { value: number }
    };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float biomeWindTime;
uniform float biomeWindStrength;
uniform float biomeWindSpatialFrequency;
uniform float biomeWindHeightScale;
#ifdef USE_INSTANCING
  attribute float instanceWindPhase;
#endif`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float biomeInstanceWindPhase = 0.0;
#ifdef USE_INSTANCING
  biomeInstanceWindPhase = instanceWindPhase;
#endif
float biomeWindHeight = clamp(position.y / max(0.001, biomeWindHeightScale), 0.0, 1.0);
float biomeWindWave = sin(
  biomeWindTime +
  biomeInstanceWindPhase +
  transformed.x * biomeWindSpatialFrequency +
  transformed.z * biomeWindSpatialFrequency * 0.73
);
float biomeWindCross = cos(
  biomeWindTime * 0.71 +
  biomeInstanceWindPhase * 1.37 +
  transformed.x * biomeWindSpatialFrequency * 0.47 -
  transformed.z * biomeWindSpatialFrequency
);
vec2 biomeWindOffset = vec2(biomeWindWave, biomeWindCross) * biomeWindStrength * biomeWindHeight * biomeWindHeight;
transformed.xz += biomeWindOffset;`
      );
  };

  material.needsUpdate = true;
  return material;
}

export function tickBiomeWindMaterial(material: THREE.Material, deltaSeconds: number): void {
  const wind = material.userData.biomeWind as BiomeWindState | undefined;
  if (!wind) {
    return;
  }
  wind.elapsed += deltaSeconds;
  if (!wind.uniforms) {
    return;
  }
  wind.uniforms.time.value = wind.elapsed * wind.speed;
  wind.uniforms.strength.value = wind.strength;
  wind.uniforms.spatialFrequency.value = wind.spatialFrequency;
  wind.uniforms.heightScale.value = wind.heightScale;
}
