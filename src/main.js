import './style.css';
import { createScene } from './scene.js';
import { initScroll, onScroll } from './scroll.js';
import { initUI } from './ui.js';

async function boot() {
  initScroll();
  initUI();

  const canvas = document.getElementById('stage');
  let scene = null;
  try {
    scene = createScene(canvas);
    window.__scene = scene;
    onScroll((s) => scene.setProgress(s.p));
  } catch (err) {
    console.error('[atelier] WebGL unavailable, falling back to the CSS stage.', err);
    document.documentElement.classList.add('no-webgl');
    canvas?.remove();
  }

  // Hold the curtain until the first frame (or textures) are ready.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.add('ready');
      scene?.warmup?.();
    });
  });
}

boot();
