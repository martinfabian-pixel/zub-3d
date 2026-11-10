import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { angular, cameraProbe, distance, mouseDrag, nativeJump, pinchOut, touchDrag } from './browser-camera-probes.mjs';
import { DENTAL_CHAPTERS } from '../src/experience/story-config.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a local Vite server');
url.searchParams.set('qa', '1');
const screenshotDir = process.env.DENTAL_STORY_REVIEW_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

const fdis = Array.from({ length: 28 }, (_, index) => (1 + Math.floor(index / 7)) * 10 + 1 + index % 7);
const locations = [/horn.*prav/i, /horn.*ľav/i, /doln.*ľav/i, /doln.*prav/i];
const types = [/rezák/i, /rezák/i, /očný zub/i, /črenový zub/i, /črenový zub/i, /stolička/i, /stolička/i];
const chapterAt = id => DENTAL_CHAPTERS.find(chapter => chapter.id === id).at;
const read = page => page.evaluate(() => window.__dentalExperience.report());
const wait = (page, predicate, arg, timeout = 12000) => page.waitForFunction(predicate, arg, { timeout });
const selector = '.full-arch-focus-select';
const toggle = '.full-arch-anatomy-toggle';
const back = '.full-arch-focus-return';

async function seek(page, chapter) {
  const at = chapterAt(chapter);
  await nativeJump(page, at);
  await wait(page, ({ at, chapter }) => {
    const state = window.__dentalExperience.report();
    return state.story.chapterId === chapter && Math.abs(state.progress - at) < .003
      && Math.abs(state.renderProgress - state.storyProgress) < .00002;
  }, { at, chapter });
}

async function waitForMode(page, mode) {
  await wait(page, mode => {
    const app = window.__dentalExperience, state = app.report();
    const teeth = [...app.arch.teeth.values()];
    return state.finalView === mode && state.crownMix === (mode === 'smile' ? 1 : 0)
      && teeth.filter(tooth => (mode === 'smile' ? tooth.crown : tooth.mesh)?.visible).length === 28
      && teeth.every(tooth => !(mode === 'smile' ? tooth.mesh : tooth.crown)?.visible);
  }, mode);
}

async function settleFocus(page, fdi) {
  try {
    await wait(page, fdi => {
      const state = window.__dentalExperience.report();
      return state.focusedTooth === fdi && !state.focusMoving && !state.focusReturning;
    }, fdi);
  } catch (cause) {
    const { focusedTooth, focusMoving, focusReturning, finalView, story, progress } = await read(page);
    throw new Error(`Expected focus ${fdi}, got ${JSON.stringify({
      focusedTooth, focusMoving, focusReturning, finalView, chapter: story.chapterId, progress,
    })}`, { cause });
  }
}

function assertRestored(rest, baseline) {
  assert.equal(rest.focusedTooth, null);
  assert.equal(rest.focusHasOrigin, false);
  assert.equal(rest.fullAnatomy.weight, 0);
  for (const tooth of rest.teeth) {
    const original = baseline.teeth.find(source => source.fdi === tooth.fdi);
    assert.ok(distance(original.worldMatrix, tooth.worldMatrix) < .002, `FDI ${tooth.fdi} returned to its seat`);
  }
}

async function toothPoint(page, fdi) {
  return page.evaluate(fdi => {
    const app = window.__dentalExperience, mesh = app.arch.teeth.get(fdi).mesh, camera = app.rig.camera;
    const canvas = document.querySelector('#journey-canvas'), rect = canvas.getBoundingClientRect();
    const box = mesh.geometry.boundingBox;
    const point = box.getCenter(camera.position.clone());
    // Aim through the broad crown of a central incisor, above its root neck.
    point.y = box.min.y + (box.max.y - box.min.y) * .75;
    point.applyMatrix4(mesh.matrixWorld).project(camera);
    const x = rect.left + (point.x + 1) * rect.width * .5;
    const y = rect.top + (1 - point.y) * rect.height * .5;
    return { x, y, canvasHit: document.elementFromPoint(x, y) === canvas };
  }, fdi);
}

async function recordMotion(page, fdi, action) {
  await page.evaluate(fdi => {
    const app = window.__dentalExperience, frames = [];
    const readFrame = now => {
      const state = app.report();
      const tooth = app.arch.teeth.get(fdi).mesh.matrixWorld.elements;
      frames.push({ t: now, moving: state.focusMoving, tooth: tooth.slice(12, 15), camera: state.camera });
    };
    readFrame(performance.now());
    let request;
    const tick = now => { readFrame(now); request = requestAnimationFrame(tick); };
    request = requestAnimationFrame(tick);
    window.__atlasMotion = () => { cancelAnimationFrame(request); delete window.__atlasMotion; return frames; };
  }, fdi);
  await action();
  const frames = await page.evaluate(() => window.__atlasMotion());
  const mid = frames.filter(frame => frame.moving);
  assert.ok(mid.length >= 4, 'The 3D extraction has intermediate rendered frames');
  const first = frames[0], last = frames.at(-1);
  assert.ok(last.t - mid[0].t >= 450, 'The transition does not rush through the extraction');
  for (const key of ['tooth', 'camera']) {
    const travel = distance(first[key], last[key]);
    assert.ok(travel > .1, `The ${key} moves during the extraction`);
    assert.ok(mid.some(frame => distance(first[key], frame[key]) > travel * .2 && distance(last[key], frame[key]) > travel * .2),
      `The ${key} visibly travels between its start and end positions`);
  }
}

async function checkToothLabel(page, fdi) {
  const title = await page.locator('.full-arch-focus-title').innerText();
  const location = await page.locator('.full-arch-focus-location').innerText();
  const type = await page.locator('.full-arch-focus-type').innerText();
  const functionText = await page.locator('.full-arch-focus-function').innerText();
  assert.match(title, new RegExp(`^${fdi}\\s*[—–-]\\s*`));
  assert.match(title, types[fdi % 10 - 1], `FDI ${fdi} has the correct tooth type`);
  assert.match(type, types[fdi % 10 - 1]);
  assert.match(location, locations[Math.floor(fdi / 10) - 1], `FDI ${fdi} uses the patient's side`);
  assert.ok(functionText.length > 15, `FDI ${fdi} describes its function`);
  return functionText;
}

async function showInterior(page, activate, fdi, family, roots) {
  await activate(toggle);
  await wait(page, () => window.__dentalExperience.report().fullAnatomy.weight > .98);
  assert.match(await page.locator('.full-arch-focus-caption').innerText(), /ilustračn|schematick/i);
  const interior = await page.evaluate(() => {
    const app = window.__dentalExperience, { fdi, family, roots } = app.report().fullAnatomy;
    const visible = [...app.arch.teeth].filter(([id, { mesh }]) =>
      mesh?.visible && mesh.getObjectByName(`Ilustračné vnútro FDI ${id}`)?.visible).map(([id]) => id);
    return { fdi, family, roots, visible };
  });
  assert.deepEqual(interior, { fdi, family, roots, visible: [fdi] });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const mobile of [false, true]) {
    const width = mobile ? 390 : 1440, height = mobile ? 844 : 900;
    const context = await browser.newContext({
      viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1,
    });
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const activate = css => mobile ? page.locator(css).tap() : page.locator(css).click();
      const choose = fdi => page.locator(selector).selectOption(String(fdi));
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      await wait(page, () => window.__dentalExperience?.report().assetsReady, null, 90000);
      await page.locator('#journey-startup').waitFor({ state: 'hidden' });
      await seek(page, 'dentition');
      await waitForMode(page, 'smile');
      assert.equal(await page.locator(selector).isVisible(), false);

      await activate('#journey-view-anatomy');
      await waitForMode(page, 'anatomy');
      await page.locator(selector).waitFor({ state: 'visible' });
      assert.deepEqual(await page.locator(`${selector} option`).evaluateAll(options =>
        options.filter(option => option.value).map(option => +option.value).sort((a, b) => a - b)), fdis);
      const baseline = await read(page);
      const point = await toothPoint(page, 11);
      assert.ok(point.canvasHit, 'The crown pick point is unobstructed by the atlas UI');
      await recordMotion(page, 11, async () => {
        if (mobile) await page.touchscreen.tap(point.x, point.y);
        else await page.mouse.click(point.x, point.y);
        await settleFocus(page, 11);
      });
      await checkToothLabel(page, 11);
      const focusedCamera = await cameraProbe(page);
      assert.ok(distance(focusedCamera.pos, focusedCamera.target) < distance(baseline.camera, baseline.target) * .75,
        'The camera moves to a materially closer view');

      if (mobile) await touchDrag(context, page, 84, 22);
      else await mouseDrag(page, 122, 36);
      const orbited = await cameraProbe(page);
      assert.ok(angular(focusedCamera.quat, orbited.quat) > .1, 'Dragging orbits the isolated tooth');
      assert.equal((await read(page)).focusedTooth, 11);
      if (mobile) await pinchOut(context, page);
      else await activate('#journey-zoom-in');
      await wait(page, threshold => {
        const state = window.__dentalExperience.report();
        return Math.hypot(...state.camera.map((value, index) => value - state.target[index])) < threshold;
      }, distance(orbited.pos, orbited.target) - .015);

      await activate('#journey-reset');
      await settleFocus(page, 11);
      await wait(page, () => !window.__dentalExperience.report().view?.returning);
      const reset = await cameraProbe(page);
      assert.ok(angular(focusedCamera.quat, reset.quat) < .035, 'Reset restores the selected tooth view');
      assert.ok(Math.abs(distance(focusedCamera.pos, focusedCamera.target) - distance(reset.pos, reset.target)) < .03,
        'Reset restores the selected zoom');
      await showInterior(page, activate, 11, 'incisor', 1);
      if (screenshotDir) await page.screenshot({ path: join(screenshotDir, `${width}-atlas-vnutro.png`), scale: 'css' });
      await activate(toggle);
      await wait(page, () => window.__dentalExperience.report().fullAnatomy.weight === 0);
      await activate(back);
      await settleFocus(page, null);
      assertRestored(await read(page), baseline);

      const functions = new Set();
      const choices = mobile ? [17, 21, 36, 44] : fdis;
      for (const fdi of choices) {
        await choose(fdi);
        await settleFocus(page, fdi);
        functions.add(await checkToothLabel(page, fdi));
        const tooth = (await read(page)).teeth.find(item => item.fdi === fdi);
        const original = baseline.teeth.find(item => item.fdi === fdi);
        assert.ok(distance(original.worldMatrix.slice(12, 15), tooth.worldMatrix.slice(12, 15)) > .1,
          `FDI ${fdi} moves out of the arch`);
      }
      assert.ok(functions.size >= 3, 'Tooth functions vary by category');

      await choose(16);
      await wait(page, () => window.__dentalExperience.report().focusMoving);
      await choose(33);
      await choose(36);
      await settleFocus(page, 36);
      await checkToothLabel(page, 36);
      await showInterior(page, activate, 36, 'molar', 2);
      await choose(24);
      await settleFocus(page, 24);
      await wait(page, () => window.__dentalExperience.report().fullAnatomy.weight === 0);
      await showInterior(page, activate, 24, 'premolar', 2);
      if (!mobile) {
        await choose(23);
        await settleFocus(page, 23);
        await showInterior(page, activate, 23, 'canine', 1);
        await choose(26);
        await settleFocus(page, 26);
        await showInterior(page, activate, 26, 'molar', 3);
      }
      await activate('#journey-view-smile');
      await waitForMode(page, 'smile');
      assert.equal(await page.locator(selector).isVisible(), false);

      await activate('#journey-view-anatomy');
      await waitForMode(page, 'anatomy');
      assertRestored(await read(page), baseline);
      await choose(37);
      await settleFocus(page, 37);
      await seek(page, 'assembly');
      assert.equal(await page.locator(selector).isVisible(), false);
      await seek(page, 'dentition');
      if ((await read(page)).finalView !== 'anatomy') await activate('#journey-view-anatomy');
      await waitForMode(page, 'anatomy');
      assertRestored(await read(page), baseline);
      if (!mobile) {
        const canvas = page.locator('#journey-canvas');
        await canvas.press('ArrowRight');
        await canvas.press('Equal');
        await wait(page, () => {
          const view = window.__dentalExperience.report().view;
          return Math.abs(view.yaw) > .03 && view.zoom < .98
            && Math.abs(view.desiredYaw - view.yaw) < .002 && Math.abs(view.desiredZoom - view.zoom) < .002;
        });
        const overview = await cameraProbe(page);
        await choose(42);
        await settleFocus(page, 42);
        await canvas.press('Escape');
        await settleFocus(page, null);
        const restored = await cameraProbe(page);
        assert.ok(distance(overview.pos, restored.pos) < .03 && angular(overview.quat, restored.quat) < .03,
          'Return restores the visitor’s previous orbit and zoom in the arch overview');
      }
      assert.equal((await read(page)).shaderErrors, 0);
      assert.deepEqual(errors, []);
      console.log(`${width}×${height} Chrome: ${choices.length} FDI choices, canvas picking, motion, orbit, zoom, interiors, mode switching and reversible scroll.`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
