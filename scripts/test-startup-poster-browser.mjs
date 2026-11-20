import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { recordBrowserInteraction } from './record-molar-transition.mjs';

const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
url.searchParams.set('qa', '1');
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const video = process.env.DENTAL_STARTUP_FILM;
const poster = '#journey-startup img';

// Measure the opaque silhouette in the decoded source, independent of the
// model, the CSS box's transparent margins, and any authored framing metadata.
async function posterBounds(page) {
  return page.locator(poster).evaluate(async img => {
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let l = canvas.width, r = -1, t = canvas.height, b = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] < 32) continue;
      l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
    }
    const rect = img.getBoundingClientRect(), sx = rect.width / canvas.width, sy = rect.height / canvas.height;
    return { bounds: { left: rect.left + sx * l, top: rect.top + sy * t, right: rect.left + sx * (r + 1), bottom: rect.top + sy * (b + 1) },
      source: [canvas.width, canvas.height], pixelDensity: 1 / sx, image: img.currentSrc,
      firstPixelAlpha: data[3], animations: img.getAnimations().length,
      canvasHidden: getComputedStyle(document.querySelector('#journey-canvas')).visibility === 'hidden' };
  });
}

async function checkInitialHTML(browser) {
  const context = await browser.newContext(mobile);
  try {
    const page = await context.newPage();
    // Keep the browser in its normal scripting mode (the site has an explicit
    // noscript fallback), but do not deliver any application JavaScript.
    await page.route('**/*', route => route.request().resourceType() === 'script' ? route.abort() : route.continue());
    await page.goto(url.href);
    const measured = await posterBounds(page);
    assert.equal(measured.firstPixelAlpha, 0);
    assert.equal(measured.animations, 0);
    assert.ok(measured.canvasHidden);
    const width = measured.bounds.right - measured.bounds.left;
    assert.ok(width >= .3 * 390 && width <= .42 * 390, 'First silhouette width: ' + width);
    assert.ok(measured.pixelDensity >= 3, 'The static image resolves each Retina pixel');
    return measured;
  } finally { await context.close(); }
}

function observeStartup() {
  const metrics = window.startupMeasurement = { maxYaw: 0, maxGrowth: 0, rootedTeeth: 0 };
  function compareFirstPixels(canvas, img) {
    const box = img.getBoundingClientRect(), stage = canvas.getBoundingClientRect();
    const dx = canvas.width / stage.width, dy = canvas.height / stage.height;
    const crop = document.createElement('canvas');
    crop.width = Math.round(box.width * dx); crop.height = Math.round(box.height * dy);
    const ctx = crop.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, (box.left - stage.left) * dx, (box.top - stage.top) * dy,
      box.width * dx, box.height * dy, 0, 0, crop.width, crop.height);
    const live = ctx.getImageData(0, 0, crop.width, crop.height).data;
    ctx.clearRect(0, 0, crop.width, crop.height);
    ctx.drawImage(img, 0, 0, crop.width, crop.height);
    const poster = ctx.getImageData(0, 0, crop.width, crop.height).data;
    let overlap = 0, union = 0, difference = 0;
    for (let i = 0; i < poster.length; i += 4) {
      const a = live[i + 3] >= 128, b = poster[i + 3] >= 128;
      if (a || b) union++;
      if (!a || !b) continue;
      overlap++;
      for (let c = i; c < i + 3; c++) difference += Math.abs(live[c] - poster[c]);
    }
    return { silhouetteOverlap: overlap / union, meanRGBError: difference / (3 * overlap) };
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
    if (!canvas?.dataset.frameCount || document.body.dataset.journeyHandoff !== 'cinematic' ||
      getComputedStyle(canvas).visibility !== 'visible') return;
    const app = window.__dentalExperience, shot = app.report().opening;
    if (!shot) return;
    if (!metrics.live) {
      metrics.live = performance.now();
      metrics.buffer = [canvas.width, canvas.height];
      metrics.first = shot;
      metrics.bounds = firstModelBounds();
      metrics.firstPixels = compareFirstPixels(canvas, img);
    }
    metrics.maxYaw = Math.max(metrics.maxYaw, Math.abs(shot.yaw));
    metrics.maxGrowth = Math.max(metrics.maxGrowth, shot.growth);
    const teeth = Number(canvas.dataset.visibleTeeth), coverage = app.arch.crownMix;
    if (coverage === 0) metrics.rootedTeeth = Math.max(metrics.rootedTeeth, teeth);
    if (teeth > 1 && coverage === 0 && !metrics.flight) metrics.flight = performance.now();
    if (coverage > .01 && coverage < .99 && !metrics.seating) metrics.seating = performance.now();
  }
  // Observe the draw that actually exposes the renderer before another frame
  // can advance the camera. A later Playwright round trip is already too late.
  new MutationObserver(sample).observe(document, {
    subtree: true, attributes: true, attributeFilter: ['data-frame-count', 'data-journey-handoff'],
  });
  document.addEventListener('load', event => {
    if (event.target.matches?.('#journey-startup img')) sample();
  }, true);
}

async function coldOpen(browser, browserName, measured, { slowed = false, reduced = false } = {}) {
  const context = await browser.newContext({ ...mobile, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = browserName === 'Chrome' ? await context.newCDPSession(page) : null;
    if (cdp) {
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (slowed) await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 120, downloadThroughput: 1_250_000, uploadThroughput: 500_000,
      });
    }
    await page.addInitScript(observeStartup);
    const exercise = async () => {
      await page.goto(url.href, { waitUntil: 'commit' });
      await page.waitForFunction(() => {
        if (document.body.hasAttribute('data-journey-loading')) return false;
        const app = window.__dentalExperience;
        return app?.arch?.crownMix === 1 && app.arch.visibleCount === 28 && !app.report().opening;
      }, null, { timeout: 120_000 });
      const final = await page.evaluate(() => {
        const { camera, target, story, finalView, reducedMotion } = window.__dentalExperience.report();
        return { camera, target, chapter: story.chapterId, finalView, reducedMotion, scroll: scrollY };
      });
      assert.equal(final.chapter, 'dentition');
      assert.equal(final.finalView, 'smile');
      assert.equal(final.scroll, 0);
      assert.equal(final.reducedMotion, reduced);
      const m = await page.evaluate(() => ({ ...window.startupMeasurement, settled: performance.now() }));
      assert.ok(m.poster > 0);
      if (reduced) {
        assert.equal(m.live, undefined, 'Reduced motion goes straight to the smile');
      } else {
        assert.ok(m.live >= m.poster && m.flight > m.live && m.seating > m.flight);
        assert.equal(m.first.yaw, 0);
        assert.equal(m.first.growth, 0);
        assert.ok(m.firstPixels.silhouetteOverlap > .985, JSON.stringify(m.firstPixels));
        assert.ok(m.firstPixels.meanRGBError < 5, JSON.stringify(m.firstPixels));
        for (const edge of Object.keys(m.bounds))
          assert.ok(Math.abs(m.bounds[edge] - measured.bounds[edge]) <= 5,
            edge + ': poster ' + measured.bounds[edge] + ', first live frame ' + m.bounds[edge]);
        assert.ok(m.buffer[0] >= 2 * mobile.viewport.width && m.buffer[1] >= 2 * mobile.viewport.height,
          'Initial WebGL frame preserves compact pixel density: ' + m.buffer);
        assert.ok(m.maxYaw > Math.PI && m.maxGrowth > .99, 'The tooth turns and grows without input');
        assert.equal(m.rootedTeeth, 28, 'All rooted teeth precede seating the crowns');
      }
      await page.waitForTimeout(800);
      const held = await page.evaluate(() => {
        const { camera, target, opening } = window.__dentalExperience.report();
        return { camera, target, opening, scroll: scrollY };
      });
      assert.deepEqual(held, { camera: final.camera, target: final.target, opening: null, scroll: 0 });
      console.log(browserName + (slowed ? ' 10 Mbit/s, 120 ms' : reduced ? ' reduced motion' : ' unthrottled'), JSON.stringify(m));
      assert.deepEqual(errors, []);
    };
    if (video && browserName === 'Chrome' && !slowed && !reduced) {
      await mkdir(dirname(video), { recursive: true });
      await recordBrowserInteraction(page, video, process.env.FFMPEG_PATH || 'ffmpeg', exercise);
    } else await exercise();
  } finally { await context.close(); }
}

for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['Chrome', 'WebKit']) {
  assert.ok(name === 'Chrome' || name === 'WebKit');
  const browser = await (name === 'Chrome' ? chromium.launch({ channel: 'chrome' }) : webkit.launch());
  try {
    const measured = await checkInitialHTML(browser);
    console.log(name + ' HTML poster', JSON.stringify(measured));
    await coldOpen(browser, name, measured);
    if (name === 'Chrome') await coldOpen(browser, name, measured, { slowed: true });
    await coldOpen(browser, name, measured, { reduced: true });
  } finally { await browser.close(); }
}
