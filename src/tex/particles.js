// Radial glow sprite for the floating dust.
export function bakeGlow(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,238,210,1)');
  g.addColorStop(0.25, 'rgba(255,206,150,0.65)');
  g.addColorStop(0.6, 'rgba(255,170,110,0.18)');
  g.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

// Polished dark wood floor: concentric rings + pores + a soft sheen falloff.
export function bakeWoodFloor(size = 1024, seed = 21) {
  // simple inline noise to avoid a circular import chain
  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c2 = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a + (b - a) * u) * (1 - v) + (c2 + (d - c2) * u) * v;
  };
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const warp = noise(u * 7, v * 7) * 0.06;
      const rings = Math.sin((v * 26 + noise(u * 3, v * 3) * 2.2 + warp * 40) * Math.PI);
      const ring = Math.pow(Math.abs(rings), 3.0);
      const pore = noise(u * 260, v * 90) * 0.25;
      const blotch = noise(u * 5, v * 5);
      let r = 34 + ring * 26 + blotch * 22 - pore * 60;
      let g = 24 + ring * 18 + blotch * 15 - pore * 44;
      let b = 18 + ring * 12 + blotch * 10 - pore * 30;
      const fall = 1 - 0.35 * Math.hypot(u - 0.5, v - 0.5);
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, r * fall);
      img.data[i + 1] = Math.max(0, g * fall);
      img.data[i + 2] = Math.max(0, b * fall);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
