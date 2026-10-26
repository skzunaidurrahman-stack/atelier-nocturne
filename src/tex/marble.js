import { makeNoise2D, fbmTile, smooth, lerp, clamp } from './perlin.js';

// Bake a cinematic slab of warm veined marble, used as the hero sculpture surface.
// Veins follow a gently warped diagonal so they read as rivers of stone, with a
// pale quartz shoulder and a soft graphite halo — the light does the rest.
export function bakeMarble(size = 512, seed = 7, rows = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 31);
  const n3 = makeNoise2D(seed + 77);
  const tile = 4.0;

  const y0 = rows ? rows[0] : 0;
  const y1 = rows ? rows[1] : size;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * tile;
      const v = (y / size) * tile;
      // domain warp -> flowing veins
      const w = fbmTile(n2, u * 1.6, v * 1.6, tile * 1.6, 4) * 0.9;
      const q = fbmTile(n3, u * 1.1 + 3, v * 1.1 + 7, tile * 1.1, 4) * 0.6;
      const base = fbmTile(n1, u + w, v + q, tile, 4);

      // veins: a diagonal river of phase, warped by the noise field
      const phase = (u * 0.85 + v * 0.95 + w * 2.1 + base * 1.6 + q * 0.8) * Math.PI;
      const d = Math.abs(Math.sin(phase));
      const vein = Math.pow(clamp(1 - d, 0, 1), 22);
      const halo = Math.pow(clamp(1 - d, 0, 1), 5);
      const cloud = smooth(clamp(base * 0.5 + 0.5, 0, 1));

      // base: warm bone marble, deeper where the clouds settle
      let r = lerp(150, 214, cloud);
      let g = lerp(138, 202, cloud);
      let b = lerp(124, 188, cloud);

      // soft graphite veil either side of the vein
      r -= halo * 52; g -= halo * 54; b -= halo * 52;
      // the hairline itself reads almost black
      r = lerp(r, 34, vein); g = lerp(g, 32, vein); b = lerp(b, 34, vein);
      // warm quartz shoulder catching the lamp
      const glint = Math.pow(clamp(1 - Math.abs(d - 0.12) * 6, 0, 1), 3);
      r += glint * 30; g += glint * 26; b += glint * 20;

      const i = (y * size + x) * 4;
      img.data[i] = clamp(r, 0, 255);
      img.data[i + 1] = clamp(g, 0, 255);
      img.data[i + 2] = clamp(b, 0, 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0, 0, y0, size, y1 - y0);
  return c;
}
