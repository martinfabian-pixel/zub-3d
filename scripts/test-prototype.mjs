// Local developer test: launches its OWN headless Chrome, never attaches to or
// automates the user's browser/desktop. All page navigation stays on localhost.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const origin = new URL(process.env.PROTOTYPE_TEST_URL || 'http://127.0.0.1:5173');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('This developer test only navigates localhost.');
const output = resolve(process.env.PROTOTYPE_REVIEW_DIR || 'docs/prototype-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const failures = [];
const warnings = [];
const report = { date: new Date().toISOString(), scope: 'Own headless desktop Chrome; mobile viewport/touch emulation, not physical mobile hardware.', errors, warnings, failures, views: [], benchmarks: [] };
const observe = (page) => {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  page.on('console', (entry) => { if (entry.type() === 'warning' && page.url().includes('/prototype/')) warnings.push(entry.text()); });
  page.on('requestfailed', (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
};
const ready = async (page) => {
  await page.waitForSelector('#prototype-canvas[data-ready="true"][data-frame-count]', { timeout: 45000 });
  await page.waitForTimeout(450); // Let OrbitControls damping + quality settle.
  const data = await page.locator('canvas').evaluate((canvas) => ({ ...canvas.dataset }));
  assert.equal(data.shaderErrors, '0');
  assert.equal(data.modelMeshes, '1');
  assert.equal(data.opacity, '1');
  return data;
};
const capture = async (page, name) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${output}/${name}.png` });
  report.views.push({ name, ...(await page.locator('canvas').evaluate((canvas) => ({ ...canvas.dataset }))) });
};
async function benchmark(page, label) {
  const measured = await page.evaluate(async () => {
    const app = window.__toothPrototype;
    const samples = [];
    const previousAutoRotate = app.controls.autoRotate;
    app.controls.autoRotate = true; // Only this opt-in benchmark, never public default.
    let previous;
    for (let index = 0; index < 150; index++) {
      const now = await new Promise(requestAnimationFrame);
      app.controls.update();
      if (index > 15) samples.push(now - previous);
      previous = now;
    }
    app.controls.autoRotate = previousAutoRotate;
    samples.sort((a, b) => a - b);
    const gl = app.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      frames: samples.length,
      medianFrameIntervalMs: samples[Math.floor(samples.length * 0.5)],
      p95FrameIntervalMs: samples[Math.floor(samples.length * 0.95)],
      meanFrameIntervalMs: samples.reduce((sum, ms) => sum + ms, 0) / samples.length,
      gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      scope: 'rAF intervals during forced orbit on this headless desktop; no GPU timer query, not a phone measurement.',
    };
  });
  report.benchmarks.push({ label, ...measured });
}
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  observe(page);
  await page.goto(new URL('/prototype/?qa=1&material=clay', origin).href);
  await ready(page);
  await capture(page, 'clay-default');
  await page.getByRole('button', { name: 'Detail žuvacej plochy', exact: true }).click();
  await capture(page, 'clay-crown');
  await page.goto(new URL('/prototype/?qa=1', origin).href);
  report.desktop = await ready(page);
  await capture(page, 'default');
  const originalCamera = await page.locator('canvas').getAttribute('data-camera');
  await page.mouse.move(640, 420);
  await page.mouse.down();
  await page.mouse.move(820, 470, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  assert.notEqual(await page.locator('canvas').getAttribute('data-camera'), originalCamera, 'Mouse orbit must change the camera.');
  await page.getByRole('button', { name: 'Obnoviť pohľad', exact: true }).click();
  await page.waitForTimeout(450);
  assert.equal(await page.locator('canvas').getAttribute('data-camera'), originalCamera, 'Reset must restore the original pose exactly.');
  await page.locator('canvas').focus();
  for (let step = 0; step < 10; step++) await page.keyboard.press('ArrowRight');
  await capture(page, 'side');
  for (let step = 0; step < 15; step++) await page.keyboard.press('ArrowRight');
  await capture(page, 'back');
  await page.getByRole('button', { name: 'Detail žuvacej plochy', exact: true }).click();
  await capture(page, 'crown');
  for (let step = 0; step < 2; step++) await page.getByRole('button', { name: 'Priblížiť', exact: true }).click();
  await capture(page, 'detail');
  for (let step = 0; step < 24; step++) await page.getByRole('button', { name: 'Priblížiť', exact: true }).click();
  await page.waitForTimeout(400);
  const limits = await page.locator('canvas').evaluate((canvas) => ({ ...canvas.dataset }));
  assert.ok(Number(limits.distance) >= Number(limits.minDistance) - 0.0001, 'Zoom cannot enter the bounding sphere.');
  await page.getByRole('button', { name: 'Obnoviť pohľad', exact: true }).click();
  await page.waitForTimeout(1000);
  const idleStart = Number(await page.locator('canvas').getAttribute('data-frame-count'));
  await page.waitForTimeout(650);
  assert.equal(Number(await page.locator('canvas').getAttribute('data-frame-count')), idleStart, 'Idle scene must stop rendering.');
  report.idleRenderingStopped = true;
  await benchmark(page, 'desktop-1280x900-dpr1');
  await page.getByRole('button', { name: 'Obnoviť pohľad', exact: true }).click();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  await phone.bringToFront();
  observe(phone);
  await phone.goto(new URL('/prototype/?qa=1', origin).href);
  report.mobile = await ready(phone);
  report.backgroundPause = { documentHidden: await page.evaluate(() => document.hidden) };
  if (report.backgroundPause.documentHidden) {
    const before = await page.locator('canvas').getAttribute('data-frame-count');
    await phone.waitForTimeout(250);
    report.backgroundPause.framesStayedConstant = (await page.locator('canvas').getAttribute('data-frame-count')) === before;
    assert.equal(report.backgroundPause.framesStayedConstant, true);
  }
  assert.equal(report.mobile.profile, 'compact');
  assert.equal(report.mobile.model, 'molar-mobile.glb');
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth), 390);
  await capture(phone, 'mobile');
  const cdp = await mobile.newCDPSession(phone);
  const beforeTouch = await phone.locator('canvas').getAttribute('data-camera');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 350, id: 0 }] });
  for (let step = 1; step <= 10; step++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 + step * 8, y: 350 + step * 2, id: 0 }] }); await phone.waitForTimeout(20); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForTimeout(900);
  report.touchDiagnostics = await phone.evaluate(() => ({ focused: document.hasFocus(), hidden: document.hidden, maxTouchPoints: navigator.maxTouchPoints, camera: window.__toothPrototype.camera.position.toArray(), canvas: { ...document.querySelector('canvas').dataset } }));
  assert.notEqual(await phone.locator('canvas').getAttribute('data-camera'), beforeTouch, 'Emulated one-finger orbit must work.');
  const beforePinch = Number(await phone.locator('canvas').getAttribute('data-distance'));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 165, y: 400, id: 0 }, { x: 225, y: 400, id: 1 }] });
  for (let step = 1; step <= 8; step++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 165 - step * 4, y: 400, id: 0 }, { x: 225 + step * 4, y: 400, id: 1 }] }); await phone.waitForTimeout(20); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForTimeout(650);
  assert.ok(Number(await phone.locator('canvas').getAttribute('data-distance')) < beforePinch, 'Emulated pinch must zoom in.');
  report.emulatedTouch = { oneFingerOrbit: true, pinch: true, physicalDevice: false };
  await phone.getByRole('button', { name: 'Obnoviť pohľad', exact: true }).click();
  await benchmark(phone, 'mobile-emulation-390x844-dpr1-on-desktop');
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.getByRole('button', { name: 'Obnoviť pohľad', exact: true }).click();
  await capture(phone, 'mobile-landscape');
  const retinaContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const retinaPage = await retinaContext.newPage();
  observe(retinaPage);
  await retinaPage.goto(new URL('/prototype/?qa=1', origin).href);
  report.retina = await ready(retinaPage);
  assert.equal(report.retina.pixelRatio, '1.5', 'High-DPR phone must respect the rendering budget.');
  await retinaContext.close();
  report.dispose = await page.evaluate(() => {
    const app = window.__toothPrototype;
    const before = { ...app.renderer.info.memory };
    app.dispose();
    app.dispose(); // Must be safe twice.
    return { before, after: { ...app.renderer.info.memory }, disposed: document.querySelector('canvas').dataset.disposed };
  });
  assert.equal(report.dispose.disposed, 'true');
  assert.equal(report.dispose.after.geometries, 0);
  // r186 keeps its two shared LTC tables and one DFG LUT outside scene ownership.
  // Normal/region maps, PMREM, shadow map and contact targets must all be gone.
  assert.equal(report.dispose.after.textures, 3);
  report.dispose.engineLookupTexturesRetained = 'Two shared RectArea LTC tables and the internal DFG_LUT; not tooth or render-target textures.';

  // Original page must still load its original multilayer model independently.
  await page.goto(new URL('/', origin).href);
  await page.waitForSelector('#tooth-canvas[data-ready="true"]', { timeout: 45000 });
  report.originalPage = await page.locator('#tooth-canvas').evaluate((canvas) => ({ ...canvas.dataset }));
  assert.equal(report.originalPage.assetTriangles, '388032');
  // Failure injection is confined to a new local test page, never browser settings.
  const noWebGL = await context.newPage();
  await noWebGL.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return String(kind).startsWith('webgl') ? null : getContext.call(this, kind, ...args);
    };
  });
  await noWebGL.goto(new URL('/prototype/', origin).href);
  await noWebGL.getByRole('alert').waitFor({ state: 'visible' });
  report.noWebGLFallback = await noWebGL.locator('#prototype-message').innerText();
  assert.match(report.noWebGLFallback, /WebGL 2/);
  assert.ok(await noWebGL.getByRole('button', { name: 'Skúsiť znova' }).isVisible());
  const missingModel = await context.newPage();
  await missingModel.route('**/prototype-assets/molar.glb*', (route) => route.fulfill({ status: 404, body: 'Test-only missing asset' }));
  await missingModel.goto(new URL('/prototype/', origin).href);
  await missingModel.getByRole('alert').waitFor({ state: 'visible' });
  report.loadingErrorFallback = await missingModel.locator('#prototype-message').innerText();
  assert.match(report.loadingErrorFallback, /nepodarilo načítať/);
  const cancelledLoad = await context.newPage();
  await cancelledLoad.route('**/prototype-assets/molar.glb*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try { await route.continue(); } catch { /* Page may already be disposed. */ }
  });
  await cancelledLoad.goto(new URL('/prototype/?qa=1', origin).href);
  await cancelledLoad.waitForFunction(() => Boolean(window.__toothLifecycle));
  await cancelledLoad.evaluate(async () => { window.__toothLifecycle.dispose(); await window.__toothLifecycle.ready; });
  report.cancelledPendingLoad = await cancelledLoad.locator('canvas').getAttribute('data-disposed');
  assert.equal(report.cancelledPendingLoad, 'true');
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(warnings.every((warning) => warning.includes('warning X4122')), 'Unexpected console warning: ' + warnings.join('\n'));
  report.precisionWarningNote = warnings.length ? 'ANGLE/D3D11 emitted nonfatal X4122 constant-fold precision warnings (~1e-17). All shader programs remain runnable; warning text is preserved above, not suppressed.' : null;
  assert.equal(failures.length, 0, failures.join('\n'));
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify({ passed: report.passed, failure: report.failure, views: report.views.map((v) => v.name), benchmarks: report.benchmarks, errors, warnings, failures }, null, 2));
}
