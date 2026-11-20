import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { enterStory, nativeJump, restingRaster, touchDrag } from './browser-camera-probes.mjs';
import { recordBrowserInteraction } from './record-molar-transition.mjs';
import { DENTAL_CHAPTERS } from '../src/experience/story-config.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname));
const out = process.env.DENTAL_STORY_REVIEW_DIR;
if (out) await mkdir(out, { recursive: true });
base.searchParams.set('qa', '1');
const viewport = { width: 390, height: 844 };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const phone = { viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function reviewArtwork() {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(base.href);
  await enterStory(page);
  await page.waitForFunction(() => window.__dentalExperience?.report().assetsReady, null, { timeout: 90000 });
  await page.locator('#journey-startup').waitFor({ state: 'hidden' });
  const capture = async name => {
    // Only the paired stills omit controls. Preserve the actual stage crop and lens.
    const style = await page.addStyleTag({ content:
      '#journey-stage > :not(.view-shell), #journey-status, .skip-link {opacity:0!important;pointer-events:none!important}' +
      'html{scrollbar-width:none} #journey-canvas{outline:none!important}' });
    try {
      await restingRaster(page);
      await page.screenshot({ path: join(out, name + '.png'), scale: 'css' });
    } finally { await style.evaluate(el => el.remove()); }
  };
  assert.equal((await page.evaluate(() => window.__dentalExperience.report())).crownMix, 1);
  await capture('smile');
  const section = DENTAL_CHAPTERS.find(c => c.id === 'anatomy').at;
  await nativeJump(page, section);
  await page.waitForFunction(() => window.__dentalExperience.report().healthyAnatomy.amount === 3);
  await capture('pulp');
  await page.locator('#healthy-anatomy-reveal').tap();
  await page.waitForFunction(() => Math.abs(window.__dentalExperience.report().healthyAnatomy.amount - 1.5) < .025);
  await touchDrag(ctx, page, 43, 3);
  await capture('half-turned');
  await ctx.close();
}

async function exerciseBrush() {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const direct = new URL(base);
  direct.searchParams.set('pohlad', 'cistenie-36-37');
  await page.goto(direct.href);
  await page.waitForFunction(() => window.__dentalExperience?.report().manualCleaning?.transition === 'active', null, { timeout: 90000 });
  await page.locator('#journey-startup').waitFor({ state: 'hidden' });
  const state = () => page.evaluate(() => window.__dentalExperience.report());
  const toggle = page.getByRole('button', { name: 'Nahliadnuť medzi zuby', exact: true });
  const grip = page.getByRole('slider', { name: 'Poloha medzizubnej kefky' });
  const cdp = await ctx.newCDPSession(page);
  const fromY = await page.evaluate(() => scrollY);
  const axis = await page.evaluate(() => {
    const { path, rig } = window.__dentalExperience;
    const a = path.sample(path.tipArcMm(0, 0)).position.clone().project(rig.camera);
    const b = path.sample(path.tipArcMm(1, 1)).position.clone().project(rig.camera);
    const rect = document.querySelector('#journey-canvas').getBoundingClientRect();
    return { x: (b.x - a.x) * rect.width / 2, y: (a.y - b.y) * rect.height / 2 };
  });

  async function stroke(to) {
    // Send real single-contact gestures, picking up the on-screen grip again
    // when a fingertip reaches the screen edge. No brush or scene state writes.
    for (let tries = 0; tries < 20; tries++) {
      const manual = (await state()).manualCleaning;
      const delta = to - manual.target;
      if (manual.phase === 'result' || Math.abs(delta) < .01) return;
      const box = await grip.boundingBox();
      assert.ok(box);
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const dx = delta * axis.x, dy = delta * axis.y;
      let span = 1;
      for (const [start, move, size] of [[x, dx, viewport.width], [y, dy, viewport.height]]) {
        if (move > 0) span = Math.min(span, (size - 3 - start) / move);
        if (move < 0) span = Math.min(span, (3 - start) / move);
      }
      assert.ok(span > .025, 'The drag has room inside the viewport');
      const frames = Math.max(5, Math.ceil(26 * Math.abs(delta) * span));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      try {
        for (let i = 1; i <= frames; i++) {
          const t = i / frames, ease = t * t * (3 - 2 * t);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
            touchPoints: [{ x: x + dx * span * ease, y: y + dy * span * ease, id: 1 }] });
          await page.waitForTimeout(24);
        }
      } finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      await page.waitForTimeout(150);
    }
    throw new Error('The grip could not reach the requested position.');
  }

  async function demonstrate() {
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await page.waitForTimeout(850);
    await toggle.tap();
    await page.waitForTimeout(950);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    const contrast = await toggle.evaluate(el => {
      const luminance = color => {
        const [r,g,b] = color.match(/[\d.]+/g).slice(0,3).map(value => {
          const n = Number(value) / 255;
          return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
        });
        return .2126*r + .7152*g + .0722*b;
      };
      const style = getComputedStyle(el);
      const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a,b) => b-a);
      return (values[0]+.05)/(values[1]+.05);
    });
    assert.ok(contrast >= 4.5, 'The latched control label stays legible after the touch.');
    assert.equal((await state()).manualCleaning.cleaningProgress, 0);
    await stroke(.68);
    await page.waitForTimeout(600);
    for (const to of [1, .16, 1, .12, 1, 0]) {
      if ((await state()).manualCleaning.phase === 'result') break;
      await stroke(to);
      await page.waitForTimeout(160);
    }
    await page.waitForFunction(() => {
      const r = window.__dentalExperience.report();
      return r.manualCleaning?.phase === 'result' && !r.story.brush.visible;
    });
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.ok((await state()).manualCleaning.cleaningProgress > .95);
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - fromY) < 1);
    await page.waitForTimeout(1550);
  }
  try {
    if (out && process.env.FFMPEG_PATH) {
      await recordBrowserInteraction(page, join(out, 'cistenie-36-37.mp4'), process.env.FFMPEG_PATH, demonstrate);
    } else { await demonstrate(); }
    await toggle.tap();
    await page.waitForFunction(() => {
      const windowState = window.__dentalExperience.report().cleaningWindow;
      return !windowState.enabled && windowState.amount === 0;
    });
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await page.locator('.manual-cleaning-exit').tap();
    await page.waitForFunction(() => !window.__dentalExperience.report().manualCleaning);
    assert.deepEqual(errors, []);
    console.log('Passed mobile clinic cleaning: latched reveal, real one-finger strokes, withdrawal and result.');
  } finally { await cdp.detach(); await ctx.close(); }
}

try {
  if (out) await reviewArtwork();
  if (!process.argv.includes('--art-only')) await exerciseBrush();
} finally { await browser.close(); }
