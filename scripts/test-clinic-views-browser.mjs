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
  const map = view === clinicViews.map;
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
  assert.equal(first.chapter, cleaning ? 'brush' : finale ? 'closing' : map ? 'map' : 'anatomy');
  const picker=page.locator('#journey-chapter-picker');
  assert.equal(await picker.innerText(), finale ? 'Záverečný úsmev' : cleaning ? 'Čistenie' : map ? 'Mapa chrupu' : 'Stavba zuba');
  if (finale) {
    assert.equal(first.progress, 1, 'The first visible frame is the settled final smile.');
    assert.equal(await page.locator('#journey-step-number').innerText(), '09 / 09');
    assert.equal(await page.locator('#journey-title').textContent(), 'Aj priestor medzi zubami patrí k čisteniu.');
    const state = await page.evaluate(() => window.__dentalExperience.report());
    assert.equal(state.crownMix, 1);
    assert.equal(state.opening, null);
    await page.locator('#journey-mobile-previous').tap();
    await page.waitForFunction(() => window.__dentalExperience.report().map.active);
    await page.locator('#journey-mobile-next').tap();
    await page.waitForFunction(() => window.__dentalExperience.report().story.finalSmile === 1);
    await page.getByRole('button',{name:'Zopakovať čistenie',exact:true}).tap();
    await page.waitForFunction(() => window.__dentalExperience.report().manualCleaning?.transition === 'active');
    assert.equal(await picker.innerText(),'Čistenie');
    assert.equal(await page.locator('.manual-cleaning-grip').getAttribute('aria-valuenow'),'0');
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
    const caption=page.locator('#cleaning-window-caption');
    const toggle=page.getByRole('button',{name:'Nahliadnuť medzi zuby'});
    assert.equal(await caption.isVisible(),false);
    await toggle.tap();
    await caption.waitFor({state:'visible'});
    assert.match(await caption.innerText(),/sedmičky.*priehľadná/);
    await toggle.tap();
    await caption.waitFor({state:'hidden'});
  } else if (map) {
    assert.equal(await page.locator('#dental-map-selected').inputValue(), '');
    assert.equal(await page.locator('#dental-map [data-map-fdi]:visible').count(), 28);
    assert.equal(await page.locator('#dental-map .dental-map-jaw:visible').count(), 2);
    assert.equal(await page.locator('#journey-step-number').innerText(), '08 / 09');
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
  assert.ok(await fresh.locator(cleaning ? '.manual-cleaning-grip' : map ? '#dental-map-selected' : '.healthy-anatomy-layer[data-layer="pulp"][aria-pressed="true"]').isVisible());
  await fresh.close();
  assert.deepEqual(errors, []);
  await page.close();
}

try {
  const context = await browser.newContext({ viewport:{ width:390,height:844 }, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  await context.grantPermissions(['clipboard-read','clipboard-write'], { origin:base.origin });
  for (const view of Object.values(clinicViews)) await openClinic(context, view);
  for (const [fdi, name] of [[13,'Horná pravá trojka'],[36,'Dolná ľavá šestka']]) {
    const detail = await context.newPage();
    const link = new URL(base);
    link.searchParams.set('pohlad',clinicViews.map);
    link.searchParams.set('zub',String(fdi));
    await detail.goto(link.href);
    await detail.locator('body[data-journey-loading]').waitFor({state:'hidden',timeout:90000});
    await detail.getByRole('heading',{name,exact:true}).waitFor({timeout:90000});
    const share = detail.getByRole('link',{name:`Kopírovať odkaz na zub ${fdi}`});
    assert.equal(new URL(await share.getAttribute('href')).search,link.search);
    // A real screen tap does not scroll the underlying story to the button.
    const back = detail.getByRole('button',{name:'Späť na mapu',exact:true});
    const point = await back.evaluate(button => {
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      return {x,y,available:!button.disabled && button.contains(document.elementFromPoint(x,y))};
    });
    assert.ok(point.available,'The visible return control must receive a direct screen tap.');
    await detail.touchscreen.tap(point.x,point.y);
    await detail.locator(`[data-map-fdi="${fdi}"][data-selected]`).waitFor();
    assert.equal(await detail.locator('#dental-map [data-map-fdi]:visible').count(),28);
    await detail.close();
  }
  const home = await context.newPage();
  await home.goto(base.href, { waitUntil:'domcontentloaded' });
  await home.locator('#journey-skip-intro').waitFor({ state:'visible', timeout:90000 });
  await home.locator('#journey-skip-intro').tap();
  await home.locator('body[data-journey-loading]').waitFor({state:'hidden',timeout:90000});
  const picker=home.locator('#journey-chapter-picker');
  await picker.focus();
  await home.keyboard.press('Enter');
  const options=home.locator('#journey-chapter-options');
  assert.equal(await options.isVisible(),true);
  await home.keyboard.press('Escape');
  assert.equal(await options.isVisible(),false);
  assert.equal(await picker.evaluate(button=>button===document.activeElement),true);
  await picker.tap();
  await options.getByRole('button',{name:'Čistenie',exact:true}).tap();
  await home.locator('.manual-cleaning-grip:not(:disabled)').waitFor({state:'visible',timeout:90000});
  assert.equal(await picker.innerText(),'Čistenie');
  await picker.tap();
  await options.getByRole('button',{name:'Stavba zuba',exact:true}).tap();
  await home.locator('#healthy-anatomy').waitFor({state:'visible'});
  assert.equal(await picker.innerText(),'Stavba zuba');
  await context.close();
  console.log('Fresh tabs at 390×844: cleaning, pulp, map, closing smile, clipboard links and cinematic entry passed.');
} finally {
  await browser.close();
}
