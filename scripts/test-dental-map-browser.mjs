import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DENTAL_STORY, STORY_TIMING } from '../src/experience/story-config.js';
import { enterStory, nativeJump } from './browser-camera-probes.mjs';
import { recordBrowserInteraction } from './record-molar-transition.mjs';

const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
const review = process.env.DENTAL_STORY_REVIEW_DIR;
const webkitRun = process.env.DENTAL_MAP_WEBKIT === '1';
const browser = webkitRun ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
const map = STORY_TIMING.map;
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

async function settleAt(page, progress) {
  await nativeJump(page, progress);
  await page.waitForFunction(at => {
    const { progress, renderProgress, storyProgress } = window.__dentalExperience.report();
    return Math.abs(progress - at) < .0005 && renderProgress === storyProgress;
  }, progress);
}

// Use the crowns actually drawn, with their current world transforms and the
// full camera projection. The tests tap the model through the browser.
async function measure(page) {
  return page.evaluate(() => {
    const app = window.__dentalExperience, camera = app.rig.camera;
    const rect = document.querySelector('#journey-canvas').getBoundingClientRect();
    const teeth = [], bounds = {left:Infinity, top:Infinity, right:-Infinity, bottom:-Infinity};
    const point = camera.position.clone();
    const screen = () => ({
      x:rect.x + (.5 + .5 * point.x) * rect.width,
      y:rect.y + (.5 - .5 * point.y) * rect.height,
    });
    app.scene.updateMatrixWorld(true);
    for (const [fdi, item] of app.arch.teeth) {
      const crown = item.crown;
      if (!crown?.visible) continue;
      crown.geometry.boundingBox.getCenter(point).applyMatrix4(crown.matrixWorld).project(camera);
      teeth.push({fdi, ...screen()});
      const positions = crown.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 3) {
        point.fromBufferAttribute(positions, i).applyMatrix4(crown.matrixWorld).project(camera);
        const {x,y} = screen();
        bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
        bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
      }
    }
    return {teeth, bounds, pose:[...camera.matrixWorld.elements, ...camera.projectionMatrix.elements]};
  });
}

async function tapTooth(page, target, mobile) {
  if (mobile) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  await page.waitForFunction(fdi => Number(document.querySelector('#dental-map-selected').value) === fdi, target.fdi, {timeout:3000})
    .catch(() => { throw new Error('The tap on crown ' + target.fdi + ' at ' + target.x.toFixed(1) + ', ' + target.y.toFixed(1) + ' did not select it'); });
  assert.equal((await page.locator('#dental-map-number').textContent()).trim(), String(target.fdi));
}

async function scrub(page, from, to, duration) {
  await page.evaluate(async ({from,to,duration}) => {
    const rect = document.querySelector('#dental-journey').getBoundingClientRect();
    const top = scrollY + rect.top, span = rect.height - document.querySelector('#journey-stage').clientHeight;
    const start = performance.now();
    let t = 0;
    while (t < 1) {
      const now = await new Promise(requestAnimationFrame);
      t = Math.min(1, (now - start) / duration);
      scrollTo({ top:top + span * (from + (to-from) * t*t*(3-2*t)), behavior:'instant' });
    }
  }, {from,to,duration});
}

async function reviewMap(mobile) {
  const viewport = mobile ? {width:390,height:844} : {width:1366,height:860};
  const context = await browser.newContext({viewport, isMobile:mobile, hasTouch:mobile, deviceScaleFactor:mobile?2:1});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const link = new URL(base);
    link.searchParams.set('pohlad', 'mapa-chrupu');
    link.searchParams.set('qa', '1');
    await page.goto(link.href);
    await enterStory(page);
    await page.locator('#dental-map-number').waitFor({state:'visible'});
    assert.equal(await page.locator('#journey-step-number').innerText(), '08 / 09');
    assert.equal((await page.locator('#journey-chapter-picker').innerText()).trim(), 'Mapa chrupu');
    assert.match(await page.locator('#dental-map-name').innerText(), /Dolná ľavá šestka/);
    assert.equal(await page.locator('#dental-map-description').innerText(), 'Medzi týmto zubom a susednou sedmičkou ste si práve pozreli ukážku čistenia.');
    const shape = await measure(page);
    const teeth = new Map(shape.teeth.map(tooth => [tooth.fdi,tooth]));
    assert.equal(teeth.size, 28);
    for (let i=1;i<=7;i++) {
      assert.ok(teeth.get(10+i).x < teeth.get(20+i).x && teeth.get(40+i).x < teeth.get(30+i).x, 'Patient right is screen left for position ' + i);
      assert.ok(teeth.get(10+i).y < teeth.get(40+i).y && teeth.get(20+i).y < teeth.get(30+i).y, 'Upper arch must stay above lower arch');
    }
    assert.ok(teeth.get(11).y < teeth.get(17).y && teeth.get(41).y > teeth.get(47).y, 'Both incisor rows face their respective outer edges');
    const {left,right,top,bottom} = shape.bounds;
    const caption = await page.locator('#dental-map-name').boundingBox();
    assert.ok(left > 0 && right < viewport.width && top > 0 && bottom < viewport.height, 'Entire map is inside viewport');
    if (mobile) {
      assert.ok(right-left >= viewport.width*.68, 'Arches use mobile width');
      assert.ok(caption.y >= bottom-1, 'Patient copy belongs below both arches');
    }
    if (review) {
      await mkdir(review, {recursive:true});
      await page.screenshot({path:join(review, (mobile?'mobil':'desktop') + '-mapa.png'), scale:'css'});
    }
    const order = [11,21,12,22,41,31,42,32, ...teeth.keys()];
    for (const fdi of new Set(order)) {
      await tapTooth(page, teeth.get(fdi), mobile);
      const badge = await page.locator('#dental-map-number').boundingBox();
      const centre = teeth.get(fdi);
      assert.ok(centre.x < badge.x || centre.x > badge.x + badge.width
        || centre.y < badge.y || centre.y > badge.y + badge.height, 'FDI badge leaves the chewing surface clear');
      if (fdi === 11) {
        assert.equal((await page.locator('#dental-map-name').innerText()).trim(), 'Horná pravá jednotka');
        assert.match(await page.locator('#dental-map-description').innerText(), /stredný rezák/i);
      }
    }
    const selected = await measure(page);
    assert.deepEqual(selected.pose,shape.pose,'Changing a tooth must not move the camera');
    assert.deepEqual(selected.teeth,shape.teeth,'Changing a caption must not move either arch');

    const working = DENTAL_STORY.brush.work[0], halfLower = (map.lower[0]+map.upper[0])*.5;
    await settleAt(page, working);
    await page.locator('#dental-map-number').waitFor({state:'hidden'});
    const before = await page.evaluate(() => window.__dentalExperience.report().story);
    assert.equal(before.chapterId,'brush');
    assert.ok(before.brushPose.visibility > .9);
    await settleAt(page,halfLower);
    const outward = await measure(page);
    const unfolding = await page.evaluate(() => window.__dentalExperience.report());
    assert.ok(unfolding.story.mapLower > 0 && unfolding.story.mapUpper === 0, 'Lower arch opens first');
    assert.ok(unfolding.story.mapSite > .5, '36 and 37 stay highlighted while the lower arch opens');
    assert.ok(unfolding.visibleTeeth.includes(36) && unfolding.visibleTeeth.includes(37));
    await settleAt(page,map.at);
    assert.equal(await page.locator('#dental-map-selected').inputValue(),'36');
    await settleAt(page,1);
    assert.equal(await page.locator('#journey-step-number').innerText(),'09 / 09');
    await page.getByRole('button',{name:'Zopakovať čistenie'}).waitFor();
    await settleAt(page,halfLower);
    const inward = await measure(page);
    assert.ok(outward.pose.every((n,i)=>near(n,inward.pose[i],1e-5)), 'Camera follows the same path when scrolling backwards');
    assert.equal(inward.teeth.length,outward.teeth.length);
    for (let i=0;i<inward.teeth.length;i++) {
      assert.ok(near(inward.teeth[i].x,outward.teeth[i].x,.05) && near(inward.teeth[i].y,outward.teeth[i].y,.05), 'Crown positions reverse on the same path');
    }
    if (mobile && review && process.env.FFMPEG_PATH && !webkitRun) {
      await settleAt(page,working);
      await recordBrowserInteraction(page,join(review,'od-kefky-k-usmevu.mp4'),process.env.FFMPEG_PATH,async()=>{
        await page.waitForTimeout(500);
        await scrub(page,working,STORY_TIMING.resultAt,1800);
        await page.waitForTimeout(300);
        const lowerView = map.lower[1];
        await scrub(page,STORY_TIMING.resultAt,lowerView,2600);
        await page.waitForTimeout(350);
        await scrub(page,lowerView,map.at,1250);
        await page.waitForTimeout(1000);
        await tapTooth(page,teeth.get(11),true);
        await page.waitForTimeout(1400);
        await scrub(page,map.at,1,2800);
        await page.waitForFunction(()=>window.__dentalExperience.report().story.chapterId==='closing');
        await page.waitForTimeout(900);
      },{minFrames:60});
    }
    if (mobile) {
      await page.setViewportSize({width:320, height:568});
      await page.waitForFunction(() => {
        const [width, height] = window.__dentalExperience.report().composition.fullSensor;
        return width === 320 && height === 568;
      });
      await settleAt(page,map.at);
      const narrow = await measure(page);
      for (const fdi of [11,21,41,31]) {
        await tapTooth(page,narrow.teeth.find(tooth=>tooth.fdi===fdi),true);
      }
      const name = await page.locator('#dental-map-name').boundingBox();
      assert.ok(narrow.bounds.bottom < name.y,'Small phones keep both arches above their caption');
    }
    assert.deepEqual(errors,[]);
    console.log((webkitRun?'WebKit':'Chrome')+' '+viewport.width+' × '+viewport.height+' touch/selection, FDI orientation, coverage, copy, and reversible handoff passed.',shape.bounds);
  } finally {
    await context.close();
  }
}

try {
  await reviewMap(true);
  if (!webkitRun) await reviewMap(false);
} finally {
  await browser.close();
}
