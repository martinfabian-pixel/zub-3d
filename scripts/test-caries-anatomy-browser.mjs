import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  angular, cameraProbe, distance, mouseDrag, nativeJump, pinchOut, touchDrag, wheelOnCanvas,
} from './browser-camera-probes.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a local Vite server');
url.searchParams.set('qa', '1');
const screenshotDir = process.env.DENTAL_STORY_REVIEW_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const scenarios = [
    { width: 390, height: 844, mobile: true, reduced: false },
    { width: 1440, height: 900, mobile: false, reduced: false },
    { width: 390, height: 844, mobile: true, reduced: true },
  ];
  for (const { width, height, mobile, reduced } of scenarios) {
    const context = await browser.newContext({
      viewport: { width, height }, isMobile: mobile, hasTouch: mobile,
      deviceScaleFactor: mobile ? 2 : 1, reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      const report = () => page.evaluate(() => window.__dentalExperience.report());
      const wait = (predicate, arg, timeout = 12000) => page.waitForFunction(predicate, arg, { timeout });
      const waitForCamera = () => wait(() => {
        const view = window.__dentalExperience.report().view;
        return !view.returning && Math.abs(view.yaw - view.desiredYaw) < 1e-4
          && Math.abs(view.pitch - view.desiredPitch) < 1e-4 && Math.abs(view.zoom - view.desiredZoom) < 1e-4;
      });
      const startExchangeProbe = () => !reduced && page.evaluate(() => {
        const { arch, renderer } = window.__dentalExperience;
        const tooth = arch.teeth.get(36).mesh;
        const frames = [];
        const readFrame = () => frames.push({
          opacity: Number(getComputedStyle(renderer.domElement).opacity),
          morph: tooth.morphTargetInfluences[0],
        });
        let frame;
        const record = () => {
          readFrame();
          frame = requestAnimationFrame(record);
        };
        record();
        window.__stopCavityExchangeProbe = () => {
          cancelAnimationFrame(frame);
          readFrame();
          delete window.__stopCavityExchangeProbe;
          return frames;
        };
      });
      const checkExchange = async (from, to) => {
        if (reduced) return;
        const frames = await page.evaluate(() => window.__stopCavityExchangeProbe());
        const transitions = frames.slice(1).flatMap((frame, i) =>
          frame.morph !== frames[i].morph ? [[frames[i], frame]] : []);
        assert.equal(frames[0].morph, from);
        assert.equal(frames.at(-1).morph, to);
        assert.deepEqual(transitions, [[{ opacity: 0, morph: from }, { opacity: 0, morph: to }]],
          'The examples exchange only while the canvas is fully transparent');
      };
      const activate = button => mobile ? button.tap() : button.click();
      const capture = async name => {
        if (screenshotDir && mobile && !reduced) {
          await page.screenshot({ path: join(screenshotDir, name) });
        }
      };
      const seek = async (progress, chapter) => {
        await nativeJump(page, progress);
        await wait(({ progress, chapter }) => {
          const state = window.__dentalExperience.report();
          return Math.abs(state.progress - progress) < .003
            && Math.abs(state.renderProgress - state.storyProgress) < .00002
            && state.story.chapterId === chapter;
        }, { progress, chapter });
      };
      await wait(() => window.__dentalExperience?.report().ready, null, 90000);
      await nativeJump(page, .475);
      await wait(() => window.__dentalExperience?.report().assetsReady, null, 90000);
      await seek(.475, 'caries');
      const original = await cameraProbe(page);
      assert.equal(original.story.influence, 1);
      await activate(page.getByRole('button', { name: /Pozrieť sa na kaz bližšie/ }));
      await wait(() => window.__dentalExperience.report().detailOpen);
      await wait(() => window.__dentalExperience.report().microbes?.reveal > .95);
      await wait(originalRadius => {
        const { camera, target } = window.__dentalExperience.report();
        return Math.hypot(...camera.map((value, i) => value - target[i])) < .8 * originalRadius;
      }, distance(original.pos, original.target));
      await startExchangeProbe();
      await activate(page.getByRole('button', { name: 'Pozrieť pod povrch' }));
      const pulpName = 'Healthy FDI 36 · schematic pulp and root canals';
      await wait(name => window.__dentalExperience.arch.teeth.get(36)?.mesh.getObjectByName(name), pulpName);
      const explanations = [
        ['Sklovina', 'enamel', 'Ochranná vonkajšia vrstva korunky.', '01-sklovina.png'],
        ['Dentín', 'dentin', 'Tkanivo pod sklovinou, ktoré obklopuje dreň.', '02-dentin.png'],
        ['Dreň', 'pulp', 'Mäkké tkanivo s cievami a nervami.', '03-dren-a-kanaliky.png'],
      ];
      async function selectLayer(depth) {
        const [layer, id, explanation] = explanations[depth];
        const button = page.getByRole('button', { name: layer, exact: true });
        await activate(button);
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        await page.getByText(explanation, { exact: true }).waitFor({ state: 'visible' });
        await wait(({ id, depth }) => {
          const section = window.__dentalExperience.report().cavityAnatomy;
          return section.active && section.healthy
            && section.layer === id && section.weight === 1 && section.depth === depth;
        }, { id, depth });
        const rendered = await page.evaluate(name => {
          const { arch, renderer, report } = window.__dentalExperience;
          const state = report();
          const tooth = arch.teeth.get(36).mesh;
          const uniforms = renderer.properties.get(tooth.material).uniforms;
          const cap = tooth.getObjectByName('Kontúra pozdĺžneho rezu FDI 36');
          const pulp = tooth.getObjectByName(name)?.getObjectByName('Pulp tissue · continuous chamber and canals');
          let pulpVisible = Boolean(pulp && pulp.material.opacity > 1e-4);
          for (let object = pulp; object; object = object.parent) pulpVisible &&= object.visible;
          return {
            toothVisible: tooth.visible, lesionMorph: tooth.morphTargetInfluences[0],
            lesionTint: uniforms?.lesionProgress?.value, pulpVisible,
            capVisible: cap?.parent === tooth && cap.visible,
            progressionTint: (uniforms?.sectionIllustration?.value?.x ?? -1) >= 0,
            microbesVisible: state.microbes.visible, plaqueVisible: state.story.plaque.visible,
            storyLesion: state.story.lesionDisplay, storyChapter: state.story.chapterId,
            shaderErrors: state.shaderErrors,
          };
        }, pulpName);
        assert.deepEqual(rendered, {
          toothVisible: true, lesionMorph: 0, lesionTint: 0, pulpVisible: depth === 2, progressionTint: false,
          capVisible: depth > 0,
          microbesVisible: false, plaqueVisible: false, storyLesion: 1, storyChapter: 'caries', shaderErrors: 0,
        }, `The visible FDI 36 is healthy in the ${layer} layer while preserving the story lesion`);
        assert.equal(await page.locator('.cavity-progression, .cavity-progression-toggle').count(), 0);
      }
      const expectSameView = (before, after) => {
        assert.ok(angular(before.quat, after.quat) < .015, 'Layer switches preserve the camera angle');
        assert.ok(distance(before.pos, after.pos) < .03, 'Layer switches preserve the camera distance');
      };
      let initialLayerView;
      for (const [depth, [, , , screenshot]] of explanations.entries()) {
        await selectLayer(depth);
        await waitForCamera();
        if (depth === 0) await checkExchange(1, 0);
        const layerView = await cameraProbe(page);
        if (initialLayerView) expectSameView(initialLayerView, layerView);
        initialLayerView ??= layerView;
        await capture(screenshot);
      }
      assert.equal(await page.locator('canvas').count(), 1);
      const interior = await cameraProbe(page);
      if (mobile) await touchDrag(context, page, 52, 3);
      else await mouseDrag(page, 64, 12);
      const orbited = await cameraProbe(page);
      assert.ok(angular(interior.quat, orbited.quat) > .04, 'Dragging changes the interior camera');
      assert.deepEqual(interior.story.pose36, orbited.story.pose36, 'The original tooth and its anatomy stay together while orbiting');
      if (mobile) await pinchOut(context, page);
      else await wheelOnCanvas(page, -130);
      const zoomed = await cameraProbe(page);
      assert.ok(distance(orbited.pos, zoomed.pos) > .03, 'Zoom still controls the interior camera');
      assert.equal((await report()).detailOpen, true);
      await waitForCamera();
      const userView = await cameraProbe(page);
      await selectLayer(0);
      expectSameView(userView, await cameraProbe(page));
      await selectLayer(2);
      expectSameView(userView, await cameraProbe(page));
      await startExchangeProbe();
      await activate(page.getByRole('button', { name: /Späť k zubu/ }));
      await wait(() => !window.__dentalExperience.report().detailOpen);
      await wait(originalCamera => {
        const state = window.__dentalExperience.report();
        return !state.exploring && !state.cavityAnatomy.returning
          && Math.hypot(...state.camera.map((value, i) => value - originalCamera[i])) < .04;
      }, original.pos);
      await checkExchange(0, 1);
      const restored = await cameraProbe(page);
      assert.ok(angular(original.quat, restored.quat) < .04, 'Returning restores the original angle');
      assert.equal(restored.story.influence, 1);
      const restoredTint = await page.evaluate(() => {
        const { arch, renderer } = window.__dentalExperience;
        return renderer.properties.get(arch.teeth.get(36).mesh.material).uniforms.lesionProgress.value;
      });
      assert.equal(restoredTint, 1, 'Returning restores the original cavity material');
      await wait(name => !window.__dentalExperience.arch.teeth.get(36)?.mesh.getObjectByName(name)?.visible, pulpName);

      await seek(.62, 'brush');
      assert.equal((await report()).story.caries.morphInfluence, 0);
      await activate(page.locator('.manual-cleaning-start'));
      await wait(() => window.__dentalExperience.report().manualCleaning?.transition === 'active');
      await page.locator('.manual-cleaning-grip').press('End');
      await wait(() => window.__dentalExperience.report().manualCleaning?.position > .9);
      assert.equal((await report()).detailOpen, false);
      await activate(page.locator('.manual-cleaning-exit'));
      await wait(() => !window.__dentalExperience.report().manualCleaning);
      await seek(.995, 'dentition');
      const finale = await page.evaluate(() => {
        const { arch, report } = window.__dentalExperience;
        const state = report();
        return {
          view: state.finalView, crowns: [...arch.teeth.values()].filter(item => item.crown?.visible).length,
          anatomy: state.cavityAnatomy.active, manualCleaning: state.manualCleaning,
        };
      });
      assert.deepEqual(finale, { view: 'smile', crowns: 28, anatomy: false, manualCleaning: null });
      await seek(.475, 'caries');
      assert.equal((await report()).story.caries.morphInfluence, 1, 'Scrolling backward restores the cavity');
      assert.equal(await page.getByRole('button', { name: /Pozrieť sa na kaz bližšie/ }).isVisible(), true);
      assert.deepEqual(errors, []);
      console.log(`Cavity anatomy passed: ${width}×${height}, ${reduced ? 'reduced motion' : 'normal motion'}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
