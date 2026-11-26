/* Home: a procedural, pointer-responsive field of pearlescent light.
   Canvas 2D keeps the experience available without WebGL or external assets. */
(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  const stage = document.getElementById('aura-stage');
  const canvas = document.getElementById('aura-canvas');
  const grain = document.getElementById('aura-grain');
  const motionButton = document.getElementById('home-motion');
  if (!hero || !stage || !canvas || !motionButton) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const fieldCanvas = document.createElement('canvas');
  const fieldCtx = fieldCanvas.getContext('2d', { alpha: false });
  if (!fieldCtx) return;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = motionPreference.matches;
  let visible = true, obscured = document.body.classList.contains('modal-open'), ready = false;
  let frame = 0, lastTime = 0, lastDraw = 0, elapsed = 12;
  let width = 0, height = 0, renderWidth = 0, renderHeight = 0, pixels;
  let scale = 1, fieldScale = 1, aspect = 1, seed = 94721;
  let pointer = { x: .5, y: .48, active: false };
  let eased = { x: .5, y: .48 }, pointerHeat = 0;
  let lastPointerTime = -Infinity, lastPointTime = -Infinity;
  let trails = [], waves = [], resizeTimer;
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = v => v * v * (3 - 2 * v);
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  // A repeatable, smooth noise field supplies the organic edges and fine ridges.
  const noiseSize = 128, noiseMask = noiseSize - 1;
  const noiseMap = new Float32Array(noiseSize * noiseSize);
  for (let i = 0; i < noiseMap.length; i++) noiseMap[i] = random();
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smooth(x - ix), fy = smooth(y - iy);
    const x0 = ix & noiseMask, x1 = (ix + 1) & noiseMask;
    const y0 = (iy & noiseMask) * noiseSize, y1 = ((iy + 1) & noiseMask) * noiseSize;
    const a = noiseMap[y0 + x0], b = noiseMap[y0 + x1];
    const c = noiseMap[y1 + x0], d = noiseMap[y1 + x1];
    return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
  }
  const stops = [
    [0, [239, 236, 240]], [.075, [223, 216, 234]],
    [.17, [197, 196, 221]], [.28, [204, 170, 205]],
    [.36, [239, 181, 198]], [.405, [250, 210, 188]],
    [.45, [248, 236, 197]], [.49, [216, 234, 214]],
    [.54, [169, 204, 215]], [.60, [135, 166, 194]],
    [.67, [152, 154, 185]], [.78, [191, 165, 199]],
    [.89, [230, 189, 210]], [1.01, [246, 217, 208]],
    [1.12, [241, 237, 210]], [1.23, [216, 231, 224]],
    [1.40, [238, 234, 243]], [1.75, [249, 246, 239]]
  ];
  const paletteSize = 2048, palette = new Float32Array(paletteSize * 3);
  for (let i = 0; i < paletteSize; i++) {
    const value = i / (paletteSize - 1) * 1.75;
    let j = 1;
    while (j < stops.length - 1 && value > stops[j][0]) j++;
    const a = stops[j - 1], b = stops[j], t = smooth(clamp((value - a[0]) / (b[0] - a[0]), 0, 1));
    for (let k = 0; k < 3; k++) palette[i * 3 + k] = a[1][k] + (b[1][k] - a[1][k]) * t;
  }
  const expTable = new Float32Array(4096);
  for (let i = 0; i < expTable.length; i++) expTable[i] = Math.exp(-i / 256);
  const falloff = v => expTable[Math.min(4095, Math.max(0, Math.floor(v * 256)))];

  function makeGrain() {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 192;
    const g = tile.getContext('2d');
    if (!g) return;
    const texture = g.createImageData(192, 192);
    for (let i = 0; i < texture.data.length; i += 4) {
      const shade = 115 + Math.floor(random() * 140);
      texture.data[i] = texture.data[i + 1] = texture.data[i + 2] = shade;
      texture.data[i + 3] = 255;
    }
    g.putImageData(texture, 0, 0);
    grain.style.backgroundImage = `url(${tile.toDataURL()})`;
  }

  function draw() {
    if (!pixels) return;
    const data = pixels.data;
    const t = elapsed * .065;
    const dx = (eased.x - .5) * .24 * pointerHeat;
    const dy = (eased.y - .5) * .20 * pointerHeat;
    const originX = Math.sin(t * .43) * .09 + dx;
    const originY = Math.cos(t * .31) * .07 + dy;
    const phaseX = t * .12, phaseY = -t * .10;
    const portrait = aspect < .85;
    const stretchX = portrait ? 1.08 : .79;
    const stretchY = portrait ? .72 : 1.03;
    const points = trails.map(p => ({ x: (p.x - .5) * aspect * 2, y: (p.y - .5) * 2, life: p.life }));
    const ripples = waves.map(w => ({ x: (w.x - .5) * aspect * 2, y: (w.y - .5) * 2, age: w.age }));
    let offset = 0;
    for (let iy = 0; iy < renderHeight; iy++) {
      const y = (iy + .5) / renderHeight * 2 - 1;
      for (let ix = 0; ix < renderWidth; ix++) {
        let x = ((ix + .5) / renderWidth * 2 - 1) * aspect;
        let py = y;
        let glow = 0;
        for (let j = 0; j < points.length; j++) {
          const p = points[j], vx = x - p.x, vy = py - p.y;
          const influence = falloff((vx * vx + vy * vy) * 6) * p.life;
          x += vy * influence * .20;
          py -= vx * influence * .20;
          glow += influence * .055;
        }
        for (let j = 0; j < ripples.length; j++) {
          const w = ripples[j], vx = x - w.x, vy = py - w.y;
          const radius = Math.sqrt(vx * vx + vy * vy);
          const band = radius - w.age * .35;
          const force = falloff(band * band * 90) * (1 - w.age / 3.5) * .045;
          x += vx * force; py += vy * force;
          glow += force * .5;
        }
        const n1 = noise(x * 1.35 + 13 + phaseX, py * 1.35 + 7 + phaseY);
        const n2 = noise(x * 1.6 + 40 - phaseY, py * 1.6 + 24 + phaseX);
        const u = x * stretchX + (n1 - .5) * .80 - originX;
        const v = py * stretchY + (n2 - .5) * .64 - originY;
        const edge = noise(u * 4.6 + 15, v * 4.6 + 62 + t * .035) - .5;
        const fine = noise(u * 10.5 + 37, v * 10.5 + 18) - .5;
        // Asymmetric overlapping lobes form a single fluid, slowly breathing field.
        let value = falloff((u + .40) * (u + .40) * 2.6 + (v - .18) * (v - .18) * 2.3) * .99;
        value += falloff((u - .58) * (u - .58) * 3.5 + (v + .25) * (v + .25) * 2.0) * .88;
        value += falloff((u + .12) * (u + .12) * 7.0 + (v + .63) * (v + .63) * 5.0) * .32;
        value += edge * .10 + fine * .021 + glow;
        const index = Math.floor(clamp(value / 1.75, 0, 1) * (paletteSize - 1)) * 3;
        const mist = .09 + (noise(x * .75 + 55, py * .75 + 46) * .13);
        const light = falloff((u - .05) * (u - .05) * 3.5 + (v + .12) * (v + .12) * 3.5) * .08;
        const dither = ((ix * 17 + iy * 23) % 7 - 3) * .24;
        for (let k = 0; k < 3; k++) {
          const colour = palette[index + k];
          data[offset + k] = colour + (246 - colour) * (mist + light) + dither;
        }
        data[offset + 3] = 255;
        offset += 4;
      }
    }
    fieldCtx.putImageData(pixels, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fieldCanvas, 0, 0, width, height);
    drawLight(.29 + Math.sin(t * .43) * .015 + dx * .15, .39 + dy * .12, 1.0, -.3);
    drawLight(.77 + dx * .08, .23 + Math.cos(t * .2) * .025, .62, .25);
    drawLight(.67 + dx * .1, .73 + dy * .08, .32, .15);
  }

  function drawLight(nx, ny, amount, angle) {
    const x = nx * width, y = ny * height;
    const unit = Math.min(width, height) * .10 * amount;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, unit * 1.15);
    glow.addColorStop(0, 'rgba(255,251,234,.64)');
    glow.addColorStop(.22, 'rgba(255,234,220,.28)');
    glow.addColorStop(1, 'rgba(255,240,230,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-unit * 1.2, -unit * 1.2, unit * 2.4, unit * 2.4);
    ctx.globalAlpha = .48;
    const beam = ctx.createRadialGradient(0, 0, 0, 0, 0, unit);
    beam.addColorStop(0, 'rgba(255,255,247,.95)');
    beam.addColorStop(.26, 'rgba(255,255,247,.5)');
    beam.addColorStop(1, 'rgba(255,255,247,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(0, -unit);
    ctx.quadraticCurveTo(unit * .045, -unit * .06, unit, 0);
    ctx.quadraticCurveTo(unit * .045, unit * .06, 0, unit);
    ctx.quadraticCurveTo(-unit * .045, unit * .06, -unit, 0);
    ctx.quadraticCurveTo(-unit * .045, -unit * .06, 0, -unit);
    ctx.fill();
    ctx.restore();
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    const w = Math.round(rect.width), h = Math.round(rect.height);
    if (!w || !h || (w === width && h === height && ready)) return;
    width = w; height = h; aspect = width / height;
    scale = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const pixelBudget = matchMedia('(pointer: coarse)').matches ? 40000 : 60000;
    fieldScale = Math.min(1, Math.sqrt(pixelBudget / (width * height)));
    renderWidth = Math.max(1, Math.round(width * fieldScale));
    renderHeight = Math.max(1, Math.round(height * fieldScale));
    fieldCanvas.width = renderWidth; fieldCanvas.height = renderHeight;
    pixels = fieldCtx.createImageData(renderWidth, renderHeight);
    draw(); ready = true;
    hero.classList.add('effect-ready', 'motion-available');
    syncMotion();
  }

  function tick(now) {
    frame = 0;
    if (paused || !visible || obscured || document.hidden) { lastTime = 0; return; }
    const dt = lastTime ? Math.min((now - lastTime) / 1000, .1) : 0;
    lastTime = now; elapsed += dt;
    const active = pointer.active && now - lastPointerTime < 2200;
    pointerHeat += ((active ? 1 : 0) - pointerHeat) * Math.min(1, dt * 2);
    eased.x += (pointer.x - eased.x) * Math.min(1, dt * 4);
    eased.y += (pointer.y - eased.y) * Math.min(1, dt * 4);
    trails.forEach(p => { p.life -= dt * .22; });
    trails = trails.filter(p => p.life > 0);
    waves.forEach(w => { w.age += dt; });
    waves = waves.filter(w => w.age < 3.5);
    if (now - lastDraw >= 1000 / 24) { draw(); lastDraw = now; }
    frame = requestAnimationFrame(tick);
  }
  function syncMotion() {
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    motionButton.querySelector('.motion-label').textContent = paused ? 'Play motion' : 'Pause motion';
    motionButton.querySelector('path').setAttribute('d', paused ? 'M5 3 12 8 5 13Z' : 'M5 3v10M11 3v10');
    if (paused || !visible || obscured || document.hidden) {
      cancelAnimationFrame(frame); frame = 0; lastTime = 0;
    } else if (!frame && ready) frame = requestAnimationFrame(tick);
  }
  function locate(event) {
    const rect = stage.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  }
  function move(event) {
    if (paused || event.target.closest('a,button')) return;
    const now = performance.now(), p = locate(event);
    pointer = { ...p, active: true }; lastPointerTime = now;
    if (now - lastPointTime > 95) {
      trails.push({ ...p, life: .9 });
      if (trails.length > 7) trails.shift();
      lastPointTime = now;
    }
  }
  hero.addEventListener('pointermove', move, { passive: true });
  hero.addEventListener('pointerdown', event => {
    if (paused || event.target.closest('a,button')) return;
    move(event);
    const p = locate(event);
    waves.push({ ...p, age: 0 });
    if (waves.length > 2) waves.shift();
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { pointer.active = false; });
  hero.addEventListener('pointercancel', () => { pointer.active = false; });
  hero.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') pointer.active = false; });
  motionButton.addEventListener('click', () => { paused = !paused; syncMotion(); });
  motionPreference.addEventListener('change', event => { paused = event.matches; syncMotion(); });
  document.addEventListener('visibilitychange', syncMotion);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; syncMotion(); }, { threshold: .01 }).observe(hero);
  new MutationObserver(() => { obscured = document.body.classList.contains('modal-open'); syncMotion(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 100);
  }).observe(stage);
  makeGrain(); resize();
})();
