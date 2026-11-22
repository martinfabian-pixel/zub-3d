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
  const selectedNumber = page.locator(`.dental-map-labels g[data-map-fdi="${target.fdi}"][data-selected]`);
  await selectedNumber.waitFor({state:'visible'});
  assert.equal(await page.locator('.dental-map-labels g[data-selected]').count(), 1);
}

// Compare rendered text rectangles in CSS pixels. This also catches SVG
// labels whose local viewBox looks fine but scales incorrectly on a phone.
async function checkDiagram(page, teeth) {
  const numbers = await page.locator('.dental-map-labels g[data-map-fdi] text').evaluateAll(nodes =>
    nodes.map(node => {
      const {x,y,width,height} = node.getBoundingClientRect();
      const tick = node.parentNode.querySelector('line').getBoundingClientRect();
      return { fdi:Number(node.textContent), x,y,width,height,
        tickX:tick.x+tick.width/2, tickY:tick.y+tick.height/2 };
    }));
  assert.deepEqual(numbers.map(n=>n.fdi).sort(), [...teeth.keys()].sort(), 'Exactly the present permanent teeth have FDI labels');
  const obstacles = await page.evaluate(() => {
    const visible = element => element.getClientRects().length && !element.closest('[hidden], .sr-only');
    const areas = [...document.querySelectorAll('#journey-stage button, .dental-map-caption select')]
      .filter(visible).map(el=>({name:el.textContent.trim()||el.id,box:el.getBoundingClientRect().toJSON()}));
    for (const node of document.querySelectorAll('#journey-title span, #journey-step-number, .dental-map-key li, #dental-map-description')) {
      if (!visible(node)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        areas.push({name:node.textContent,box:rect.toJSON()});
      }
    }
    return areas;
  });
  const viewport = page.viewportSize();
  for (const [i, label] of numbers.entries()) {
    assert.ok(label.width>=8 && label.height>=9, 'FDI '+label.fdi+' renders legibly');
    assert.ok(label.x>=0 && label.x+label.width<=viewport.width && label.y>=0 && label.y+label.height<=viewport.height,
      'FDI '+label.fdi+' fits on the stage');
    const tooth = teeth.get(label.fdi);
    const cx = label.x+label.width/2, cy = label.y+label.height/2;
    assert.ok(Math.hypot(cx-tooth.x,cy-tooth.y) < 100, 'FDI '+label.fdi+' stays beside its own crown');
    assert.ok(Math.hypot(label.tickX-tooth.x,label.tickY-tooth.y)<Math.hypot(cx-tooth.x,cy-tooth.y),
      'FDI '+label.fdi+' has a leader between the crown and its label');
    for (const other of numbers.slice(i+1)) {
      const dx=Math.min(label.x+label.width,other.x+other.width)-Math.max(label.x,other.x);
      const dy=Math.min(label.y+label.height,other.y+other.height)-Math.max(label.y,other.y);
      assert.ok(dx<=0||dy<=0,'Clear separation of FDI '+label.fdi+' and '+other.fdi);
    }
    for (const t of teeth.values()) {
      assert.ok(t.x < label.x || t.x > label.x+label.width || t.y < label.y || t.y > label.y+label.height,
        'Label '+label.fdi+' leaves crown '+t.fdi+' visible');
    }
    for (const {name,box} of obstacles) {
      assert.ok(label.x+label.width<=box.left || label.x>=box.right || label.y+label.height<=box.top || label.y>=box.bottom,
        'FDI '+label.fdi+' clears '+name);
    }
  }
  const jaws = page.locator('.dental-map-jaw');
  assert.deepEqual((await jaws.allTextContents()).map(name=>name.trim()),['Horná čeľusť','Dolná čeľusť']);
  for (const [i,fdis] of [[0,[11,17]],[1,[41,47]]]) {
    const box=await jaws.nth(i).evaluate(el=>el.getBoundingClientRect().toJSON());
    const y=box.y+box.height/2, limits=fdis.map(n=>teeth.get(n).y);
    assert.ok(y>Math.min(...limits)&&y<Math.max(...limits),`Jaw caption at ${y} belongs between ${limits.join(' and ')}`);
  }
  const legend = await page.locator('.dental-map-key li').allTextContents();
  assert.deepEqual(legend.map(s=>s.replace(/\s+/g,'').toLocaleLowerCase('sk')),[
    '1–2rezáky','3očnézuby','4–5črenovézuby','6–7stoličky']);
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
    await page.locator('.dental-map-labels g[data-map-fdi="36"] text').waitFor({state:'visible'});
    assert.equal(await page.locator('#journey-step-number').innerText(), '08 / 09');
    assert.equal((await page.locator('#journey-chapter-picker').innerText()).trim(), 'Mapa chrupu');
    assert.equal(await page.locator('#dental-map-selected').inputValue(), '');
    assert.equal(await page.evaluate(()=>window.__dentalExperience.report().map.selectedFdi),null);
    assert.equal(await page.locator('.dental-map-labels [data-selected]').count(),0);
    const shape = await measure(page);
    const teeth = new Map(shape.teeth.map(tooth => [tooth.fdi,tooth]));
    assert.equal(teeth.size, 28);
    await checkDiagram(page, teeth);
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
    for (const fdi of [11,21]) {
      const box = await page.locator(`g[data-map-fdi="${fdi}"] text`).evaluate(el=>el.getBoundingClientRect().toJSON());
      await tapTooth(page, {fdi, x:box.x+box.width/2, y:box.y+box.height/2}, mobile);
      assert.equal(await page.locator('g[data-map-fdi] text:visible').count(), 28);
    }
    const order = [11,21,12,22,41,31,42,32, ...teeth.keys()];
    for (const fdi of new Set(order)) {
      await tapTooth(page, teeth.get(fdi), mobile);
      const badge = await page.locator('.dental-map-labels g[data-map-fdi="'+fdi+'"] text').boundingBox();
      const centre = teeth.get(fdi);
      assert.ok(centre.x < badge.x || centre.x > badge.x + badge.width
        || centre.y < badge.y || centre.y > badge.y + badge.height, 'FDI badge leaves the chewing surface clear');
      if (fdi === 11) {
        assert.equal((await page.locator('#dental-map-name').innerText()).trim(), 'Horná pravá jednotka');
        assert.match(await page.locator('#dental-map-description').innerText(), /stredný rezák/i);
        assert.match(await page.locator('.dental-map-key li[data-selected]').innerText(), /Rezáky/);
      }
    }
    const selected = await measure(page);
    assert.deepEqual(selected.pose,shape.pose,'Changing a tooth must not move the camera');
    assert.deepEqual(selected.teeth,shape.teeth,'Changing a caption must not move either arch');
    const picker = page.getByRole('combobox',{name:'Vybrať zub na mape chrupu'});
    await picker.selectOption('46');
    await page.locator('g[data-map-fdi="46"][data-selected]').waitFor({state:'visible'});
    assert.equal(await page.locator('#dental-map-name').innerText(),'Dolná pravá šestka');
    await picker.selectOption('');
    await page.locator('g[data-map-fdi][data-selected]').waitFor({state:'hidden'});
    assert.equal(await page.locator('#dental-map-name').innerText(),'Vybrať zub');

    const working = DENTAL_STORY.brush.work[0], halfLower = (map.lower[0]+map.upper[0])*.5;
    await settleAt(page, working);
    await page.locator('.dental-map-labels').waitFor({state:'hidden'});
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
    assert.equal(await page.locator('#dental-map-selected').inputValue(),'');
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
        await page.waitForTimeout(1800);
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
      await checkDiagram(page, new Map(narrow.teeth.map(t=>[t.fdi,t])));
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
