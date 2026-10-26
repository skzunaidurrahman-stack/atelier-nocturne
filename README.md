# Atelier Nocturne — Objects of Slow Light

A cinematic, scroll-driven 3D site: a hand-cut marble monolith, brushed-bronze rings and
velvet drapes, staged in one continuous camera move. Every texture is generated in the
browser at load — no image assets are downloaded.

**Live:** https://skzunaidurrahman-stack.github.io/atelier-nocturne/

Pushing to `main` builds and deploys via GitHub Pages (`.github/workflows/deploy.yml`).

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # builds to dist/
```

Set `BASE_PATH=/repo-name/` when the build is served from a sub-path (the Pages
workflow does this for you).

## Optimised for budget hardware

Built and profiled against an **Intel Pentium G3420 (2 cores / 3.2 GHz), 8 GB DDR3,
integrated Intel HD Graphics** — a Haswell-class iGPU that shares the system RAM as VRAM.

`src/tier.js` probes the device at startup (`WEBGL_debug_renderer_info`,
`hardwareConcurrency`, `deviceMemory`, DPR) and picks a budget:

| | high | mid | low (target) |
|---|---|---|---|
| triangles | ~35 k | ~20 k | **≈ 8.5 k** |
| draw calls | 13 | 13 | **13** |
| textures | 7 (≤1024²) | 7 (≤768²) | **7 (≤512²)** |
| shadow map | 2048² | 1024² | **512² VSM** |
| dust sprites | 900 | 600 | **260** |
| render cadence | uncapped | 45 fps | **30 fps** |
| DPR cap | 2 | 1.5 | **1** |

Graceful degradation driven by measurement (all tunable in `src/tier.js`):

- **No physical materials.** `MeshPhysicalMaterial` was removed everywhere (it was the
  single biggest per-pixel cost). The floor's clearcoat and the velvet's sheen were
  baked into the base maps instead — visually equivalent here, far cheaper.
- **Marble is a texture, not a GLSL shader.** A custom `onBeforeCompile` marble shader
  (4-octave 3D value noise per pixel) was replaced with a pre-baked 512² marble tile and
  projected cylinder UVs. Saves the shader entirely.
- **Shadows: VSM, not PCF.** `THREE.PCFShadowMap` binds a depth texture the driver must
  compare; some drivers (including SwiftShader and older Intel builds) silently fail that
  comparison and render nothing. `VSMShadowMap` stores a normal colour target, which is
  always bindable — and it blurs cheaply. Shadow map updates at ~4 Hz, not per frame.
- **Frame governor.** The low tier renders on a 30 Hz cadence and returns before any GL
  work on skipped frames; the loop pauses entirely when the tab is hidden.
- **Adaptive resolution.** If the site can't hold ~26 fps over a 2 s window it steps the
  drawing buffer down (to 0.6×), once, and stays there — steady beats oscillating.
- **One texture atlas per material**, generateMipmaps on, no per-frame texture uploads;
  the only dynamic buffer is a 260-point dust field.
- Geometry segments are tiered (rings, cloth grids, dust, cloth tessellation).

Type is **bold and high-contrast** by design: a soft ink scrim sits behind every block of
copy, so nothing loses legibility over the sculpture.

## Structure

```
src/
  main.js            boot: scroll reader, UI, scene, curtain lift
  tier.js            device probe -> render budget
  scroll.js          one coalesced scroll read shared by DOM and 3D
  scene.js           renderer, camera route, lighting, sculpture, materials
  ui.js              reveals, word-split headlines, rail, counters, parallax
  tex/               procedural bakers: marble, metal, fabric, studio env, wood
  style.css          art direction
```

## Accessibility

Semantic landmarks and headings, visible focus rings, a real form with a status
region, and full `prefers-reduced-motion` support (scroll animation and marquee
stop, copy shows in its final state). If WebGL is unavailable the page falls back
to a pure-CSS stage and stays fully readable.
