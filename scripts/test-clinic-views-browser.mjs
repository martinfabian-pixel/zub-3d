import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { clinicViews } from '../src/experience/clinical-views.js';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(base.hostname));
const browser = await chromium.launch({ channel:'chrome', headless:true });

async function openClinic(context, view) {
  const cleaning = view === clinicViews.cleaning;
  const finale = view === clinicViews.smile;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    function observe() {
      const canvas = document.querySelector('#journey-canvas');
      if (!canvas || canvas.dataset.ready !== 'true' || getComputedStyle(canvas).visibility !== 'visible') {
        requestAnimationFrame(observe);
        return;
      }
      window.firstClinicFrame = { chapter:canvas.dataset.stage,
        progress:Number(canvas.dataset.sceneProgress),
        manual:document.querySelector('#journey-stage').dataset.manualCleaning,
        selected:document.querySelector('.healthy-anatomy-layer[aria-pressed="true"]')?.dataset.layer };
    }
    requestAnimationFrame(observe);
  });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const dependency = cleaning ? '/story-assets/site.json' : '/dentition-assets/crowns.glb';
  await page.route(url => url.pathname.endsWith(dependency), async route => {
    await gate;
    await route.continue();
  });
  const target = new URL(base);
  target.searchParams.set('pohlad', view);
  target.searchParams.set('qa', '1');
  await page.goto(target.href, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(needsSite => {
    const readiness = window.__dentalExperience?.report().readiness;
    return needsSite ? readiness?.crowns : readiness?.flight;
  }, cleaning, { timeout:90000 });
  assert.equal(await page.locator('#journey-startup').isVisible(), true);
  assert.equal(await page.locator('#journey-skip-intro').count(), 0);
  assert.equal(await page.evaluate(() => window.firstClinicFrame), undefined);
  release();
  await page.locator('#journey-startup').waitFor({ state:'hidden', timeout:90000 });
  await page.waitForFunction(() => window.firstClinicFrame);
  const first = await page.evaluate(() => window.firstClinicFrame);
  assert.equal(first.chapter, cleaning || finale ? 'brush' : 'anatomy');
  if (finale) {
    assert.equal(first.progress, 1, 'The first visible frame is the settled final smile.');
    assert.equal(await page.locator('#journey-step-number').innerText(), '07 / 07');
    assert.equal(await page.locator('#journey-title').textContent(), 'Malý návyk. Veľký rozdiel.');
    const state = await page.evaluate(() => window.__dentalExperience.report());
    assert.equal(state.crownMix, 1);
    assert.equal(state.opening, null);
    await page.locator('#journey-mobile-previous').tap();
    await page.waitForFunction(() => window.__dentalExperience.report().story.brushStoryPhase === 'cleaning');
    await page.locator('#journey-mobile-next').tap();
    await page.waitForFunction(() => window.__dentalExperience.report().story.brushStoryPhase === 'smile');
    await page.locator('#journey-show-all').tap();
    await page.locator('#journey-view-anatomy').waitFor({ state:'visible' });
    assert.deepEqual(errors, []);
    await page.close();
    return;
  }
  if (cleaning) {
    assert.equal(first.manual, 'true');
    const state = await page.evaluate(() => window.__dentalExperience.report().manualCleaning);
    assert.equal(state.phase, 'ready');
    assert.equal(state.position, 0);
    assert.equal(state.cleaningProgress, 0);
    assert.equal(await page.locator('.manual-cleaning-grip').isEnabled(), true);
  } else {
    assert.equal(first.selected, 'pulp');
    const state = await page.evaluate(() => window.__dentalExperience.report().healthyAnatomy);
    assert.equal(state.layer, 'pulp');
    assert.equal(state.amount, 3);
    assert.equal(state.highlight, 'pulp');
    assert.equal(await page.locator('#healthy-anatomy-reveal').inputValue(), '3');
  }
  await page.locator('.clinic-share a').click();
  const expected = new URL(await page.locator('body').getAttribute('data-asset-base'), target);
  expected.searchParams.set('pohlad', view);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied, expected.href);
  if (cleaning) {
    await page.setViewportSize({ width:320, height:568 });
    const gaps = await page.locator('.site-header').evaluate(header => {
      const controls = [...header.querySelectorAll('button, a')].map(el => el.getBoundingClientRect());
      return controls.slice(1).map((rect, i) => rect.left - controls[i].right);
    });
    assert.ok(gaps.every(px => px >= 6), 'All four header targets stay separated at 320px.');
    await page.locator('#journey-home').focus();
    await page.keyboard.press('Tab');
    assert.ok(await page.locator('.clinic-share a').evaluate(el => el === document.activeElement));
  }
  const fresh = await context.newPage();
  await fresh.goto(copied, { waitUntil:'domcontentloaded' });
  await fresh.locator('#journey-startup').waitFor({ state:'hidden', timeout:90000 });
  assert.equal(await fresh.locator('#journey-canvas').getAttribute('data-stage'), first.chapter);
  assert.ok(await fresh.locator(cleaning ? '.manual-cleaning-grip' : '.healthy-anatomy-layer[data-layer="pulp"][aria-pressed="true"]').isVisible());
  await fresh.close();
  assert.deepEqual(errors, []);
  await page.close();
}

try {
  const context = await browser.newContext({ viewport:{ width:390,height:844 }, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  await context.grantPermissions(['clipboard-read','clipboard-write'], { origin:base.origin });
  for (const view of Object.values(clinicViews)) await openClinic(context, view);
  const home = await context.newPage();
  await home.goto(base.href, { waitUntil:'domcontentloaded' });
  await home.locator('#journey-skip-intro').waitFor({ state:'visible', timeout:90000 });
  await context.close();
  console.log('Clinic views: cleaning, pulp, final smile, their controls and ordinary cinematic entry passed in fresh tabs at 390×844.');
} finally {
  await browser.close();
}
