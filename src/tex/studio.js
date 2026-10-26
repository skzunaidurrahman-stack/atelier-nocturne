import { makeNoise2D, fbm, clamp, lerp } from './perlin.js';

// A soft-box studio environment: dark room, one warm key window, one cool rim,
// a soft floor bounce. Used with PMREM so polished surfaces have something to reflect.
export function bakeStudioEnv(w = 1024, h = 512) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const n = makeNoise2D(99);

  const boxes = [
    // u, v, radius, rgb, intensity  (u wraps 0..1, v 0 top .. 1 bottom)
    { u: 0.16, v: 0.30, r: 0.19, c: [255, 214, 170], i: 1.0 },  // warm key
    { u: 0.68, v: 0.20, r: 0.11, c: [150, 190, 255], i: 0.55 }, // cool rim
    { u: 0.90, v: 0.44, r: 0.07, c: [255, 180, 120], i: 0.42 }, // kicker
  ];

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // base gradient: dark warm-to-black, brighter floor bounce
      const floor = Math.pow(clamp((v - 0.55) / 0.45, 0, 1), 2.2);
      let r = lerp(5, 26, floor), g = lerp(5, 18, floor), b = lerp(7, 13, floor);
      r += 9 * (1 - v) * 0.5; g += 7 * (1 - v) * 0.5; b += 8 * (1 - v) * 0.5;

      for (const bx of boxes) {
        let du = Math.abs(u - bx.u);
        du = Math.min(du, 1 - du);
        const dv = Math.abs(v - bx.v);
        const d = Math.hypot(du * 1.9, dv);
        if (d < bx.r) {
          const fall = Math.pow(1 - d / bx.r, 2.4) * bx.i;
          r += bx.c[0] * fall; g += bx.c[1] * fall; b += bx.c[2] * fall;
        }
      }
      const gr = fbm(n, u * 12, v * 12, 4) * 0.12 + 0.94;
      const i = (y * w + x) * 4;
      img.data[i] = clamp(r * gr, 0, 255);
      img.data[i + 1] = clamp(g * gr, 0, 255);
      img.data[i + 2] = clamp(b * gr, 0, 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
