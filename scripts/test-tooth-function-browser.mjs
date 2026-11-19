import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { angular, cameraProbe, distance, mouseDrag, nativeJump, pinchOut, restingRaster, touchDrag, wheelOnCanvas } from './browser-camera-probes.mjs';
import { recordBrowserInteraction } from './record-molar-transition.mjs';
import { DENTAL_CHAPTERS } from '../src/experience/story-config.js';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:5173/');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Use a local Vite server.');
base.searchParams.set('qa', '1');
const output = process.env.DENTAL_STORY_REVIEW_DIR;
if (output) await mkdir(output, { recursive: true });
const record = process.argv.includes('--record');
const recordOnly = process.argv.includes('--record-only');
const stillsOnly = process.argv.includes('--stills-only');
const edgeOnly = process.argv.includes('--edge-only');
if (record || recordOnly) assert.ok(output && process.env.FFMPEG_PATH, 'Recordings need DENTAL_STORY_REVIEW_DIR and FFMPEG_PATH.');
const results = { scope: 'Local Chrome WebGL. Mobile dimensions and touch are emulated, not a physical phone or Safari.', scenarios: [] };
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
const read = page => page.evaluate(() => window.__dentalExperience.report());
const wait = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout });
const range = '#tooth-function-progress';
const activate = (page, selector, mobile) => mobile ? page.locator(selector).tap() : page.locator(selector).click();

async function openAtlas(page, mobile) {
  await page.goto(base.href, { waitUntil: 'domcontentloaded' });
  await wait(page, () => window.__dentalExperience?.report().assetsReady, null, 90000);
  await page.locator('#journey-startup').waitFor({ state: 'hidden', timeout: 60000 });
  const at = DENTAL_CHAPTERS.find(chapter => chapter.id === 'dentition').at;
  await nativeJump(page, at);
  await wait(page, () => {
    const state = window.__dentalExperience.report();
    return state.story.chapterId === 'dentition' && !state.opening;
  });
  await activate(page, '#journey-view-anatomy', mobile);
  await wait(page, () => {
    const state = window.__dentalExperience.report();
    return state.finalView === 'anatomy' && state.crownMix === 0;
  });
}

async function chooseTooth(page, fdi) {
  await page.locator('.full-arch-focus-select').selectOption(String(fdi));
  await wait(page, fdi => {
    const state = window.__dentalExperience.report();
    return state.focusedTooth === fdi && !state.focusMoving && !state.focusReturning;
  }, fdi);
  await restingRaster(page);
}

async function start(page, fdi, mobile) {
  assert.equal(await page.locator('.full-arch-focus-motion').innerText(), fdi === 21 ? 'Ukázať odhryznutie' : 'Ukázať žuvanie');
  await activate(page, '.full-arch-focus-motion', mobile);
  await wait(page, fdi => {
    const state = window.__dentalExperience.report().toothMotion;
    return state?.fdi === fdi && !state.entering;
  }, fdi);
}

async function seekExact(page, value) {
  // Native range keyboard actions, not a synthetic input event or scene write.
  await page.locator(range).press('Home');
  for (let i = 0; i < Math.floor(value * 10); i++) await page.locator(range).press('PageUp');
  await wait(page, value => {
    const motion = window.__dentalExperience.report().toothMotion;
    return !motion.playing && Math.abs(motion.progress - value) < 1e-7;
  }, value);
  await restingRaster(page);
}

async function dragSlider(context, page, to) {
  const slider = page.locator(range), box = await slider.boundingBox();
  assert.ok(box);
  const from = Number(await slider.inputValue()) / 1000;
  const thumbRadius = 13, x = p => box.x + thumbRadius + (box.width - 2 * thumbRadius) * p;
  const y = box.y + box.height / 2, input = await context.newCDPSession(page);
  try {
    await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x(from), y, id: 0 }] });
    for (let i = 1; i <= 20; i++) {
      await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x(from + (to - from) * i / 20), y, id: 0 }] });
      await page.waitForTimeout(25);
    }
    await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await input.detach(); }
  await restingRaster(page);
}

async function geometrySnapshot(page) {
  return page.evaluate(() => {
    const app = window.__dentalExperience;
    app.scene.updateMatrixWorld(true);
    const visible = object => { for (let n = object; n; n = n.parent) if (!n.visible) return false; return true; };
    const meshes = [];
    const demo = app.scene.getObjectByName('Tooth function in motion');
    if (!demo) throw new Error('Motion scene is missing.');
    demo.traverse(object => {
      if (!object.isMesh || !visible(object)) return;
      // Fingerprint actual render geometry, including the deformed apple.
      const attribute = object.geometry.attributes.position;
      const bytes = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
      let hash = 2166136261;
      for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
      meshes.push({ name: object.name, matrix: object.matrixWorld.toArray(), vertices: attribute.count, positionHash: hash });
    });
    return meshes;
  });
}

async function checkClearStage(page, mobile, fdi, reducedMotion = false) {
  const layout = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    const canvas = document.querySelector('#journey-canvas');
    const app = window.__dentalExperience, contact = app.rig.camera.position.clone().fromArray(app.report().toothMotion.contact).project(app.rig.camera);
    const contactX = (contact.x + 1) * innerWidth / 2, contactY = (1 - contact.y) * innerHeight / 2;
    return { panel: box('.tooth-function-panel'), heading: box('.tooth-function-heading'), slider: box('#tooth-function-progress'),
      viewport: { width: innerWidth, height: innerHeight }, centerHit: document.elementFromPoint(innerWidth * .5, innerHeight * .52) === canvas,
      contact: { x: contactX, y: contactY, canvasHit: document.elementFromPoint(contactX, contactY) === canvas },
      label: document.querySelector('#tooth-function-progress').getAttribute('aria-valuetext'),
      sceneTouchAction: getComputedStyle(canvas).touchAction,
      visibleSliders: [...document.querySelectorAll('input[type="range"]')].filter(el => el.getClientRects().length).length };
  });
  assert.equal(layout.visibleSliders, 1, 'The demonstration exposes one timeline slider.');
  assert.equal(layout.sceneTouchAction, 'none', 'Free rotation and pinch apply before a touch starts.');
  assert.match(layout.label, /50 percent/);
  assert.ok(layout.centerHit, 'The scene centre remains directly touchable.');
  assert.ok(layout.contact.canvasHit, 'The projected bite location is inside the exposed canvas.');
  assert.ok(layout.contact.y < layout.slider.y - 100, 'A thumb on the slider stays well below the bite location.');
  assert.ok(layout.slider.height >= 44, 'The slider has a 44 px touch target.');
  assert.ok(layout.panel.x >= 0 && layout.panel.right <= layout.viewport.width, 'Controls fit the viewport.');
  if (mobile) {
    assert.ok(layout.panel.top > layout.viewport.height * .65, 'The control panel stays below the contact viewing area.');
    assert.ok(layout.heading.bottom < layout.viewport.height * .35, 'The heading leaves space above the contact.');
  }
  if (output) await page.screenshot({ path: join(output, `${mobile ? 'mobile' : 'desktop'}-${fdi}-${reducedMotion ? 'reduced-' : ''}contact.png`), scale: 'css' });
  return layout;
}

async function verifyEarlyPauseAndResize(context, page) {
  await chooseTooth(page, 21);
  await page.locator('.full-arch-focus-motion').tap();
  await wait(page, () => window.__dentalExperience.report().toothMotion?.entering);
  await touchDrag(context, page, 35, 8);
  await restingRaster(page);
  const paused = (await read(page)).toothMotion;
  assert.equal(paused.entering, false, 'A touch interrupts the camera entry immediately.');
  assert.equal(paused.playing, false, 'Early scene interaction pauses playback.');
  assert.equal(paused.cameraHeld, true);
  const held = await cameraProbe(page);
  await page.waitForTimeout(450);
  const later = await cameraProbe(page);
  assert.ok(distance(held.pos, later.pos) < 1e-6 && angular(held.quat, later.quat) < 1e-6,
    'The interrupted entry camera stays at the visitor angle.');
  await page.setViewportSize({ width: 844, height: 390 });
  await wait(page, () => document.querySelector('#journey-canvas').clientWidth === 844);
  await page.locator('.tooth-function-return').tap();
  await wait(page, () => {
    const state = window.__dentalExperience.report();
    return !state.toothMotion && state.focusedTooth === 21 && !state.focusMoving;
  });
  await restingRaster(page);
  const fitting = await page.evaluate(() => {
    const app = window.__dentalExperience, mesh = app.arch.teeth.get(21).mesh, camera = app.rig.camera;
    const point = camera.position.clone(), positions = mesh.geometry.attributes.position;
    const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    mesh.updateMatrixWorld(true);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera);
      const x = (point.x + 1) * innerWidth / 2, y = (1 - point.y) * innerHeight / 2;
      bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
      bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
    }
    return { ...bounds, width: innerWidth, height: innerHeight, sensor: [camera.view.fullWidth, camera.view.fullHeight] };
  });
  assert.deepEqual(fitting.sensor, [844, 390], 'The returned atlas uses the landscape camera sensor.');
  assert.ok(fitting.left >= 0 && fitting.right <= fitting.width && fitting.top >= 0 && fitting.bottom <= fitting.height,
    `The selected tooth refits entirely after changing orientation: ${JSON.stringify(fitting)}`);
  assert.ok(fitting.left > fitting.width * .4, 'Landscape selected-tooth framing leaves the copy column clear.');
  const layout = await page.evaluate(() => {
    const controls = ['.full-arch-focus-return', '.full-arch-focus-previous', '.full-arch-focus-next', '.full-arch-focus-continue'];
    const blockers = ['.journey-dock', '#journey-mobile-previous', '#journey-mobile-next', '.journey-steps'];
    const readBox = selector => {
      const node = document.querySelector(selector), box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { selector, box: box.toJSON(), centreHit: node.contains(hit) || node === hit };
    };
    return { controls: controls.map(readBox), blockers: blockers.map(readBox) };
  });
  if (output) {
    await page.screenshot({ path: join(output, 'mobile-landscape-return-to-21.png'), scale: 'css' });
    await writeFile(join(output, 'mobile-landscape-layout.json'), JSON.stringify(layout, null, 2) + '\n');
  }
  for (const control of layout.controls) {
    assert.ok(control.centreHit, `The landscape ${control.selector} centre remains directly clickable.`);
    for (const blocker of layout.blockers) {
      const a = control.box, b = blocker.box;
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      assert.ok(overlapX <= 1.5 || overlapY <= 1.5,
        `Landscape ${control.selector} overlaps ${blocker.selector}: ${JSON.stringify({ overlapX, overlapY })}`);
    }
  }
  results.scenarios.push({ mobile: true, earlyEntryInterruption: true, orientationReturn: fitting, controls: layout });
  console.log('Passed early camera interruption and portrait→landscape return to selected tooth.');
}

async function verifyScenario(mobile, reducedMotion = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await openAtlas(page, mobile);
    await chooseTooth(page, 22);
    assert.equal(await page.locator('.full-arch-focus-motion').isVisible(), false, 'Other teeth do not advertise an unavailable demo.');
    for (const fdi of [21, 36]) {
      await chooseTooth(page, fdi);
      const original = await cameraProbe(page), scrollPosition = await page.evaluate(() => scrollY);
      const began = Date.now();
      await start(page, fdi, mobile);
      if (reducedMotion) {
        const motion = (await read(page)).toothMotion;
        assert.equal(motion.playing, false, 'Reduced motion does not autoplay.');
        assert.equal(motion.progress, 0);
      } else {
        assert.equal((await read(page)).toothMotion.playing, true, 'The first launch plays automatically.');
        await wait(page, () => {
          const motion = window.__dentalExperience.report().toothMotion;
          return motion?.progress === 1 && !motion.playing;
        }, null, 35000);
        assert.ok(Date.now() - began >= 9000, 'The first playback is deliberately slow.');
        await page.waitForTimeout(350);
        assert.equal((await read(page)).toothMotion.progress, 1, 'Playback finishes once without looping.');
      }
      await seekExact(page, .5);
      const first = await geometrySnapshot(page), before = await read(page);
      assert.ok(first.length >= 4, 'The scene contains opposing teeth and the food.');
      const layout = await checkClearStage(page, mobile, fdi, reducedMotion);
      await seekExact(page, .8);
      const advanced = await geometrySnapshot(page);
      assert.notDeepEqual(advanced, first, 'Jaw or food geometry changes as the slider advances.');
      for (const tooth of first.filter(mesh => /^Motion FDI [12]\d$/.test(mesh.name))) {
        assert.deepEqual(advanced.find(mesh => mesh.name === tooth.name)?.matrix, tooth.matrix, 'The upper arch stays fixed.');
      }
      assert.ok(before.toothMotion.minHardSurfaceGap >= 0, 'The contact sample preserves hard-surface clearance.');
      await seekExact(page, .3);
      await seekExact(page, .5);
      assert.deepEqual(await geometrySnapshot(page), first, 'Backward then forward scrubbing exactly restores jaw and food vertices/matrices.');

      const contactCamera = await cameraProbe(page);
      if (mobile) await touchDrag(context, page, 55, 17);
      else await mouseDrag(page, 80, 24);
      const turned = await cameraProbe(page);
      assert.ok(angular(contactCamera.quat, turned.quat) > .06, 'Direct dragging rotates the paused scene.');
      if (mobile) await pinchOut(context, page);
      else await wheelOnCanvas(page, -100);
      await restingRaster(page);
      const zoomed = await cameraProbe(page);
      assert.ok(distance(zoomed.pos, zoomed.target) < distance(turned.pos, turned.target) - .01, 'Pinch/wheel zoom changes the paused view.');
      const keepCamera = await cameraProbe(page);
      await seekExact(page, .3);
      await seekExact(page, .5);
      const preserved = await cameraProbe(page);
      assert.ok(distance(keepCamera.pos, preserved.pos) < 1e-6 && angular(keepCamera.quat, preserved.quat) < 1e-6,
        'Slider movement preserves the visitor camera angle and zoom.');
      assert.deepEqual(await geometrySnapshot(page), first, 'Orbit and rewind do not alter the mechanical sample.');
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollPosition) < 1, 'Touch and range input leave the story scroll position unchanged.');
      if (output) await page.screenshot({ path: join(output, `${mobile ? 'mobile' : 'desktop'}-${fdi}-${reducedMotion ? 'reduced-' : ''}turned-rewound.png`), scale: 'css' });
      await activate(page, '.tooth-function-return', mobile);
      await wait(page, fdi => {
        const state = window.__dentalExperience.report();
        return !state.toothMotion && state.focusedTooth === fdi && !state.focusMoving;
      }, fdi);
      await restingRaster(page);
      const restored = await cameraProbe(page);
      assert.ok(distance(original.pos, restored.pos) < .002 && angular(original.quat, restored.quat) < .002,
        'Back returns to the selected tooth with its original camera.');
      assert.ok(await page.locator('.full-arch-focus-motion').isVisible());
      assert.equal((await read(page)).shaderErrors, 0);
      results.scenarios.push({ mobile, reducedMotion, fdi, elapsedMs: Date.now() - began, contact: before.toothMotion, layout });
      console.log(`Passed ${mobile ? '390×844 touch' : '1440×900 desktop'}${reducedMotion ? ' reduced-motion' : ''}: FDI ${fdi}, reversible geometry and preserved camera.`);
    }
    if (mobile && !reducedMotion) await verifyEarlyPauseAndResize(context, page);
    assert.deepEqual(errors, [], 'No browser page errors.');
  } catch (error) {
    if (output) await page.screenshot({ path: join(output, `failure-${mobile ? 'mobile' : 'desktop'}${reducedMotion ? '-reduced' : ''}.png`), scale: 'css' });
    console.error('Browser failure state:', JSON.stringify({ errors, state: await read(page) }));
    throw error;
  } finally { await context.close(); }
}

async function recordScenario(fdi) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await openAtlas(page, true);
    await chooseTooth(page, fdi);
    await recordBrowserInteraction(page, join(output, `mobil-${fdi}-${fdi === 21 ? 'odhryznutie' : 'zuvanie'}.mp4`), process.env.FFMPEG_PATH, async () => {
      await page.waitForTimeout(450);
      await start(page, fdi, true);
      await wait(page, () => window.__dentalExperience.report().toothMotion.progress >= .5);
      await page.locator('.tooth-function-play').tap();
      await dragSlider(context, page, .5);
      await page.waitForTimeout(800);
      await touchDrag(context, page, 47, 10);
      await restingRaster(page);
      await page.waitForTimeout(850);
      await dragSlider(context, page, .29);
      await page.waitForTimeout(700);
      await dragSlider(context, page, .5);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: join(output, `mobil-${fdi}-zastavenie-po-navrate.png`), scale: 'css' });
      await page.locator('.tooth-function-play').tap();
      await wait(page, () => {
        const motion = window.__dentalExperience.report().toothMotion;
        return motion.progress === 1 && !motion.playing;
      }, null, 20000);
      await page.waitForTimeout(650);
      await page.locator('.tooth-function-return').tap();
      await page.waitForTimeout(750);
    });
  } finally { await context.close(); }
}

async function captureStills() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await openAtlas(page, true);
    for (const fdi of [21, 36]) {
      await chooseTooth(page, fdi);
      await start(page, fdi, true);
      await wait(page, () => window.__dentalExperience.report().toothMotion?.progress >= .5);
      await page.locator('.tooth-function-play').tap();
      await seekExact(page, .5);
      await checkClearStage(page, true, fdi);
      await seekExact(page, fdi === 21 ? .9 : .7);
      if (output) await page.screenshot({ path: join(output, `mobile-${fdi}-${fdi === 21 ? 'detached' : 'lateral'}.png`), scale: 'css' });
      await seekExact(page, .5);
      await touchDrag(context, page, 47, 10);
      await seekExact(page, .3);
      await seekExact(page, .5);
      if (output) await page.screenshot({ path: join(output, `mobile-${fdi}-turned-rewound.png`), scale: 'css' });
      await page.locator('.tooth-function-return').tap();
      await wait(page, () => !window.__dentalExperience.report().toothMotion);
      console.log(`Captured mobile contact, rotation and rewind: FDI ${fdi}.`);
    }
  } finally { await context.close(); }
}

try {
  if (edgeOnly) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    try {
      const page = await context.newPage();
      await openAtlas(page, true);
      await verifyEarlyPauseAndResize(context, page);
    } finally { await context.close(); }
  } else if (stillsOnly) await captureStills();
  else if (!recordOnly) {
    await verifyScenario(true);
    await verifyScenario(false);
    await verifyScenario(true, true);
  }
  if (record || recordOnly) for (const fdi of [21, 36]) await recordScenario(fdi);
  if (output && !recordOnly && !stillsOnly) await writeFile(join(output, edgeOnly ? 'tooth-function-edge-results.json' : 'tooth-function-browser-results.json'), JSON.stringify(results, null, 2) + '\n');
} finally { await browser.close(); }
