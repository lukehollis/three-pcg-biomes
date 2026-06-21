import { hashSeed } from "./random.js";

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash2(seed: number, x: number, y: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function createValueNoise2D(seed: string | number): (x: number, y: number) => number {
  const hashed = hashSeed(seed);
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const xf = x - x0;
    const yf = y - y0;

    const top = lerp(hash2(hashed, x0, y0), hash2(hashed, x0 + 1, y0), fade(xf));
    const bottom = lerp(hash2(hashed, x0, y0 + 1), hash2(hashed, x0 + 1, y0 + 1), fade(xf));
    return lerp(top, bottom, fade(yf)) * 2 - 1;
  };
}

export function fractalNoise2D(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves = 5,
  lacunarity = 2,
  gain = 0.5
): number {
  let amplitude = 1;
  let frequency = 1;
  let value = 0;
  let normalization = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    value += noise(x * frequency, y * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / normalization;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
