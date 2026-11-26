/* Subtle texture and event-driven card light. No additional animation loop. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  const tile = document.createElement('canvas');
  tile.width = tile.height = 192;
  const ctx = tile.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(192, 192);
    let seed = 94721;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      const shade = 115 + Math.floor(seed / 4294967296 * 140);
      image.data[i] = image.data[i + 1] = image.data[i + 2] = shade;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    document.documentElement.style.setProperty('--pearl-grain', `url(${tile.toDataURL()})`);
  }
  let target = null, point = null, frame = 0;
  function reset() {
    if (target) {
      target.style.removeProperty('--pearl-x');
      target.style.removeProperty('--pearl-y');
    }
    target = null; point = null;
    cancelAnimationFrame(frame); frame = 0;
  }
  const grid = document.getElementById('project-grid');
  if (!grid) return;
  grid.addEventListener('pointermove', event => {
    if (reduced.matches || !hover.matches || event.pointerType === 'touch') return;
    const card = event.target.closest('.project-card');
    if (!card) { reset(); return; }
    if (target !== card) { reset(); target = card; }
    point = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      if (!target || !point) return;
      const rect = target.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, (point.x - rect.left) / rect.width * 100));
      const y = Math.max(0, Math.min(100, (point.y - rect.top) / rect.height * 100));
      target.style.setProperty('--pearl-x', x.toFixed(1) + '%');
      target.style.setProperty('--pearl-y', y.toFixed(1) + '%');
    });
  }, { passive: true });
  grid.addEventListener('pointerleave', reset);
  grid.addEventListener('pointercancel', reset);
  grid.addEventListener('click', reset);
  reduced.addEventListener('change', reset);
  hover.addEventListener('change', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
})();
