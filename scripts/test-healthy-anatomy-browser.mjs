import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { angular, cameraProbe, mouseDrag, nativeJump, touchDrag } from './browser-camera-probes.mjs';
import { DENTAL_CHAPTERS, DENTAL_STORY } from '../src/experience/story-config.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a local Vite server');
url.searchParams.set('qa', '1');
const screenshotDir = process.env.DENTAL_STORY_REVIEW_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const chapter = id => DENTAL_CHAPTERS.find(c => c.id === id);
const anatomy = chapter('anatomy');
assert.equal(DENTAL_CHAPTERS[2].id, 'dentition', 'The atlas precedes the healthy anatomy chapter');
assert.equal(DENTAL_CHAPTERS[3], anatomy);
const layerSelector = '.healthy-anatomy-layer';
const cases = [
  { width: 390, height: 844, mobile: true, reduced: false },
  { width: 1440, height: 900, mobile: false, reduced: false },
  { width: 390, height: 844, mobile: true, reduced: true },
  { width: 320, height: 568, mobile: true, reduced: true, fitOnly: true },
  { width: 844, height: 390, mobile: true, reduced: true, fitOnly: true },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const { width, height, mobile, reduced, fitOnly } of cases) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile,
      deviceScaleFactor: mobile ? 2 : 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    try {
      const page = await context.newPage(), errors = [], cavityRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', request => {
        if (/\/story-assets\/caries-36\.json(?:\?|$)/.test(request.url())) cavityRequests.push(request.url());
      });
      const report = () => page.evaluate(() => window.__dentalExperience.report());
      const wait = (predicate, arg, timeout = 15000) => page.waitForFunction(predicate, arg, { timeout });
      const activate = button => mobile ? button.tap() : button.click();
      const at = (progress, id) => wait(({ progress, id }) => {
        const state = window.__dentalExperience.report();
        return Math.abs(state.progress - progress) < .003 && Math.abs(state.renderProgress - state.storyProgress) < .00002
          && state.story.chapterId === id;
      }, { progress, id });
      const seek = async (progress, id) => { await nativeJump(page, progress); await at(progress, id); };
      const ready = () => wait(() => window.__dentalExperience?.report().assetsReady, null, 90000);
      const expectLayer = (layer, manual) => wait(({ layer, manual }) => {
        const state = window.__dentalExperience.report().healthyAnatomy;
        return state.active && state.layer === layer && state.manual === manual && !state.moving;
      }, { layer, manual });
      const inspectTooth = () => page.evaluate(() => {
        const { arch } = window.__dentalExperience, tooth = arch.teeth.get(36).mesh;
        return { geometry: tooth.geometry.uuid, pose: tooth.matrixWorld.toArray(), visible: tooth.visible,
          lesion: tooth.geometry.hasAttribute('lesionRegion') || !!tooth.geometry.morphAttributes.position?.length };
      });

      const startup = page.locator('#journey-startup');
      let releaseHero;
      if (width === 390) {
        const gate = new Promise(resolve => { releaseHero = resolve; });
        await page.route('**/dentition-assets/hero-36*.glb*', async route => { await gate; await route.continue(); });
      }
      try {
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        if (releaseHero) {
          await startup.waitFor({ state: 'visible' });
          assert.equal(await page.locator('body[data-journey-loading]').count(), 1);
          for (const selector of ['#journey-title', '#journey-home', '#journey-mobile-next', '#journey-zoom-in', '#journey-status', '#journey-canvas']) {
            assert.equal(await page.locator(selector).isVisible(), false, selector + ' stays hidden during the startup');
          }
          const tooth = startup.locator('.startup-tooth');
          assert.equal(await tooth.isVisible(), true);
          const animations = await tooth.evaluate(element => element.getAnimations({ subtree: true }).length);
          assert.equal(animations > 0, !reduced, 'Only the normal-motion loader animates');
          if (!reduced) {
            const spin = await tooth.evaluate(element => {
              const style = getComputedStyle(element);
              return { frame: style.backgroundPositionX, turns: style.animationDuration.split(',').map(parseFloat) };
            });
            assert.ok(spin.turns.length > 1 && spin.turns.every((duration, index) => !index || duration > spin.turns[index - 1]),
              'Each startup revolution is slower than the previous one');
            await wait(frame => getComputedStyle(document.querySelector('.startup-tooth')).backgroundPositionX !== frame, spin.frame);
          }
          if (screenshotDir && !reduced) await page.screenshot({ path: join(screenshotDir, width + '-nacitavanie-zuba.png') });
        }
      } finally { releaseHero?.(); }
      await wait(() => window.__dentalExperience?.report().ready, null, 90000);
      await startup.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('body[data-journey-loading]').count(), 0);
      assert.equal(await page.locator('#journey-title').isVisible(), true);
      assert.equal(await page.locator('.journey-step').first().getAttribute('aria-current'), 'step');
      const initial = await inspectTooth();
      assert.ok(initial.visible && !initial.lesion, 'The opening uses the intact native FDI 36');

      await ready();
      await activate(page.locator('.journey-step').nth(DENTAL_CHAPTERS.indexOf(anatomy)));
      await at(anatomy.at, anatomy.id);
      await expectLayer('pulp', false);
      const plate = page.locator('#healthy-anatomy');
      await plate.waitFor({ state: 'visible' });
      assert.equal(await page.locator('.journey-step').nth(3).getAttribute('aria-current'), 'step');
      assert.equal(await page.getByRole('button', { name: /pozrieť sa na kaz/i }).count(), 0);
      assert.equal(await page.locator('canvas').count(), 1);
      const cut = await inspectTooth();
      assert.equal(cut.geometry, initial.geometry, 'All layers retain the exact healthy geometry from the opening');
      assert.ok(cut.visible && !cut.lesion);
      assert.ok((await report()).healthyAnatomy.cut > 0 && (await report()).drawCalls > 0);
      const labels = plate.locator(layerSelector);
      assert.equal(await labels.count(), 4);
      assert.match(await labels.nth(0).innerText(), /celý zub/i);
      assert.match(await labels.nth(1).innerText(), /sklovina/i);
      assert.match(await labels.nth(2).innerText(), /dentín/i);
      assert.match(await labels.nth(3).innerText(), /dreň/i);
      const options = ['whole', 'enamel', 'dentin', 'pulp'];
      const captions = new Set();
      for (const [i, layer] of options.entries()) {
        const button = plate.locator(layerSelector + '[data-layer="' + layer + '"]');
        if (i === 1 && !reduced) await page.evaluate(() => {
          const samples = [];
          let frame;
          const capture = () => {
            samples.push(window.__dentalExperience.report().healthyAnatomy.amount);
            frame = requestAnimationFrame(capture);
          };
          capture();
          window.__readLayers = () => { cancelAnimationFrame(frame); return samples; };
        });
        await activate(button);
        await expectLayer(layer, true);
        if (i === 1 && !reduced) {
          const samples = await page.evaluate(() => window.__readLayers());
          assert.ok(samples.some(value => value > .02 && value < .98), 'Manual layer selection visibly animates');
        }
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        captions.add(await plate.locator('.healthy-anatomy-description').innerText());
        assert.deepEqual(await inspectTooth(), cut, 'Changing material layers does not move or replace the host mesh');
        const bounds = await button.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1
          && bounds.y + bounds.height <= height + 1, 'Each layer control fits in the viewport');
        if (screenshotDir && !reduced && layer !== 'enamel') {
          await page.screenshot({ path: join(screenshotDir, width + '-anatomia-' + layer + '.png'), scale: 'css' });
        }
      }
      assert.equal(captions.size, 4, 'Each layer provides its own teaching caption');
      assert.equal((await report()).shaderErrors, 0);
      if (!fitOnly) {
        const beforeDrag = await cameraProbe(page);
        if (mobile) await touchDrag(context, page, 70, 0);
        else await mouseDrag(page, 70, 25);
        const afterDrag = await cameraProbe(page);
        assert.ok(angular(beforeDrag.quat, afterDrag.quat) > .05, 'The same cutaway remains freely rotatable');
        await expectLayer('pulp', true);
        await activate(plate.locator('.healthy-anatomy-follow'));
        await expectLayer('pulp', false);
        await activate(page.locator('#journey-reset'));
        await wait(() => !window.__dentalExperience.report().view.returning);
        if (!reduced) {
          const checkpoints = [[.461, 'whole'], [.497, 'enamel'], [.526, 'dentin'], [.555, 'pulp']];
          const states = new Map();
          for (const [position, layer] of checkpoints) {
            await seek(position, 'anatomy');
            await expectLayer(layer, false);
            const state = (await report()).healthyAnatomy;
            states.set(position, [state.layer, state.amount, state.cut]);
          }
          for (const [position, layer] of checkpoints.toReversed()) {
            await seek(position, 'anatomy');
            await expectLayer(layer, false);
            const state = (await report()).healthyAnatomy, original = states.get(position);
            assert.equal(state.layer, original[0]);
            assert.ok(Math.abs(state.amount - original[1]) < .015 && Math.abs(state.cut - original[2]) < .015,
              'Reverse scroll reconstructs the same section');
          }
          await seek(.555, 'anatomy');
          await expectLayer('pulp', false);
        }
        await activate(page.locator('#journey-mobile-next'));
        await at(chapter('space').at, 'space');
        const spaced = await report();
        assert.equal(spaced.healthyAnatomy.active, false);
        assert.equal(spaced.healthyAnatomy.cut, 0);
        assert.deepEqual(spaced.fullyVisibleTeeth, [35, 36, 37], 'Only the three teaching teeth remain after the anatomy closes');
        if (!reduced) {
          const [start, end] = DENTAL_STORY.neighbors;
          await seek(start + .16 * (end - start), 'space');
          const early = (await report()).teeth;
          const first = early.find(tooth => tooth.fdi === 35), second = early.find(tooth => tooth.fdi === 37);
          assert.ok(first.reveal > 0 && second.reveal === 0, 'Neighbors enter separately');
          const seated = spaced.teeth.find(tooth => tooth.fdi === 35).worldMatrix;
          assert.ok(Math.hypot(...first.worldMatrix.slice(12, 15).map((value, i) => value - seated[i + 12])) > .3,
            'The neighbor travels through 3D space instead of appearing at its seat');
        }
        await seek(chapter('brush').at, 'brush');
        await activate(page.locator('.manual-cleaning-start'));
        await wait(() => window.__dentalExperience.report().manualCleaning?.transition === 'active');
        await page.locator('.manual-cleaning-grip').press('End');
        await wait(() => window.__dentalExperience.report().manualCleaning?.position > .9);
        await activate(page.locator('.manual-cleaning-exit'));
        await wait(() => !window.__dentalExperience.report().manualCleaning);
        await seek(1, 'brush');
        const finish = await report();
        assert.equal(finish.story.brushStoryPhase, 'smile');
        assert.equal(finish.crownMix, 1);
        assert.equal(finish.healthyAnatomy.active, false);
        await seek(anatomy.at, anatomy.id);
        await expectLayer('pulp', false);
      }
      assert.deepEqual(cavityRequests, [], 'The old cavity asset is never requested');
      assert.deepEqual(errors, []);
      console.log('Healthy anatomy passed: ' + width + '×' + height + ', ' + (reduced ? 'reduced motion' : 'normal motion'));
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
