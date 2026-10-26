// The single source of truth for scroll state: one RAF-coalesced read, many consumers.
const state = { p: 0, y: 0, vh: 0, vw: 0, section: 0 };
let queued = false;
const subs = new Set();

function measure() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  state.vh = window.innerHeight;
  state.vw = window.innerWidth;
  state.y = window.scrollY;
  state.p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

function flush() {
  queued = false;
  measure();
  for (const fn of subs) fn(state);
}

export function onScroll(fn) {
  subs.add(fn);
  fn(state);
  return () => subs.delete(fn);
}

export function getScroll() {
  return state;
}

export function initScroll() {
  measure();
  const kick = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(flush);
  };
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick, { passive: true });
  // Page height changes as fonts load / images settle.
  new ResizeObserver(kick).observe(document.body);
  kick();
}
