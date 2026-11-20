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

async function firstModelBounds(page) {
  return page.evaluate(() => {
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
  });
}

async function coldOpen(browser, browserName, measured, slowed = false) {
  const context = await browser.newContext(mobile);
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
    await page.addInitScript(() => {
      const metrics = window.startupMeasurement = {};
      function sample(now) {
        const img = document.querySelector('#journey-startup img');
        const canvas = document.querySelector('#journey-canvas');
        if (img?.complete && img.naturalWidth && !metrics.poster) metrics.poster = now;
        if (canvas?.dataset.frameCount > 0 && getComputedStyle(canvas).visibility === 'visible' &&
          document.body.dataset.journeyHandoff === 'cinematic') {
          metrics.live = now;
          metrics.buffer = [canvas.width, canvas.height];
          return;
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    const exercise = async () => {
      await page.goto(url.href, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.startupMeasurement?.live && window.__dentalExperience?.report().opening,
        null, { timeout: 120_000 });
      const bounds = await firstModelBounds(page);
      for (const edge of Object.keys(bounds))
        assert.ok(Math.abs(bounds[edge] - measured.bounds[edge]) <= 5, edge + ': poster ' + measured.bounds[edge] + ', live ' + bounds[edge]);
      const shot = () => page.evaluate(() => window.__dentalExperience.report().opening);
      const initial = await shot();
      assert.equal(initial.yaw, 0);
      assert.equal(initial.growth, 0);
      await page.waitForTimeout(400);
      assert.deepEqual(await shot(), initial, 'A user can study the still tooth until the first gesture');
      const metrics = await page.evaluate(() => window.startupMeasurement);
      assert.ok(metrics.live >= metrics.poster && metrics.poster > 0);
      assert.ok(metrics.buffer[0] >= 2 * mobile.viewport.width && metrics.buffer[1] >= 2 * mobile.viewport.height,
        'Initial visible WebGL frame preserves compact quality: ' + metrics.buffer);
      console.log(browserName + (slowed ? ' 10 Mbit/s, 120 ms' : ' unthrottled'), JSON.stringify({ ...metrics, bounds }));
      if (cdp) {
        // A native finger drag on the stage (not a programmatic timeline jump).
        const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', {
          type, touchPoints: y === undefined ? [] : [{ x: 168, y, id: 0 }],
        });
        await touch('touchStart', 655);
        for (let i = 1; i <= 40; i++) {
          await touch('touchMove', 655 - 2 * i);
          await page.waitForTimeout(18);
        }
        await touch('touchEnd');
        await page.waitForFunction(() => (window.__dentalExperience.report().opening?.growth ?? 0) > .01);
        await page.waitForTimeout(350);
      } else {
        await page.getByRole('button', { name: 'Preskočiť úvod' }).tap();
        await page.waitForFunction(() => window.__dentalExperience.report().crownMix > .99 && !window.__dentalExperience.report().opening);
      }
      assert.deepEqual(errors, []);
    };
    if (slowed && video) {
      await mkdir(dirname(video), { recursive: true });
      await recordBrowserInteraction(page, video, process.env.FFMPEG_PATH || 'ffmpeg', exercise, { minFrames: 16 });
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
    if (name === 'Chrome') await coldOpen(browser, name, measured, true);
  } finally { await browser.close(); }
}
