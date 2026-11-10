// Browser regression for the opening motion and the two distinct dental examples.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { mouseDrag, touchDrag } from './browser-camera-probes.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const baseUrl = process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/';
const screenshotDir = process.env.DENTAL_STORY_REVIEW_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const scenarios = [[390, 844, false], [1440, 900, false], [390, 844, true]];
  for (const [width, height, reduced] of scenarios.filter(([, , isReduced]) => process.env.DENTAL_REDUCED_ONLY !== '1' || isReduced)) {
    const mobile = width < 700;
    const context = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('response', response => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      const url = new URL(baseUrl);
      url.searchParams.set('qa', '1');
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__dentalExperience?.report().ready, null, { timeout: 90000 });
      const report = () => page.evaluate(() => window.__dentalExperience.report());
      const initial = await report();
      if (!reduced) await page.waitForFunction(angle => {
        const spin = window.__dentalExperience.report().heroSpin;
        return Math.abs(spin.angle - angle) > .05;
      }, initial.heroSpin.angle, { timeout: 10000 });
      else await page.waitForTimeout(200);
      const afterOpening = await report();
      if (reduced) {
        assert.equal(afterOpening.heroSpin.state, 'done');
        assert.equal(afterOpening.heroSpin.angle, 0);
      } else {
        assert.ok(Math.abs(afterOpening.heroSpin.angle - initial.heroSpin.angle) > .05, 'The hero visibly rotates');
        if (mobile) await touchDrag(context, page, 55, 0);
        else await mouseDrag(page, 70, 0);
        const moved = await report();
        assert.equal(moved.heroSpin.state, 'paused', 'Dragging interrupts the automatic orbit');
        assert.ok(Math.abs(moved.view.desiredYaw) > .01, 'Dragging still controls the model');
      }
      await page.waitForFunction(() => window.__dentalExperience?.report().assetsReady, null, { timeout: 90000 });

      async function seek(progress) {
        await page.evaluate(value => {
          const rect = document.querySelector('#dental-journey').getBoundingClientRect();
          const height = document.querySelector('#journey-stage').clientHeight;
          scrollTo({ top: scrollY + rect.top + (rect.height - height) * value, behavior: 'instant' });
        }, progress);
        try {
          await page.waitForFunction(value => {
            const state = window.__dentalExperience.report();
            return Math.abs(state.progress - value) < .002 && Math.abs(state.renderProgress - state.storyProgress) < .00002;
          }, progress, { timeout: 15000 });
        } catch (error) {
          console.error('Seek failed:', { progress, state: await report() });
          throw error;
        }
        await page.waitForTimeout(700); // camera handover and input damping
        return report();
      }

      const cavity = await seek(.475);
      assert.equal(cavity.story.lesionDisplay, 1);
      assert.equal(cavity.story.caries.morphInfluence, 1);
      assert.equal(await page.locator('.cavity-detail-trigger').isVisible(), true);
      const anchor = cavity.annotations.labels.find(label => label.id === 'caries');
      assert.ok(anchor?.visible, 'The cavity anchor must be visible for a direct click');
      const radius = distance(cavity.camera, cavity.target);
      if (mobile) await page.touchscreen.tap(...anchor.point);
      else await page.mouse.click(...anchor.point);
      await page.waitForFunction(() => window.__dentalExperience.report().detailOpen, null, { timeout: 12000 });
      await page.waitForFunction(() => {
        const microbes = window.__dentalExperience.report().microbes;
        return microbes?.visible && microbes.reveal > .95;
      }, null, { timeout: 5000 });
      const zoomed = await report();
      if (!reduced) assert.ok(distance(zoomed.camera, zoomed.target) < radius * .8, 'The camera approaches the clicked cavity');
      assert.equal(await page.locator('canvas').count(), 1, 'The close-up uses the existing Three.js canvas');
      assert.equal(await page.locator('#cavity-detail-dialog').count(), 0, 'The 3D close-up is not replaced by a dialog illustration');
      assert.equal(zoomed.microbes?.visible, true, 'Cartoon bacteria appear in the 3D close-up');
      assert.equal(await page.locator('.cavity-detail-return').isVisible(), true);
      if (screenshotDir && !reduced) await page.screenshot({ path: `${screenshotDir}/${width}-cavity-detail.png` });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !window.__dentalExperience.report().detailOpen);
      await page.waitForFunction(before => {
        const after = window.__dentalExperience.report().camera;
        return Math.hypot(...after.map((value, i) => value - before[i])) < .04;
      }, cavity.camera, { timeout: 5000 });
      const restored = await report();
      assert.equal(restored.exploring, false);
      assert.ok(distance(cavity.camera, restored.camera) < .04, `Closing restores the original camera: ${JSON.stringify({before:cavity.camera,after:restored.camera,view:restored.view,exploring:restored.exploring})}`);

      if (!reduced) {
        await page.evaluate(() => {
          document.querySelector('.cavity-detail-trigger').click();
          document.querySelectorAll('.journey-step')[0].click();
        });
        await page.waitForFunction(() => {
          const state = window.__dentalExperience.report();
          return state.story.chapterId === 'hero' && state.renderProgress < .001;
        }, null, { timeout: 6000 });
        const interrupted = await report();
        assert.equal(interrupted.detailOpen, false, 'Navigation cancels a pending close-up');
        assert.equal(interrupted.detailPending, false);
        assert.equal(interrupted.story.chapterId, 'hero');
        await seek(.475);
      }

      if (mobile) {
        await page.locator('#journey-explore').click();
        const cdp = await context.newCDPSession(page);
        const [x, y] = anchor.point;
        const pair = spread => [{ x: x - spread, y, id: 0 }, { x: x + spread, y, id: 1 }];
        try {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pair(10) });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pair(25) });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } finally { await cdp.detach(); }
        await page.waitForTimeout(400);
        assert.equal((await report()).detailOpen, false, 'A pinch cannot activate the cavity detail');
        await page.locator('#journey-explore').click();
        await page.waitForTimeout(700);
      }

      const changeover = await seek(.4875);
      assert.equal(changeover.story.lesionDisplay, 0);
      assert.equal(changeover.story.exampleOpacity, reduced ? 1 : 0, 'The example changes under a fade or a reduced-motion still');
      const brushing = await seek(.62);
      assert.equal(brushing.story.lesionProgress, 1, 'The earlier example remains in story data');
      assert.equal(brushing.story.lesionDisplay, 0);
      assert.equal(brushing.microbes?.visible, false, 'The bacteria do not carry over into the healthy brushing example');
      assert.equal(brushing.story.caries.morphInfluence, 0, 'The brush uses the healthy example');
      assert.match(await page.locator('#journey-description').innerText(), /zdravom zube/);
      assert.equal(await page.locator('.cavity-detail-trigger').isVisible(), false);
      const result = await seek(.76);
      assert.equal(result.story.caries.morphInfluence, 0);
      assert.match(await page.locator('#journey-title').innerText(), /Zdravý zub/);
      const returned = await seek(.475);
      assert.equal(returned.story.lesionDisplay, 1);
      assert.equal(returned.story.caries.morphInfluence, 1, 'Reverse scroll restores the cavity example');
      await page.locator('.cavity-detail-trigger').click();
      await page.waitForFunction(() => window.__dentalExperience.report().detailOpen, null, { timeout: 12000 });
      await page.locator('.cavity-detail-return').click();
      await page.waitForFunction(() => !window.__dentalExperience.report().detailOpen);
      assert.deepEqual(errors, []);
      console.log(`Cavity interaction passed: ${width}×${height}, ${reduced ? 'reduced motion' : 'normal motion'}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
