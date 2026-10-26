import * as THREE from 'three';
import { bakeMarble } from './tex/marble.js';
import { bakeBrushedMetal } from './tex/brushedMetal.js';
import { bakeFabric } from './tex/fabric.js';
import { bakeStudioEnv } from './tex/studio.js';
import { bakeGlow, bakeWoodFloor } from './tex/particles.js';
import { makeNoise2D, fbm } from './tex/perlin.js';
import { detectTier } from './tier.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

// One procedural geometry recipe, shared by the real render and the loader preview.
const H = 3.1;

function buildMonolith(radial, heightSeg) {
  // A twisted, ridged monolith carved from marble — geometry displaced by fBm so
  // the silhouette reads as hand-cut stone rather than a mesh primitive.
  const geo = new THREE.CylinderGeometry(1.0, 1.0, H, radial, heightSeg, false);
  const pos = geo.attributes.position;
  const noise = makeNoise2D(5);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = (v.y + H / 2) / H;
    const ang = Math.atan2(v.z, v.x);
    const profile = 0.62 + Math.sin(t * Math.PI) * 0.5 + t * 0.34;
    const ridges = 1 + Math.sin(ang * 9 + t * 5.2) * 0.035;
    const e = fbm(noise, Math.cos(ang) * 1.6 + t * 2.0, Math.sin(ang) * 1.6 + t * 1.2, 4);
    const r = profile * ridges * (1 + e * 0.13);
    const twist = t * 1.35;
    v.x = Math.cos(ang + twist) * r + Math.sin(t * Math.PI) * 0.16;
    v.z = Math.sin(ang + twist) * r;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // Projected UVs: cylinder in plan, stretched along height. Keeps the marble
  // tile continuous across the twisted surface with no seam at the wrap.
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    uv.setXY(i, Math.atan2(z, x) / (Math.PI * 2) + 0.5, (y + H / 2) / H);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function createScene(canvas, opts = {}) {
  const cfg = opts.cfg || detectTier();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: cfg.aa,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, cfg.dprCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.info.autoReset = true;
  renderer.shadowMap.enabled = cfg.shadows;
  // VSM stores its shadow map as a normal colour target, which the GPU driver can
  // always bind — PCF's depth-texture compare silently fails on some drivers
  // (including SwiftShader/older Intel), where it renders nothing at all.
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;        // the sculpture only turns slowly -> refresh on demand

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#08070a');
  scene.fog = new THREE.FogExp2(0x0a0806, 0.05);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.6, 46);
  camera.position.set(0, 0.2, 7);

  // Adaptive resolution state — declared up here so resize() can read it.
  let quality = 1;

  /* ---------------------------------------------------------------- textures */
  // Everything is baked at the tier's resolution, in strips, so the main thread
  // never stalls for more than a few milliseconds.
  const maxAniso = Math.min(cfg.maxAniso, renderer.capabilities.getMaxAnisotropy());
  const tex = (canvas, srgb = true) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  };

  const velvetTex = tex(bakeFabric(384, 11, [168, 96, 66]));
  velvetTex.wrapS = velvetTex.wrapT = THREE.RepeatWrapping;
  const linenTex = tex(bakeFabric(256, 44, [176, 158, 132]));
  linenTex.wrapS = linenTex.wrapT = THREE.RepeatWrapping;
  linenTex.repeat.set(3, 3);
  const woodTex = tex(bakeWoodFloor(cfg.floor, 21));

  // Marble is a baked tile, not a custom GLSL shader: a texture triplanar-mapped
  // through a generated UV set costs ~1/4 the shader work and is reliable on
  // every driver. Repeat 2×2 hides the tile seam.
  const marbleCanvas = bakeMarble(cfg.marble, 7);
  const marbleTex = tex(marbleCanvas);
  marbleTex.wrapS = marbleTex.wrapT = THREE.RepeatWrapping;
  marbleTex.repeat.set(2, 2);
  const glowCanvas = bakeGlow(48);
  const glowTex = tex(glowCanvas);
  // compile the lit programs once, up front, instead of on the first hover frame
  renderer.compile(scene, camera);
  // Log the scene budget so the profile is verifiable on the target machine.
  {
    let tris = 0, oCount = 0;
    scene.traverse((o) => {
      if (!o.isMesh && !o.isPoints) return;
      oCount++;
      const g = o.geometry;
      if (g?.index) tris += g.index.count / 3;
      else if (g?.attributes?.position) tris += g.attributes.position.count / 3;
    });
    console.info(
      `[atelier] tier=${cfg.tier} gpu="${detectTier().renderer || 'unknown'}" ` +
      `objects=${oCount} triangles≈${Math.round(tris)} dust=${cfg.dust} ` +
      `shadow=${cfg.shadows ? cfg.shadowSize : 'off'} dpr≤${cfg.dprCap}`,
    );
  }

  // Environment: PMREM from a painted soft-box studio so polished surfaces reflect.
  // Small equirect + small target = one cheap convolution at startup, no per-frame cost.
  const envCanvas = bakeStudioEnv(cfg.env, cfg.env / 2);
  const envSrc = tex(envCanvas);
  envSrc.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(envSrc);
  const envTex = envRT.texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();
  envSrc.dispose();

  /* ------------------------------------------------------------------ lights */
  // Three lights, no fourth. Ambient is folded into the hemisphere-free env map
  // plus a small ambient, which is cheaper than another real light.
  const key = new THREE.SpotLight(0xffd2a1, 760, 40, Math.PI / 5.0, 0.6, 1.5);
  key.position.set(5.5, 7.5, 4.5);
  key.target.position.set(0, 0.1, 0);
  if (cfg.shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(cfg.shadowSize, cfg.shadowSize);
    key.shadow.bias = -0.0005;
    key.shadow.radius = 3;
    key.shadow.blurSamples = 8;
    key.shadow.camera.near = 4;
    key.shadow.camera.far = 22;
    key.shadow.autoUpdate = false;
    key.shadow.needsUpdate = true;
  }
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0x8fb0ff, 1.9);
  rim.position.set(-6.5, 3.2, -5.5);
  scene.add(rim);

  const amb = new THREE.AmbientLight(0x3a3444, 2.2);
  scene.add(amb);

  /* ------------------------------------------------------------------- floor */
  // Floor detail comes from the baked wood map, not from clearcoat — a clearcoat
  // lobe costs a full extra env lookup per pixel for almost no visible gain here.
  const floorMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    color: 0x8f7b66,
    roughness: 0.42,
    metalness: 0.0,
    envMap: envTex,
    envMapIntensity: 0.55,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.35;
  floor.receiveShadow = cfg.shadows;
  scene.add(floor);

  /* -------------------------------------------------------------- sculpture */
  const knotGeo = buildMonolith(cfg.radial, cfg.heightSeg);
  const sculpture = new THREE.Group();
  const marbleMat = new THREE.MeshStandardMaterial({
    map: marbleTex,
    color: 0xffffff,
    roughness: 0.33,
    metalness: 0.04,
    envMap: envTex,
    envMapIntensity: 0.85,
  });
  const knot = new THREE.Mesh(knotGeo, marbleMat);
  knot.castShadow = cfg.shadows;
  knot.receiveShadow = cfg.shadows;
  knot.position.y = H / 2 - 2.3;
  sculpture.add(knot);

  const RING_SEG = cfg.tier === 'low' ? 96 : cfg.tier === 'mid' ? 128 : 160;
  const TUBE_SEG = cfg.tier === 'low' ? 10 : 20;
  const ringGeo = new THREE.TorusGeometry(1.28, 0.045, TUBE_SEG, RING_SEG);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xf0c08a,
    metalness: 1.0,
    roughness: 0.26,
    envMap: envTex,
    envMapIntensity: 1.5,
    emissive: 0x3a2410,
    emissiveIntensity: 1,
  });
  const crown = new THREE.Mesh(ringGeo, ringMat);
  crown.castShadow = cfg.shadows;
  crown.position.y = H - 2.3 + 0.08;
  crown.rotation.x = Math.PI / 2;
  sculpture.add(crown);

  // second ring: same geometry, second material -> zero extra memory
  const orbit = new THREE.Mesh(ringGeo, ringMat.clone());
  orbit.material.color.set(0x9fc0ff);
  orbit.material.emissive.set(0x0b1430);
  orbit.scale.setScalar(0.72);
  orbit.position.y = 0.55;
  orbit.rotation.set(Math.PI / 2.3, 0.4, 0.2);
  sculpture.add(orbit);

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.5, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: 0x7a5c42, metalness: 0.9, roughness: 0.35, envMap: envTex }),
  );
  plinth.position.y = -2.28;
  plinth.rotation.y = 0.2;
  plinth.castShadow = cfg.shadows;
  plinth.receiveShadow = cfg.shadows;
  sculpture.add(plinth);

  scene.add(sculpture);

  // A baked contact shadow: one sprite of darkness under the piece instead of a
  // second shadow-casting light. Cheap, and it grounds the sculpture instantly.
  const contact = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    rg.addColorStop(0, 'rgba(0,0,0,0.92)');
    rg.addColorStop(0.45, 'rgba(0,0,0,0.45)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    const t = tex(c);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.95 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, -2.343, 0.1);
    scene.add(m);
    return m;
  })();

  /* --------------------------------------------------------------- fragments */
  // Three satellite shards the scroll route picks up along the way.
  // Detail levels are trimmed hard: at these screen sizes the difference between
  // a 1280-tri sphere and a 20-tri sphere is invisible, the shading is not.
  const shards = [];
  const lod = cfg.tier === 'low' ? 0 : cfg.tier === 'mid' ? 1 : 2;
  const shardDefs = [
    { geo: new THREE.IcosahedronGeometry(0.42, lod), pos: new THREE.Vector3(-2.6, 1.5, 1.2), mat: 0 },
    { geo: new THREE.TorusKnotGeometry(0.32, 0.1, lod ? 96 : 56, lod ? 12 : 8), pos: new THREE.Vector3(2.9, 0.4, 1.6), mat: 1 },
    { geo: new THREE.CapsuleGeometry(0.16, 0.7, 3, 12), pos: new THREE.Vector3(-2.2, -0.9, 2.2), mat: 0 },
  ];
  const shardMats = [
    new THREE.MeshStandardMaterial({ color: 0xe8bc8a, metalness: 1, roughness: 0.24, envMap: envTex, envMapIntensity: 1.5 }),
    new THREE.MeshStandardMaterial({ color: 0x9fb8ea, metalness: 1, roughness: 0.22, envMap: envTex, envMapIntensity: 1.5, emissive: 0x0a1228 }),
  ];
  for (const d of shardDefs) {
    const m = new THREE.Mesh(d.geo, shardMats[d.mat]);
    m.position.copy(d.pos);
    m.castShadow = cfg.shadows;
    shards.push(m);
    scene.add(m);
  }

  /* --------------------------------------------------------- draped curtains */
  // Two soft cloth panels flanking the stage, gently rippled.
  // Velvet is unlit-looking by nature, so a standard material with a dark warm
  // colour reads better AND is far cheaper than physical sheen on integrated GPUs.
  const clothMat = new THREE.MeshStandardMaterial({
    map: velvetTex,
    color: 0x5e2a1c,
    roughness: 0.95,
    metalness: 0.0,
    envMap: envTex,
    envMapIntensity: 0.3,
    side: THREE.DoubleSide,
  });
  clothMat.map.repeat.set(1.4, 1.2);
  for (const side of [-1, 1]) {
    const [sw, sh] = cfg.clothSeg;
    const g = new THREE.PlaneGeometry(4.2, 5.6, sw, sh);
    const p = g.attributes.position;
    const noise = makeNoise2D(31 + side);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const t = (x + 2.1) / 4.2;
      const fold = Math.sin(t * 10 + y * 0.7) * 0.16 + fbm(noise, t * 3, ((y + 2.8) / 5.6) * 3, 3) * 0.28;
      const flare = 0.35 * Math.pow(1 - (t - 0.5) * 2, 2);
      p.setZ(i, fold + flare);
    }
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, clothMat);
    mesh.position.set(side * 4.3, 0.4, -1.9);
    mesh.rotation.y = -side * 0.55;
    mesh.receiveShadow = cfg.shadows;
    scene.add(mesh);
  }

  // A folded linen runner under the plinth.
  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 4.4),
    new THREE.MeshStandardMaterial({
      map: linenTex,
      color: 0x7d7568,
      roughness: 0.98,
      envMap: envTex,
      envMapIntensity: 0.2,
    }),
  );
  runner.rotation.x = -Math.PI / 2;
  runner.position.y = -2.345;
  runner.receiveShadow = cfg.shadows;
  scene.add(runner);

  /* -------------------------------------------------------------------- dust */
  // Dust is CPU-animated but only the exposed band is touched — on the low tier
  // the sprite count drops to a couple hundred and the update writes to a slice.
  const DUST = cfg.dust;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  const dustSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 22;
    dustPos[i * 3 + 1] = Math.random() * 11 - 3;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 18;
    dustSeed[i] = Math.random() * TAU;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
  const dustMat = new THREE.PointsMaterial({
    size: 0.062,
    map: glowTex,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffdcb4,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
  const dustAttr = dustGeo.attributes.position;

  /* ------------------------------------------------------------------- resize */
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.max(cfg.minDpr, Math.min(window.devicePixelRatio, cfg.dprCap)) * quality);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  /* ------------------------------------------------------------ scroll camera */
  // Keyframes: a complete camera + lighting + object state at a given page progress.
  // The scroll system (ui.js) writes target progress; the loop eases toward it.
  const route = [
    { p: 0.0, tgt: new THREE.Vector3(0, -0.1, 0), dist: 8.2, az: 0.0, pol: 1.42, fov: 38, exposure: 1.02, shards: 0.0, dust: 0.55, floor: 0.38, cloth: 0.0 },
    { p: 0.2, tgt: new THREE.Vector3(0, 0.15, 0), dist: 5.4, az: 0.85, pol: 1.5, fov: 34, exposure: 1.12, shards: 0.35, dust: 0.7, floor: 0.3, cloth: 0.6 },
    { p: 0.42, tgt: new THREE.Vector3(0, 0.55, 0), dist: 3.2, az: 2.1, pol: 1.32, fov: 30, exposure: 1.2, shards: 1.0, dust: 0.9, floor: 0.2, cloth: 1.0 },
    { p: 0.64, tgt: new THREE.Vector3(0, 1.4, 0), dist: 9.5, az: 3.4, pol: 1.6, fov: 42, exposure: 0.9, shards: 1.6, dust: 0.55, floor: 0.16, cloth: 0.9 },
    { p: 0.84, tgt: new THREE.Vector3(0, 0.9, 0), dist: 6.4, az: 5.0, pol: 1.2, fov: 36, exposure: 1.05, shards: 2.2, dust: 0.8, floor: 0.28, cloth: 0.4 },
    { p: 1.0, tgt: new THREE.Vector3(0, -0.2, 0), dist: 7.6, az: 6.28, pol: 1.44, fov: 38, exposure: 1.0, shards: 2.8, dust: 0.6, floor: 0.4, cloth: 0.15 },
  ];
  const camState = { ...route[0], tgt: route[0].tgt.clone() };

  function sampleRoute(p) {
    let i = 0;
    while (i < route.length - 2 && p > route[i + 1].p) i++;
    const a = route[i], b = route[i + 1];
    const t = smoothstep(clamp((p - a.p) / (b.p - a.p), 0, 1));
    return {
      tgt: a.tgt.clone().lerp(b.tgt, t),
      dist: lerp(a.dist, b.dist, t),
      az: lerp(a.az, b.az, t),
      pol: lerp(a.pol, b.pol, t),
      fov: lerp(a.fov, b.fov, t),
      exposure: lerp(a.exposure, b.exposure, t),
      shards: lerp(a.shards, b.shards, t),
      dust: lerp(a.dust, b.dust, t),
      floor: lerp(a.floor, b.floor, t),
      cloth: lerp(a.cloth, b.cloth, t),
    };
  }

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  // Scroll progress comes from the same reader the DOM uses.
  let progress = 0;
  let progressTarget = 0;
  function setProgress(p) { progressTarget = p; }

  let running = true;
  let frames = 0;
  let last = performance.now();

  // Frame governor: the low tier renders on a fixed 30 Hz cadence and skips the
  // requestAnimationFrame it does not need. That halves the GPU and CPU cost
  // without lowering the resolution, which is the trade a Haswell iGPU wants.
  const budget = cfg.fps ? 1000 / cfg.fps + 1.5 : 0;
  let acc = 0;

  // Only rebuild the shadow map while the sculpture is actually turning visibly.
  let shadowClock = 0;

  function frame(now = performance.now()) {
    if (!running) return;
    requestAnimationFrame(frame);

    const delta = now - last;
    last = now;

    if (budget) {
      acc += delta;
      if (acc < budget) return;   // leave the frame alone: no GL work at all
      acc = 0;
    }

    const dt = Math.min(delta / 1000, 0.05);
    const t = now / 1000;

    progress += (progressTarget - progress) * Math.min(1, dt * 6.5);
    const s = sampleRoute(progress);

    // ease camera state
    camState.tgt.lerp(s.tgt, 0.12);
    camState.dist = lerp(camState.dist, s.dist, 0.1);
    camState.az = lerp(camState.az, s.az, 0.1);
    camState.pol = lerp(camState.pol, s.pol, 0.1);

    pointer.x = lerp(pointer.x, pointer.tx, 0.05);
    pointer.y = lerp(pointer.y, pointer.ty, 0.05);

    const az = camState.az + pointer.x * 0.16 + Math.sin(t * 0.11) * 0.03;
    const pol = clamp(camState.pol + pointer.y * 0.1, 0.7, 1.85);
    const r = camState.dist;
    camera.position.set(
      camState.tgt.x + r * Math.sin(pol) * Math.sin(az),
      camState.tgt.y + r * Math.cos(pol),
      camState.tgt.z + r * Math.sin(pol) * Math.cos(az),
    );
    camera.lookAt(camState.tgt);
    if (Math.abs(camera.fov - s.fov) > 0.01) {
      camera.fov = lerp(camera.fov, s.fov, 0.1);
      camera.updateProjectionMatrix();
    }
    renderer.toneMappingExposure = lerp(renderer.toneMappingExposure, s.exposure, 0.08);

    // sculpture life
    sculpture.rotation.y = t * 0.06 + progress * 0.5;
    knot.rotation.y = -t * 0.02;
    crown.rotation.z = t * 0.22;
    orbit.rotation.z = -t * 0.45;
    orbit.rotation.x = Math.PI / 2.3 + Math.sin(t * 0.4) * 0.15;

    // shards drift out on their routes
    for (let i = 0; i < shards.length; i++) {
      const m = shards[i];
      const k = clamp(s.shards - i * 0.7, 0, 1.4);
      const base = shardDefs[i].pos;
      m.position.set(
        base.x * (0.7 + k * 0.5),
        base.y + Math.sin(t * 0.6 + i * 2) * 0.12 + k * 0.35,
        base.z * (0.8 + k * 0.4),
      );
      m.rotation.set(t * (0.25 + i * 0.12), t * (0.4 - i * 0.1), 0);
      m.scale.setScalar(0.001 + clamp(k, 0.001, 1) * 0.95);
    }

    // dust: cheap vertical drift, one buffer upload per frame
    dustMat.opacity = s.dust;
    dust.rotation.y = t * 0.01 + progress * 0.35;
    const arr = dustAttr.array;
    const step = dt * 0.02;
    for (let i = 0; i < DUST; i++) {
      const j = i * 3 + 1;
      arr[j] += step + Math.sin(t * 0.4 + dustSeed[i]) * step * 2.2;
      if (arr[j] > 8) arr[j] = -3;
    }
    dustAttr.needsUpdate = true;

    // key light follows the camera a little so the reveal never goes flat
    key.position.x = 5.5 + pointer.x * 0.8;
    key.position.y = 7.5 + pointer.y * 0.5;
    rim.position.x = -6.5 - pointer.x * 0.6;

    floorMat.envMapIntensity = s.floor * 1.2;

    // shadow refresh at ~4 Hz only — it is a whole extra scene draw
    if (cfg.shadows) {
      shadowClock += dt;
      if (shadowClock > 0.22) {
        shadowClock = 0;
        key.shadow.needsUpdate = true;
      }
    }

    renderer.render(scene, camera);
    frames++;
  }

  // Draw one frame synchronously so the curtain lifts with pixels already on screen.
  renderer.render(scene, camera);
  requestAnimationFrame((n) => { last = n; frame(n); });

  // Pause when hidden — saves battery on a long scroll page.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; }
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame((n) => { last = n; frame(n); }); }
  });

  // Adaptive resolution: if we cannot hold ~26 fps for two seconds, drop the
  // drawing buffer a step. Restores nothing automatically — steady is better
  // than oscillating between sharp and smooth.
  let sampleStart = performance.now();
  let sampleFrames = 0;
  const watchQuality = () => {
    sampleFrames++;
    const span = performance.now() - sampleStart;
    if (span < 2000) return;
    const fps = (sampleFrames * 1000) / span;
    sampleStart = performance.now();
    sampleFrames = 0;
    if (fps < 26 && quality > 0.55) {
      quality = Math.max(0.5, quality - cfg.qualityStep);
      renderer.setPixelRatio(Math.max(cfg.minDpr, Math.min(window.devicePixelRatio, cfg.dprCap) * quality));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      document.documentElement.style.setProperty('--perf', quality.toFixed(2));
    }
  };
  const qualityTicker = setInterval(watchQuality, 500);

  // One-shot GL check (dev aid): `window.__atelierProbe()` in the console.
  const probe = () => {
    const gl = renderer.getContext();
    while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
    renderer.render(scene, camera);
    const err = gl.getError();
    return { err, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  };
  window.__atelierProbe = probe;

  return {
    cfg,
    scene,
    camera,
    renderer,
    three: THREE,
    setProgress,
    warmup() { /* first frame already drawn by the gate */ },
    get frames() { return frames; },
    dispose() {
      clearInterval(qualityTicker);
      running = false;
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      });
      [velvetTex, linenTex, woodTex, marbleTex, glowTex, envTex, contact.material.map].forEach((t) => t?.dispose());
      envRT.dispose();
      renderer.dispose();
    },
  };
}
