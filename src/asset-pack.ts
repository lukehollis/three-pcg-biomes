import type { BiomeAssetDescriptor, BiomePack } from "./types.js";

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function joinUrl(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((part, index) => {
      if (index === 0) {
        return part.replace(/\/+$/, "");
      }
      return part.replace(/^\/+|\/+$/g, "");
    })
    .join("/");
}

export function withAssetBase(pack: BiomePack, assetBaseUrl: string): BiomePack {
  return {
    ...pack,
    assetBaseUrl: normalizeBaseUrl(assetBaseUrl),
    assets: [...pack.assets]
  };
}

export function assetUrl(pack: BiomePack, asset: BiomeAssetDescriptor): string {
  return joinUrl(pack.assetBaseUrl, pack.fbxRoot, asset.file);
}

export function textureUrl(pack: BiomePack, texture: string): string {
  return joinUrl(pack.assetBaseUrl, pack.textureRoot, texture);
}

export function assetMap(pack: BiomePack): Map<string, BiomeAssetDescriptor> {
  return new Map(pack.assets.map((asset) => [asset.id, asset]));
}
