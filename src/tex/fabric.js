import { makeNoise2D, fbmTile, clamp, lerp } from './perlin.js';

// Warm woven fabric with subtle slubs, for the draped silk/linen surfaces.
export function bakeFabric(size = 512, seed = 11, tint = [150, 122, 92]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 5);
  const period = size / 26;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = Math.sin((x / period) * Math.PI * 2);
      const wy = Math.cos((y / period) * Math.PI * 2);
      const weave = ((wx * wy) * 0.5 + 0.5) * 0.6 + 0.2;
      const slub = fbmTile(n, (x / size) * 6, (y / size) * 6, 6, 4);
      const grain = n2(x * 0.9, y * 0.9);
      const t = clamp(weave * 0.5 + (slub * 0.5 + 0.5) * 0.42 + grain * 0.08, 0, 1);
      const i = (y * size + x) * 4;
      img.data[i] = clamp(tint[0] * lerp(0.45, 1.06, t), 0, 255);
      img.data[i + 1] = clamp(tint[1] * lerp(0.45, 1.06, t), 0, 255);
      img.data[i + 2] = clamp(tint[2] * lerp(0.45, 1.06, t), 0, 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
