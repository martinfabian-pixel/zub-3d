import assert from 'node:assert/strict';

export function assertFirstDraw(m) {
  const pixels = m.firstPixels;
  assert.equal(m.first.growth, 0);
  assert.ok(pixels && pixels.silhouetteOverlap > .985, JSON.stringify(pixels));
  assert.ok(pixels.meanRGBError < 5, JSON.stringify(pixels));
  assert.ok(Math.abs(m.first.yaw - pixels.cellIndex * 20 / 15 * Math.PI / 180) < 1e-5,
    'First real camera orientation must match the HTML frame that was on screen');
  for (const edge of Object.keys(m.bounds))
    assert.ok(Math.abs(m.bounds[edge] - pixels.bounds[edge]) < 4,
      edge + ': last poster cell ' + pixels.bounds[edge] + ', first live frame ' + m.bounds[edge]);
}

// Runs in the browser, before application scripts or input.
export function observeStartup() {
  const metrics = window.startupMeasurement = { hadPortraitTurn: false, maxYaw: 0, maxGrowth: 0, rootedTeeth: 0, waitingArc: 0 };
  let priorWaitHeading;
  async function compareFirstPixels(canvas, img) {
    const cell = document.querySelector('.startup-portrait.is-turning .startup-turn-window');
    const box = (cell || img).getBoundingClientRect(), stage = canvas.getBoundingClientRect();
    const dx = canvas.width / stage.width, dy = canvas.height / stage.height;
    const crop = document.createElement('canvas');
    crop.width = Math.round(box.width * dx); crop.height = Math.round(box.height * dy);
    const ctx = crop.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, (box.left - stage.left) * dx, (box.top - stage.top) * dy,
      box.width * dx, box.height * dy, 0, 0, crop.width, crop.height);
    const live = ctx.getImageData(0, 0, crop.width, crop.height).data;
    ctx.clearRect(0, 0, crop.width, crop.height);
    let cellIndex = 0;
    if (cell) {
      const style = getComputedStyle(cell);
      const [column, row] = style.backgroundPosition.split(/\s+/).map(percent => Math.round(parseFloat(percent) * 3 / 100));
      cellIndex = row * 4 + column;
      if (cellIndex !== Number(style.getPropertyValue('--portrait-frame')))
        throw Error('Painted loading cell does not match the advertised frame: ' + style.backgroundPosition);
      const sprite = new Image();
      sprite.src = style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];
      await sprite.decode();
      const w = sprite.naturalWidth / 4, h = sprite.naturalHeight / 4;
      ctx.drawImage(sprite, column * w, row * h, w, h, 0, 0, crop.width, crop.height);
    } else ctx.drawImage(img, 0, 0, crop.width, crop.height);
    const poster = ctx.getImageData(0, 0, crop.width, crop.height).data;
    let left = crop.width, right = 0, top = crop.height, bottom = 0;
    let overlap = 0, union = 0, difference = 0;
    for (let i = 0; i < poster.length; i += 4) {
      const a = live[i + 3] >= 128, b = poster[i + 3] >= 128;
      if (b) {
        const x = (i / 4) % crop.width, y = Math.floor((i / 4) / crop.width);
        left = Math.min(left, x); right = Math.max(right, x + 1);
        top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
      }
      if (a || b) union++;
      if (!a || !b) continue;
      overlap++;
      for (let c = i; c < i + 3; c++) difference += Math.abs(live[c] - poster[c]);
    }
    const bounds = {
      left: box.left + left * box.width / crop.width, right: box.left + right * box.width / crop.width,
      top: box.top + top * box.height / crop.height, bottom: box.top + bottom * box.height / crop.height,
    };
    return { silhouetteOverlap: overlap / union, meanRGBError: difference / (3 * overlap), bounds, cellIndex, turning: !!cell };
  }
  function firstModelBounds() {
    const app = window.__dentalExperience;
    const camera = app.rig.camera, mesh = app.arch.teeth.get(36).mesh;
    const canvas = document.querySelector('#journey-canvas'), rect = canvas.getBoundingClientRect();
    mesh.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    const v = camera.position.clone();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).project(camera);
      const x = rect.left + (.5 + v.x * .5) * rect.width, y = rect.top + (.5 - v.y * .5) * rect.height;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return { left, top, right, bottom };
  }
  function sample() {
    const img = document.querySelector('#journey-startup img');
    const canvas = document.querySelector('#journey-canvas');
    if (img?.complete && img.naturalWidth && !metrics.poster) metrics.poster = performance.now();
    if (img?.parentElement.classList.contains('is-turning')) metrics.hadPortraitTurn = true;
    if (!canvas?.dataset.frameCount || document.body.dataset.journeyHandoff !== 'cinematic' ||
      getComputedStyle(canvas).visibility !== 'visible') return;
    const app = window.__dentalExperience, state = app.report(), shot = state.opening;
    if (!shot) return;
    if (!metrics.live) {
      metrics.live = performance.now();
      metrics.buffer = [canvas.width, canvas.height];
      metrics.first = shot;
      metrics.bounds = firstModelBounds();
      compareFirstPixels(canvas, img).then(result => { metrics.firstPixels = result; });
    }
    metrics.maxYaw = Math.max(metrics.maxYaw, Math.abs(shot.yaw));
    metrics.maxGrowth = Math.max(metrics.maxGrowth, shot.growth);
    if (shot.phase === 'waiting') {
      const [x, , z] = state.camera;
      const heading = Math.atan2(x - state.target[0], z - state.target[2]);
      if (priorWaitHeading !== undefined) {
        const step = Math.atan2(Math.sin(heading - priorWaitHeading), Math.cos(heading - priorWaitHeading));
        metrics.waitingArc += step;
        if (step < -.00001) metrics.reversed = true;
      }
      priorWaitHeading = heading;
      if (document.body.textContent.includes('Načítavam zvyšok chrupu')) metrics.waitMessage = true;
    }
    if (shot.phase === 'flight' && !metrics.flightStart) metrics.flightStart = performance.now();
    const teeth = Number(canvas.dataset.visibleTeeth), coverage = app.arch.crownMix;
    if (coverage === 0) metrics.rootedTeeth = Math.max(metrics.rootedTeeth, teeth);
    if (teeth > 1 && coverage === 0 && !metrics.flight) metrics.flight = performance.now();
    if (coverage > .01 && coverage < .99 && !metrics.seating) metrics.seating = performance.now();
  }
  // Observe the draw that actually exposes the renderer before another frame
  // can advance the camera. A later Playwright round trip is already too late.
  new MutationObserver(sample).observe(document, {
    subtree: true, attributes: true, attributeFilter: ['class', 'data-frame-count', 'data-journey-handoff'],
  });
  document.addEventListener('load', event => {
    if (event.target.matches?.('#journey-startup img')) sample();
  }, true);
}
