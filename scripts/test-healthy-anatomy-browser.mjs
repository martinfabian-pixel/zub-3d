import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { nativeJump } from './browser-camera-probes.mjs';
import { DENTAL_CHAPTERS } from '../src/experience/story-config.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a local Vite server');
url.searchParams.set('qa', '1');
const screenshotDir = process.env.DENTAL_STORY_REVIEW_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const anatomyChapter = DENTAL_CHAPTERS.find(chapter => chapter.id === 'anatomy');
assert.equal(DENTAL_CHAPTERS[1], anatomyChapter, 'Healthy anatomy follows the hero');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const scenarios = [
    { width: 390, height: 844, mobile: true, reduced: false },
    { width: 1440, height: 900, mobile: false, reduced: false },
    { width: 390, height: 844, mobile: true, reduced: true },
    { width: 320, height: 568, mobile: true, reduced: true, fitOnly: true },
    { width: 844, height: 390, mobile: true, reduced: true, fitOnly: true },
  ];
  for (const { width, height, mobile, reduced, fitOnly } of scenarios) {
    const context = await browser.newContext({
      viewport: { width, height }, isMobile: mobile, hasTouch: mobile,
      deviceScaleFactor: mobile ? 2 : 1, reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    try {
      const page = await context.newPage();
      const errors = [], cavityRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('request', request => {
        if (/\/story-assets\/caries-36\.json(?:\?|$)/.test(request.url())) cavityRequests.push(request.url());
      });
      const report = () => page.evaluate(() => window.__dentalExperience.report());
      const wait = (predicate, arg, timeout = 15000) => page.waitForFunction(predicate, arg, { timeout });
      const activate = button => mobile ? button.tap() : button.click();
      const at = (progress, chapter) => wait(({ progress, chapter }) => {
        const state = window.__dentalExperience.report();
        return Math.abs(state.progress - progress) < .003
          && Math.abs(state.renderProgress - state.storyProgress) < .00002
          && state.story.chapterId === chapter;
      }, { progress, chapter });
      const seek = async (progress, chapter) => {
        await nativeJump(page, progress);
        await at(progress, chapter);
      };
      const expectSpread = spread => wait(spread => {
        const state = window.__dentalExperience.report().healthyAnatomy;
        return state.active && state.spread === spread;
      }, spread);
      const partPositions = () => page.evaluate(() => {
        const { scene, rig } = window.__dentalExperience;
        return ['enamel', 'dentin', 'pulp', 'cementum', 'bone'].map(part => {
          const object = scene.getObjectByName(`exploded-${part}`);
          return object.getWorldPosition(rig.camera.position.clone()).toArray();
        });
      });
      const startTrace = () => page.evaluate(() => {
        const samples = [];
        const observe = () => {
          samples.push(window.__dentalExperience.report().healthyAnatomy.spread);
          frame = requestAnimationFrame(observe);
        };
        let frame = requestAnimationFrame(observe);
        window.__stopAnatomyTrace = () => {
          cancelAnimationFrame(frame);
          delete window.__stopAnatomyTrace;
          return samples;
        };
      });
      const traceAfter = async (button, destination) => {
        await startTrace();
        await activate(button);
        await expectSpread(destination);
        return page.evaluate(() => window.__stopAnatomyTrace());
      };

      const startup = page.locator('#journey-startup');
      let releaseHero;
      if (width === 390) {
        const gate = new Promise(resolve => { releaseHero = resolve; });
        await page.route('**/dentition-assets/hero-36*.glb*', async route => {
          await gate;
          await route.continue();
        });
      }
      try {
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        if (releaseHero) {
          await startup.waitFor({ state: 'visible' });
          assert.equal(await page.locator('body[data-journey-loading]').count(), 1);
          for (const selector of ['#journey-title', '#journey-home', '#journey-mobile-next', '#journey-zoom-in', '#journey-status', '#journey-canvas']) {
            assert.equal(await page.locator(selector).isVisible(), false, `${selector} stays hidden during the startup`);
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
          if (screenshotDir && !reduced) {
            await page.screenshot({ path: join(screenshotDir, `${width}-nacitavanie-zuba.png`) });
          }
        }
      } finally {
        releaseHero?.();
      }
      await wait(() => window.__dentalExperience?.report().ready, null, 90000);
      if (releaseHero && !reduced) {
        await wait(() => {
          const style = getComputedStyle(document.querySelector('#journey-canvas'));
          const scale = new DOMMatrixReadOnly(style.transform).a;
          return document.body.dataset.journeyHandoff === 'grow'
            && style.visibility === 'visible' && scale > .3 && scale < .95;
        }, null, 12000);
      }
      await startup.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('body[data-journey-loading]').count(), 0);
      assert.equal(await page.locator('#journey-title').isVisible(), true);
      assert.equal(await page.locator('.journey-step').first().getAttribute('aria-current'), 'step');
      if (!reduced) await page.evaluate(() => {
        const samples = [];
        const observe = () => {
          const { arch, renderer, report } = window.__dentalExperience;
          const model = arch.teeth.get(36).mesh;
          samples.push([report().story.sceneProgress, model.visible, getComputedStyle(renderer.domElement).opacity]);
          frame = requestAnimationFrame(observe);
        };
        let frame = requestAnimationFrame(observe);
        window.__stopChapterTrace = () => {
          cancelAnimationFrame(frame);
          delete window.__stopChapterTrace;
          return samples;
        };
      });
      await activate(page.locator('#journey-mobile-next'));
      await wait(() => window.__dentalExperience?.report().assetsReady, null, 90000);
      await at(anatomyChapter.at, anatomyChapter.id);
      if (!reduced) {
        const samples = await page.evaluate(() => window.__stopChapterTrace());
        assert.ok(samples.some(([p]) => p > .08 && p < .14), 'The anatomy entry uses intermediate camera frames');
        assert.ok(samples.every(([, visible, opacity]) => visible && +opacity > .98),
          'The hero tooth stays visible through chapter 01 to chapter 02');
      }
      const plate = page.locator('#healthy-anatomy');
      const toggle = plate.locator('.healthy-anatomy-toggle');
      const labels = plate.locator('.healthy-anatomy-layer');
      await plate.waitFor({ state: 'visible' });
      await expectSpread(0);
      assert.match(await plate.locator('.healthy-anatomy-eyebrow').innerText(), /^02\s*\/\s*07/);
      assert.equal(await page.locator('.journey-step').nth(1).getAttribute('aria-current'), 'step');
      assert.match(await toggle.innerText(), /Rozložiť zub/);
      assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
      assert.equal(await labels.first().isVisible(), false);
      assert.equal(await page.getByRole('button', { name: /pozrieť sa na kaz/i }).count(), 0);
      assert.equal(await page.evaluate(() => {
        const { geometry } = window.__dentalExperience.arch.teeth.get(36).mesh;
        return geometry.hasAttribute('lesionRegion') || !!geometry.morphAttributes.position?.length;
      }), false, 'The tooth uses the healthy native mesh');
      assert.equal(await page.evaluate(() => {
        const { scene, arch } = window.__dentalExperience;
        const intact = scene.getObjectByName('FDI 36 · intact hero');
        return intact?.visible && intact.geometry === arch.teeth.get(36).mesh.geometry;
      }), true, 'The intact model uses the exact geometry from the opening screen');
      assert.equal(await page.locator('canvas').count(), 1);
      assert.ok((await report()).drawCalls > 0, 'The assembled tooth draws on the shared canvas');
      const assembled = await partPositions();
      if (screenshotDir && !reduced) {
        await page.screenshot({ path: join(screenshotDir, `${width}-zlozeny-zub.png`) });
      }

      const forward = await traceAfter(toggle, 1);
      if (!reduced) assert.ok(forward.some(spread => spread > .02 && spread < .98), 'The layers animate into position');
      assert.match(await toggle.innerText(), /Zložiť zub/);
      assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
      await labels.first().waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() =>
        window.__dentalExperience.scene.getObjectByName('FDI 36 · intact hero').visible), false,
      'The intact model clears the separated anatomy');
      const exploded = await partPositions();
      assert.ok(exploded[0][1] - exploded.at(-1)[1] > assembled[0][1] - assembled.at(-1)[1] + 1,
        'The actual tooth meshes move apart vertically');
      assert.ok(exploded.slice(1).every((point, index) => point[1] < exploded[index][1]),
        'The five visible parts remain in anatomical order');

      assert.equal(await labels.count(), 5);
      const names = await labels.allTextContents();
      for (const name of [/Sklovina/i, /Dentín/i, /Dreň/i, /Cement/i, /Kosť/i]) {
        assert.ok(names.some(label => name.test(label)), `Missing anatomy label ${name}`);
      }
      const bounds = await labels.evaluateAll(buttons => buttons.map(button => {
        const { left, right, top, bottom, width, height } = button.getBoundingClientRect();
        return { left, right, top, bottom, width, height };
      }));
      for (const [index, box] of bounds.entries()) {
        assert.ok(box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0
          && box.right <= width + 1 && box.bottom <= height + 1, 'Each label fits inside the viewport');
        for (const other of bounds.slice(index + 1)) {
          assert.ok(box.right <= other.left || other.right <= box.left
            || box.bottom <= other.top || other.bottom <= box.top, 'Anatomy labels do not overlap');
        }
      }
      const leaders = await plate.locator('.healthy-anatomy-leaders line').evaluateAll(lines => lines.map(line => ({
        start: Number(line.getAttribute('x1')), end: Number(line.getAttribute('x2')),
        y: Number(line.getAttribute('y1')),
      })));
      assert.equal(leaders.length, 5);
      assert.ok(leaders.every(line => line.start > 0 && line.end > line.start
        && line.end < width && line.y > 0 && line.y < height), 'Each leader connects a part to its label');
      if (screenshotDir && !reduced) {
        await page.screenshot({ path: join(screenshotDir, `${width}-rozlozeny-zub.png`) });
      }
      const captions = new Set();
      for (const button of await labels.all()) {
        await activate(button);
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        captions.add(await plate.locator('.healthy-anatomy-description').innerText());
        const copy = await plate.locator('.healthy-anatomy-copy').boundingBox();
        assert.ok(copy && copy.x >= 0 && copy.y >= 0 && copy.x + copy.width <= width + 1
          && copy.y + copy.height <= height + 1, 'The selected caption fits inside the viewport');
        assert.ok(bounds.every(label => copy.x + copy.width <= label.left || label.right <= copy.x
          || copy.y + copy.height <= label.top || label.bottom <= copy.y), 'The caption stays clear of the labels');
      }
      assert.equal(captions.size, 5);
      assert.equal((await report()).shaderErrors, 0);
      assert.ok((await report()).drawCalls >= 5, 'The WebGL renderer draws the exploded parts');
      const reverse = await traceAfter(toggle, 0);
      if (!reduced) assert.ok(reverse.some(spread => spread > .02 && spread < .98), 'Reassembly is animated');
      assert.deepEqual(await partPositions(), assembled, 'Reassembly returns to the original geometry positions');
      assert.equal(await labels.first().isVisible(), false);

      if (!fitOnly) {
        await activate(toggle);
        await expectSpread(1);
        await activate(page.locator('#journey-mobile-next'));
        const spaceChapter = DENTAL_CHAPTERS.find(chapter => chapter.id === 'space');
        await at(spaceChapter.at, spaceChapter.id);
        assert.equal((await report()).healthyAnatomy.active, false);
        if (!reduced) {
          const seated = (await report()).teeth;
          await seek(.228, 'space');
          const firstArrival = (await report()).teeth;
          const first = firstArrival.find(tooth => tooth.fdi === 35);
          const second = firstArrival.find(tooth => tooth.fdi === 37);
          assert.ok(first.reveal > 0 && second.reveal === 0, 'The first neighbor arrives before the second');
          const final = seated.find(tooth => tooth.fdi === 35).worldMatrix;
          assert.ok(Math.hypot(...first.worldMatrix.slice(12, 15).map((v, i) => v - final[i + 12])) > .3,
            'The first neighbor travels in 3D instead of appearing at its seat');
          await seek(.255, 'space');
          assert.ok((await report()).teeth.filter(tooth => [35, 37].includes(tooth.fdi)).every(tooth => tooth.reveal > 0));
        }
        await seek(.62, 'brush');
        await activate(page.locator('.manual-cleaning-start'));
        await wait(() => window.__dentalExperience.report().manualCleaning?.transition === 'active');
        await page.locator('.manual-cleaning-grip').press('End');
        await wait(() => window.__dentalExperience.report().manualCleaning?.position > .9);
        await activate(page.locator('.manual-cleaning-exit'));
        await wait(() => !window.__dentalExperience.report().manualCleaning);
        await seek(.995, 'dentition');
        const finale = await page.evaluate(() => {
          const { arch, report } = window.__dentalExperience;
          const state = report();
          return {
            view: state.finalView, crowns: [...arch.teeth.values()].filter(item => item.crown?.visible).length,
            anatomy: state.healthyAnatomy.active, manualCleaning: state.manualCleaning,
          };
        });
        assert.deepEqual(finale, { view: 'smile', crowns: 28, anatomy: false, manualCleaning: null });
        await seek(anatomyChapter.at, anatomyChapter.id);
        await expectSpread(0);
        assert.match(await toggle.innerText(), /Rozložiť zub/);
      }
      assert.deepEqual(cavityRequests, [], 'The old cavity asset is never requested');
      assert.deepEqual(errors, []);
      console.log(`Healthy anatomy passed: ${width}×${height}, ${reduced ? 'reduced motion' : 'normal motion'}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
