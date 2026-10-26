import { makeNoise2D, fbmTile, clamp, lerp, smooth } from './perlin.js';

// Anisotropic brushed dark bronze: long horizontal strokes + fine grain.
export function bakeBrushedMetal(w = 1024, h = 512, seed = 3) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 19);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x / w) * 3;
      const v = (y / h) * 3;
      // stretched on x -> brush lines
      const stroke = fbmTile(n1, u * 0.35, v * 46, 3, 4);
      const grain = fbmTile(n2, u * 4, v * 4, 3, 3);
      const band = smooth(clamp(stroke * 0.5 + 0.5, 0, 1));
      const t = clamp(band * 0.72 + (grain * 0.5 + 0.5) * 0.28, 0, 1);
      let r = lerp(30, 120, t);
      let g = lerp(27, 92, t);
      let b = lerp(25, 66, t);
      const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
