import { onScroll, getScroll } from './scroll.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function initUI() {
  // Bridge: DOM scroll -> (future) scene progress. The scene subscribes below.
  window.__sceneProgress = 0;
  onScroll((s) => {
    window.__sceneProgress = s.p;
    document.documentElement.style.setProperty('--scroll', s.p.toFixed(4));
    document.body.style.setProperty('--sy', `${s.y.toFixed(1)}px`);
  });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  document.getElementById('visit-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    form.classList.add('sent');
    const note = form.querySelector('.form-note');
    if (note) note.textContent = 'Noted — Éloïse will write back within two days.';
  });

  /* --------------------------------------------------------------- reveals */
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '-12% 0px -12% 0px', threshold: 0.12 },
  );
  $$('[data-reveal]').forEach((el) => {
    el.style.setProperty('--i', String(el.dataset.delay || 0));
    io.observe(el);
  });

  // Split headline into words for staggered rise
  const splitTargets = $$('[data-split]');
  splitTargets.forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.style.setProperty('--i', String(i));
      const inner = document.createElement('span');
      inner.textContent = w;
      span.appendChild(inner);
      el.appendChild(span);
      el.appendChild(document.createTextNode(' '));
    });
  });

  // stagger the split headlines so a word-rise never plays all at once
  splitTargets.forEach((el) => {
    el.classList.add('split');
    const words = $$('.word', el);
    words.forEach((w, i) => w.style.setProperty('--i', String(i)));
  });

  /* ------------------------------------------------------------ chapter rail */
  const chapters = $$('.chapter');
  const dots = $$('.rail a');
  const chapterIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = e.target.id;
        dots.forEach((d) => d.classList.toggle('active', d.getAttribute('href') === `#${id}`));
        const idx = chapters.findIndex((c) => c.id === id);
        document.documentElement.style.setProperty('--chapter', String(idx));
        const label = $('#rail-label');
        if (label) label.textContent = e.target.dataset.label || '';
      }
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  chapters.forEach((c) => chapterIO.observe(c));

  /* ----------------------------------------------------------------- marquee */
  // Seamless CSS marquee: duplicate the track once.
  $$('.marquee-track').forEach((track) => {
    track.innerHTML += track.innerHTML;
  });

  /* -------------------------------------------------------------------- nav */
  const nav = $('#nav');
  onScroll((s) => {
    nav?.classList.toggle('scrolled', s.y > 40);
    const bar = $('#progress-bar');
    if (bar) bar.style.transform = `scaleX(${s.p})`;
  });

  /* --------------------------------------------------------- smooth anchors */
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const target = id === '#' ? document.body : document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ------------------------------------------------------------ cursor halo */
  if (!reduce && window.matchMedia('(pointer: fine)').matches) {
    const halo = $('#halo');
    let x = window.innerWidth / 2, y = window.innerHeight / 2, tx = x, ty = y;
    window.addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function loop() {
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      halo.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      requestAnimationFrame(loop);
    })();
    $$('a, button, [data-hover]').forEach((el) => {
      el.addEventListener('pointerenter', () => halo.classList.add('grow'));
      el.addEventListener('pointerleave', () => halo.classList.remove('grow'));
    });
  } else {
    $('#halo')?.remove();
  }

  /* ------------------------------------------------------------ parallax type */
  const layers = $$('[data-parallax]');
  (function loop() {
    const s = getScroll();
    for (const el of layers) {
      const speed = parseFloat(el.dataset.parallax) || 0.1;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2 - s.vh / 2;
      el.style.setProperty('--py', `${(-mid * speed).toFixed(2)}px`);
    }
    requestAnimationFrame(loop);
  })();

  /* ------------------------------------------------------- counter animation */
  const countIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      const end = parseFloat(el.dataset.count);
      const dur = 1400;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = (end * eased).toFixed(el.dataset.decimals ? Number(el.dataset.decimals) : 0);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      countIO.unobserve(el);
    }
  }, { threshold: 0.5 });
  $$('[data-count]').forEach((el) => countIO.observe(el));
}
