import { assertFirstDraw, observeStartup } from './startup-frame-probe.mjs';
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

async function coldOpen(browser, browserName, { slowed = false, reduced = false, blockTurn = false } = {}) {
  const context = await browser.newContext({ ...mobile, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  try {
    const page = await context.newPage();
    const errors = [];
    let blocked = 0;
    page.on('pageerror', error => errors.push(error.message));
    if (blockTurn) await page.route(url => /startup-molar-turn[^/]*\.webp$/.test(url.pathname), route => {
      blocked++;
      return route.abort();
    });
    const cdp = browserName === 'Chrome' ? await context.newCDPSession(page) : null;
    if (cdp) {
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (slowed) await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 120, downloadThroughput: 1_500_000, uploadThroughput: 500_000,
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
        assert.equal(m.hadPortraitTurn, false, 'Reduced motion also holds the HTML portrait still');
      } else {
        assert.ok(m.live >= m.poster && m.flight > m.live && m.seating > m.flight);
        assertFirstDraw(m);
        if (blockTurn) {
          assert.ok(blocked > 0);
          assert.equal(m.firstPixels.turning, false, 'An unavailable optional image sheet retains the sharp still');
        }
        assert.ok(m.settled - m.flightStart >= 2675, 'The full seating sequence uses the longer 2.75 s choreography');
        assert.ok(!m.reversed && !m.waitMessage, 'The waiting orbit never reverses or displays a loading message');
        if (slowed) assert.ok(m.waitingArc >= 2 * Math.PI, 'A full waiting orbit was rendered on a cold mobile connection');
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
      console.log(browserName + (slowed ? ' 12 Mbit/s, 120 ms' : reduced ? ' reduced motion' : blockTurn ? ' unavailable sheet' : ' unthrottled'), JSON.stringify(m));
      assert.deepEqual(errors, []);
    };
    if (video && browserName === 'Chrome' && slowed) {
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
    await coldOpen(browser, name);
    if (name === 'Chrome') {
      await coldOpen(browser, name, { slowed: true });
      await coldOpen(browser, name, { blockTurn: true });
    }
    await coldOpen(browser, name, { reduced: true });
  } finally { await browser.close(); }
}
