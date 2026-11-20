import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DENTAL_CHAPTERS, STORY_TIMING } from '../src/experience/story-config.js';
import { nativeJump, touchDrag } from './browser-camera-probes.mjs';
import { recordBrowserInteraction } from './record-molar-transition.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
url.searchParams.set('qa', '1');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const at = id => DENTAL_CHAPTERS.find(chapter => chapter.id === id).at;

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const wait = (fn, value) => page.waitForFunction(fn, value, { timeout: 60000 });
  const picker = page.locator('#journey-chapter-picker');
  await page.goto(url.href);
  await wait(() => window.__dentalExperience?.report().assetsReady);
  await page.locator('#journey-startup').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#journey-canvas').getAttribute('data-stage'), 'dentition');

  const out = process.env.DENTAL_STORY_REVIEW_DIR;
  if (out && process.env.FFMPEG_PATH) {
    await mkdir(out, { recursive: true });
    const beats = [
      [0, 900], [at('assembly'), 2300], [at('assembly'), 900], [at('hero'), 1800],
      [at('hero'), 650], [at('anatomy'), 2900], [at('anatomy'), 1300],
      [at('space'), 2200], [at('space'), 700], [at('plaque'), 1100],
      [at('plaque'), 500], [STORY_TIMING.resultAt, 4100], [STORY_TIMING.resultAt, 700], [1, 2400], [1, 1100],
    ];
    await recordBrowserInteraction(page, join(out, 'pribeh.mp4'), process.env.FFMPEG_PATH, () => page.evaluate(async beats => {
      const section = document.querySelector('#dental-journey').getBoundingClientRect();
      const base = scrollY + section.top;
      const travel = section.height - document.querySelector('#journey-stage').clientHeight;
      let previous = 0;
      for (const [destination, duration] of beats) {
        const start = performance.now();
        let t = 0;
        while (t < 1) {
          const now = await new Promise(requestAnimationFrame);
          t = Math.min(1, (now - start) / duration);
          scrollTo({ top: base + travel * (previous + (destination - previous) * t * t * (3 - 2 * t)), behavior: 'instant' });
        }
        previous = destination;
      }
    }, beats));
  }

  for (const chapter of [...DENTAL_CHAPTERS, ...DENTAL_CHAPTERS.toReversed()]) {
    await nativeJump(page, chapter.at);
    await wait(id => window.__dentalExperience.report().story.chapterId === id, chapter.id);
    await wait(id => document.querySelector('#journey-chapter-picker')?.textContent.includes(id), chapter.label);
  }
  await picker.tap();
  await page.locator('#journey-chapter-options').getByRole('button', { name: 'Čistenie', exact: true }).tap();
  await wait(() => window.__dentalExperience.report().manualCleaning?.transition === 'active');
  assert.equal(await page.locator('.manual-cleaning-grip').getAttribute('aria-valuenow'), '0');
  await page.locator('.cleaning-window-toggle').tap();
  await wait(() => window.__dentalExperience.report().cleaningWindow.amount === 1);
  const grip = page.locator('.manual-cleaning-grip');
  await grip.press('End');
  await wait(() => window.__dentalExperience.report().manualCleaning?.position > .99);
  const firstPass = await page.evaluate(() => window.__dentalExperience.report().manualCleaning.cleaningProgress);
  assert.ok(firstPass > .35 && firstPass < .4, 'One full stroke cleans only its share of the reachable plaque');
  for (const key of ['Home', 'End', 'Home']) {
    await grip.press(key);
    await wait(key => {
      const state = window.__dentalExperience.report().manualCleaning;
      return state?.phase === 'result' || (key === 'End' ? state?.position > .99 : state?.position < .01);
    }, key);
  }
  await wait(() => window.__dentalExperience.report().manualCleaning?.phase === 'result');
  await page.locator('.manual-cleaning-exit').tap();
  await wait(() => !window.__dentalExperience.report().manualCleaning);

  await nativeJump(page, at('anatomy'));
  await page.locator('[data-layer="dentin"]').tap();
  await wait(() => window.__dentalExperience.report().healthyAnatomy.highlight === 'dentin');
  await touchDrag(context, page, 80, 0);
  const yaw = await page.evaluate(() => window.__dentalExperience.report().view.desiredYaw);
  assert.ok(Math.abs(yaw) > .1);
  await page.locator('[data-layer="pulp"]').tap();
  await wait(() => window.__dentalExperience.report().healthyAnatomy.highlight === 'pulp');
  assert.equal(await page.evaluate(() => window.__dentalExperience.report().view.desiredYaw), yaw);
  await nativeJump(page, 1);
  await page.locator('#journey-repeat-cleaning').waitFor();
  await wait(() => window.__dentalExperience.report().crownMix === 1);
  assert.match(await picker.innerText(), /Záverečný úsmev/);
  await page.locator('#journey-repeat-cleaning').tap();
  await wait(() => window.__dentalExperience.report().manualCleaning?.transition === 'active');
  assert.equal(await page.locator('.manual-cleaning-grip').getAttribute('aria-valuenow'), '0');
  assert.deepEqual(errors, []);
  console.log('Patient journey, reverse scroll, two-tap navigation, layer selection with rotation, cleaning and replay passed at 390 × 844.');
} finally {
  await browser.close();
}
