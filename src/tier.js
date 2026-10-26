// Device tiering. Probed once, cheaply, with no GPU stall.
// Budget target: Intel Pentium G3420 + HD Graphics (Haswell "GT1") + 8 GB DDR3,
// which shares system RAM as VRAM. On that class of machine we must stay under
// ~250 k triangles, one 1024² texture atlas, and no realtime shadow maps.
export function detectTier() {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency || 2;
  const mem = navigator.deviceMemory || 4;
  const dpr = window.devicePixelRatio || 1;

  let gpu = '';
  let renderer = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl', {
      failIfMajorPerformanceCaveat: false,
    });
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
        gpu = renderer.toLowerCase();
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* ignore */
  }

  const software = /swiftshader|llvmpipe|basic render|software|microsoft basic/.test(gpu);
  const intel = /intel/.test(gpu) || /intel/.test(renderer.toLowerCase());
  const apple = /apple/.test(gpu);

  let tier = 'mid';
  if (software) tier = 'low';
  else if (intel || coarse || cores <= 4 || mem <= 4 || dpr > 2) tier = 'low';
  else if (apple || cores >= 8) tier = 'high';

  const cfg = TIERS[tier];
  return { tier, renderer, cores, mem, dpr, ...cfg };
}

export const TIERS = {
  high: {
    dprCap: 2,
    minDpr: 1,
    aa: true,
    shadows: true,
    shadowSize: 2048,
    marble: 1024,
    floor: 512,
    env: 512,
    pmrem: 256,
    dust: 900,
    radial: 48,
    heightSeg: 96,
    clothSeg: [34, 22],
    maxAniso: 8,
    fps: 0, // uncapped
    qualityStep: 1.0,
  },
  mid: {
    dprCap: 1.5,
    minDpr: 0.8,
    aa: true,
    shadows: true,
    shadowSize: 1024,
    marble: 768,
    floor: 512,
    env: 256,
    pmrem: 128,
    dust: 600,
    radial: 40,
    heightSeg: 64,
    clothSeg: [24, 16],
    maxAniso: 4,
    fps: 45,
    qualityStep: 0.75,
  },
  low: {
    // the G3420 / HD Graphics profile
    dprCap: 1,
    minDpr: 0.6,
    aa: false,
    shadows: true, // one cheap 512² depth pass, cast by the sculpture only
    shadowSize: 512,
    marble: 512,
    floor: 256,
    env: 128,
    pmrem: 64,
    dust: 260,
    radial: 32,
    heightSeg: 44,
    clothSeg: [16, 10],
    maxAniso: 1,
    fps: 30,
    qualityStep: 0.5,
  },
};
