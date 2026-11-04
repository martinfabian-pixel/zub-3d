// Local QA only. Launches a fresh headless Chrome process with isolated browser
// contexts; never connects to a running browser, profile, or external server.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const origin = new URL(process.env.EXPERIENCE_TEST_URL || process.env.PROTOTYPE_TEST_URL || 'http://127.0.0.1:5173');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('Experience QA requires a localhost origin.');
const site = new URL(origin.href.endsWith('/') ? origin.href : origin.href + '/');
const route = (pathname) => new URL(pathname, site).href;
const output = resolve(process.env.EXPERIENCE_REVIEW_DIR || 'docs/experience-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const canvas = '#journey-canvas', atlas = '**/dentition-assets/dentition*.glb*';
const allFDI = [1, 2, 3, 4].flatMap((q) => Array.from({ length: 7 }, (_, i) => 10*q + i + 1));
const shots = [['hero', 0, [36]], ['neighbors', .34, [35, 36, 37]], ['arch', .64, allFDI.slice(14)], ['full', .9, allFDI]];
const report = { date: new Date().toISOString(), sitePrefix:site.pathname, scope: 'Own headless Chrome on localhost. Touch and mobile dimensions are emulated on this desktop GPU.', checks: [], issues: [], errors: [], warnings: [], failures: [], views: [], benchmarks: [] };
function check(name, ok, detail) {
  report.checks.push({ name, passed: Boolean(ok) });
  if (!ok) report.issues.push({ name, detail });
}
async function open(options = {}, injected = false) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, ...options });
  // Guard every network request, not just top-level navigation.
  await context.route('**/*', (route) => {
    const requestURL = new URL(route.request().url());
    if (requestURL.origin !== origin.origin) {
      report.issues.push({ name: 'External request blocked', detail: requestURL.href });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  if (!injected) {
    page.on('console', (entry) => {
      if (entry.type() === 'error') report.errors.push(entry.text());
      if (entry.type() === 'warning' && !report.warnings.includes(entry.text())) report.warnings.push(entry.text());
    });
    page.on('requestfailed', (request) => report.failures.push(request.url() + ': ' + request.failure()?.errorText));
    page.on('response', (response) => { if (response.status() >= 400) report.failures.push(response.status() + ': ' + response.url()); });
  }
  return { context, page };
}
const goto = (p, entry='?qa=1') => p.goto(route(entry), { waitUntil: 'domcontentloaded' });
const heroReady = (p) => p.waitForSelector(canvas + '[data-ready="true"]', { timeout: 45000 });
const allReady = (p) => p.waitForSelector(canvas + '[data-assets-ready="true"]', { timeout: 45000 });
const settle = (p) => p.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
async function atProgress(page,p) {
  await page.waitForFunction((expected) => Math.abs(Number(document.querySelector('#journey-canvas').dataset.progress)-expected)<.002,p);
  await settle(page);
}

// Use only native scrolling for poses, including skips and reverse journeys.
async function scroll(page, p, wait = true) {
  await page.evaluate((progress) => {
    const section = document.querySelector('#dental-journey').getBoundingClientRect();
    const height = document.querySelector('#journey-stage').getBoundingClientRect().height;
    window.scrollTo({ top: window.scrollY + section.top + progress * (section.height - height), behavior: 'instant' });
  }, p);
  if (wait) await atProgress(page,p);
}

async function snapshot(page, project = false) {
  return page.evaluate((project) => {
    const app = window.__dentalExperience, c = document.querySelector('#journey-canvas');
    const data = app.report(), teeth = data.teeth ?? [];
    const camera = app.rig.camera, result = { dataset: { ...c.dataset }, progress: data.progress,
      sceneProgress: data.sceneProgress, stage: data.stage, shaderErrors: data.shaderErrors, camera: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
      distance: camera.position.distanceTo(app.rig.target), exploring: data.exploring,
      frame: app.renderer.info.render.frame, gpu: { ...app.renderer.info.memory }, counts: { canvases: document.querySelectorAll('canvas').length },
      reported: teeth.map((t) => ({ fdi:Number(t.fdi), source:Number(t.source), triangles:t.triangles, reveal:Number(t.reveal), matrix:t.worldMatrix ?? t.matrixWorld })),
      toothMeshes: [], auxiliaryMeshes: [], projected: {}, outOfFrame: [], visibleFDI: [] };
    const fdiOf = (object) => {
      let node = object;
      while (node) {
        const explicit = Number(node.userData?.fdi ?? node.userData?.FDI);
        if (Number.isInteger(explicit) && explicit >= 11 && explicit <= 47) return explicit;
        const match = /(?:FDI|tooth)[ _-]*([1-4][1-7])(?:[^0-9]|$)/i.exec(node.name);
        if (match) return Number(match[1]);
        node = node.parent;
      }
      return null;
    };
    camera.updateMatrixWorld(); app.scene.updateMatrixWorld(true);
    const p = camera.position.clone(), visible = new Set();
    app.scene.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const fdi = fdiOf(mesh);
      if (!fdi) { result.auxiliaryMeshes.push(mesh.name); return; }
      result.toothMeshes.push(fdi);
      let ancestor = mesh;
      while (ancestor) { if (!ancestor.visible) return; ancestor = ancestor.parent; }
      visible.add(fdi);
      if (!project) return;
      const bounds = result.projected[fdi] ?? { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity, clipped: 0, vertices: 0 };
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).project(camera);
        bounds.left = Math.min(bounds.left, p.x); bounds.right = Math.max(bounds.right, p.x);
        bounds.bottom = Math.min(bounds.bottom, p.y); bounds.top = Math.max(bounds.top, p.y); bounds.vertices++;
        if (Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) > 1.0001) bounds.clipped++;
      }
      result.projected[fdi] = bounds;
    });
    result.visibleFDI = [...visible].sort((a, b) => a-b);
    result.outOfFrame = Object.entries(result.projected).filter(([,b]) => b.clipped).map(([fdi,b]) => ({ fdi, clipped: b.clipped, vertices: b.vertices }));
    return result;
  }, project);
}

async function pixels(page, path) {
  const png = await page.screenshot({ path, scale: 'css', animations: 'disabled' });
  const box = await page.locator(canvas).boundingBox();
  assert.ok(box && box.width>0 && box.height>0,'The WebGL viewport must have a layout box');
  // Measure only the actual 3D viewport. Page typography, sidebar navigation,
  // badges and footer must not make a blank rendering pass this check.
  return page.evaluate(async ({base64,box}) => {
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const image = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = image.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const w = image.width, h = image.height, data = ctx.getImageData(0, 0, w, h).data;
    let body = 0, total = 0;
    const left=Math.max(0,Math.ceil(box.x+box.width*.08)), right=Math.min(w,box.x+box.width*.92);
    const top=Math.max(0,Math.ceil(box.y+box.height*.08)), bottom=Math.min(h,box.y+box.height*.86);
    for (let y=top; y<bottom; y+=2) for (let x=left; x<right; x+=2) {
      const i = 4*(y*w + x); total++;
      if (Math.min(data[i], data[i+1], data[i+2]) < 242) body++;
    }
    return { width:w, height:h, canvasRect:box, nonwhiteCentralFraction:total?body/total:0 };
  }, {base64:png.toString('base64'),box});
}

async function fourViews(page, label) {
  let heroMatrix;
  for (const [name, progress, expected] of shots) {
    await scroll(page, progress);
    const pose = await snapshot(page, true);
    const shot = await pixels(page, output + '/' + label + '-' + name + '.png');
    check(label + ' ' + name + ' single canvas', pose.counts.canvases === 1);
    check(label + ' ' + name + ' shaders runnable', pose.shaderErrors === 0, pose.shaderErrors);
    check(label + ' ' + name + ' rendered body', shot.nonwhiteCentralFraction > .01, shot);
    check(label + ' ' + name + ' visible FDI', String(pose.visibleFDI) === String(expected), pose.visibleFDI);
    check(label + ' ' + name + ' actual vertices inside frame', pose.outOfFrame.length === 0, pose.outOfFrame);
    check(label + ' ' + name + ' no unrelated meshes', pose.auxiliaryMeshes.every((n) => /shadow/i.test(n)), pose.auxiliaryMeshes);
    if (name === 'full') {
      check(label + ' exactly one mesh per FDI', String([...pose.toothMeshes].sort((a,b)=>a-b)) === String(allFDI), pose.toothMeshes);
      check(label + ' final surface reveal fully opaque', pose.reported.length === 28 && pose.reported.every(t=>t.reveal === 1));
    }
    const matrix = pose.reported.find((t) => t.fdi === 36)?.matrix;
    if (!heroMatrix) heroMatrix = matrix;
    check(label + ' ' + name + ' FDI36 seated identically', matrix?.length === 16 && JSON.stringify(matrix) === JSON.stringify(heroMatrix), matrix);
    report.views.push({ name: label + '-' + name, ...shot, ...pose });
  }
  const layout=await page.evaluate(()=>{
    const rect=q=>{const b=document.querySelector(q).getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
    const view=rect('#journey-canvas'), panel=rect('.journey-copy'), tools=rect('#journey-inspect');
    const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    return {view,panel,tools,copyOverlap:overlap(view,panel),toolbarOverlap:overlap(view,tools),width:innerWidth,height:innerHeight};
  });
  check(label+' viewer is on screen and not obscured by copy or toolbar',layout.view.width>0 && layout.view.height>0
    && layout.view.left>=-1 && layout.view.top>=-1 && layout.view.right<=layout.width+1 && layout.view.bottom<=layout.height+1
    &&layout.copyOverlap<1 && layout.toolbarOverlap<1,layout);
  (report.layout??={})[label]=layout;
}

// Detect discontinuities that static keyframes cannot show. Freeze the camera
// and lights so a visible colour jump is attributable to the introduction pass,
// not motion of the tooth silhouette or its specular reflection.
async function verifyRevealContinuity(page) {
  report.revealContinuity = await page.evaluate(() => {
    const app = window.__dentalExperience, gl = app.renderer.getContext();
    const originalProgress = app.report().progress;
    const subjects = new Map();
    app.scene.traverse(m => { if (m.isMesh && m.userData.fdi !== 36 && m.userData.fdi) subjects.set(m.userData.fdi, m); });
    const cases = [
      { kind:'boundary', name:'neighbors appear', p:.12, before:.119999, after:.1208 },
      { kind:'boundary', name:'opposing upper arch appears', p:.66, before:.65999, after:.6608 },
      { kind:'boundary', name:'neighbors become opaque', p:.33, before:.32999, after:.33001 },
      { kind:'boundary', name:'mandibular arch becomes opaque', p:.61, before:.60999, after:.61001 },
      { kind:'boundary', name:'maxillary arch becomes opaque', p:.85, before:.84999, after:.85001 },
    ];
    try {
      // Find each newly visible FDI, including staggered/paired arrivals. The
      // old .995 binary caster threshold is kept as a shadow regression probe.
      for (const [fdi, mesh] of subjects) for (const kind of ['arrival', 'shadow']) {
        let lo=0, hi=1;
        for (let i=0; i<30; i++) {
          const mid=(lo+hi)/2;
          app.arch.setProgress(mid);
          if (kind === 'arrival' ? mesh.visible : mesh.material.opacity > .995) hi=mid;
          else lo=mid;
        }
        const same = cases.find(c => c.kind === kind && Math.abs(c.p-hi) < 1e-6);
        if (same) same.fdi.push(fdi);
        else cases.push({kind,fdi:[fdi],p:hi,before:hi-1e-7,after:hi+1e-7});
      }
      for (const test of cases) {
        app.setProgress(test.p);
        const w=gl.drawingBufferWidth, h=gl.drawingBufferHeight;
        const renderReadback = (p) => {
          app.arch.setProgress(p);
          app.renderer.shadowMap.needsUpdate = true;
          app.renderer.render(app.scene,app.rig.camera);
          const rgba = new Uint8Array(w*h*4);
          gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
          return rgba;
        };
        const first=renderReadback(test.before), next=renderReadback(test.after);
        let above16=0, peak=0, sumSquared=0;
        for (let i=0; i<first.length; i+=4) {
          const delta=Math.max(Math.abs(first[i]-next[i]),Math.abs(first[i+1]-next[i+1]),Math.abs(first[i+2]-next[i+2]));
          if (delta>16) above16++;
          peak=Math.max(peak,delta); sumSquared+=delta*delta;
        }
        test.peak=peak;
        test.percentPixelsDeltaAbove16=100*above16/(w*h);
        test.rms=Math.sqrt(sumSquared/(w*h));
      }
    } finally { app.setProgress(originalProgress); }
    return { subjectCount:subjects.size, scope:'Fixed camera/lights, actual RGBA8 frame readback. The max per-pixel channel difference is measured across each tiny reveal step.', cases };
  });
  const {cases,subjectCount}=report.revealContinuity;
  for (const kind of ['boundary','arrival','shadow']) {
    const group=cases.filter(c=>c.kind===kind);
    const bad=group.filter(c=>c.percentPixelsDeltaAbove16>.01 || c.rms>.5 || c.peak>32);
    const complete=kind==='boundary' ? group.length===5 : subjectCount===27 && new Set(group.flatMap(c=>c.fdi)).size===27;
    check('Smooth fixed-camera '+kind+' transitions',complete && bad.length===0,bad);
  }
}

async function benchmark(page, label) {
  await scroll(page, .1);
  const data = await page.evaluate(async () => {
    const app = window.__dentalExperience, renderer = app.renderer, section = document.querySelector('#dental-journey').getBoundingClientRect();
    const base = window.scrollY + section.top, travel = section.height - document.querySelector('#journey-stage').getBoundingClientRect().height;
    const first = renderer.info.render.frame, samples = [];
    let previous;
    for (let i=0; i<=100; i++) {
      const now = await new Promise(requestAnimationFrame);
      if (i > 10) samples.push(now-previous);
      window.scrollTo({ top: base + (.1 + .8*i/100)*travel, behavior: 'instant' });
      previous = now;
    }
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    samples.sort((a,b)=>a-b);
    return { samples: samples.length, renderedFrames: renderer.info.render.frame-first,
      medianFrameIntervalMs: samples[Math.floor(samples.length*.5)], p95FrameIntervalMs: samples[Math.floor(samples.length*.95)],
      meanFrameIntervalMs: samples.reduce((a,b)=>a+b,0)/samples.length,
      gpu: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      scope: 'rAF intervals during native scroll on the test desktop, not GPU timing or physical phone FPS.' };
  });
  check(label + ' benchmark rendered the journey', data.renderedFrames >= 40, data);
  report.benchmarks.push({ label, ...data });
}
async function touchSwipe(context, page, dx, dy) {
  const cdp=await context.newCDPSession(page), box=await page.locator(canvas).boundingBox();
  const x=box.x+box.width*.40, y=box.y+box.height*.36;
  dx=Math.sign(dx)*Math.min(Math.abs(dx),box.width*.35); dy=Math.sign(dy)*Math.min(Math.abs(dy),box.height*.45);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x,y,id:0 }] });
  for(let i=1;i<=12;i++) {
    await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:x+dx*i/12,y:y+dy*i/12,id:0 }] });
    await page.waitForTimeout(18);
  }
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] }); await cdp.detach();
}
async function explore(context, page, mobile) {
  await scroll(page, .96);
  const button = page.locator('#journey-explore'); await button.click(); await settle(page);
  check('Explicit final inspection ' + (mobile?'touch':'mouse'), await button.getAttribute('aria-pressed') === 'true');
  const before = (await snapshot(page)).camera;
  if (mobile) await touchSwipe(context, page, 95, 0);
  else {
    const box=await page.locator(canvas).boundingBox(), x=box.x+box.width*.36, y=box.y+box.height*.48;
    await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+box.width*.22,y,{steps:12}); await page.mouse.up();
  }
  await page.waitForTimeout(250);
  const after = (await snapshot(page)).camera;
  check('Horizontal inspection rotates ' + (mobile?'touch':'mouse'), Math.hypot(...after.map((v,i)=>v-before[i])) > .005, {before,after});
  if(mobile) {
    const box=await page.locator(canvas).boundingBox(),cx=box.x+box.width*.5,cy=box.y+box.height*.5;
    const cdp=await context.newCDPSession(page),base=Math.min(25,box.width*.08),move=Math.min(35,box.width*.10);
    const points=delta=>[{x:cx-base-delta,y:cy,id:0},{x:cx+base+delta,y:cy,id:1}];
    const first=(await snapshot(page)).distance;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(0)});
    for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(i*move/8)});await page.waitForTimeout(20);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await page.waitForTimeout(160);
    check('Two-finger inspection pinch zooms the model, not the browser',(await snapshot(page)).distance<first-.001 && await page.evaluate(()=>Math.abs((visualViewport?.scale??1)-1)<.001));
  }
  const y = await page.evaluate(()=>window.scrollY);
  if (mobile) await touchSwipe(context,page,0,230);
  else await page.mouse.wheel(0,-430);
  await page.waitForFunction((previous)=>window.scrollY < previous-10, y);
  check('Vertical ' + (mobile?'touch':'wheel') + ' scroll wins over inspect', await page.evaluate(()=>window.scrollY) < y-10);
}

async function verifyControls(page) {
  const steps=page.locator('.journey-step'), orbit=page.locator('#journey-explore'), reset=page.locator('#journey-reset');
  const zin=page.locator('#journey-zoom-in'), zout=page.locator('#journey-zoom-out'), viewer=page.locator(canvas);
  check('Four direct step controls',await steps.count()===4);
  for(const [i,[name,keyframe,expected]] of shots.entries()) {
    const p=i===3?.94:keyframe;
    const step=steps.nth(i);
    check('Step has intended destination: '+name,Number(await step.getAttribute('data-progress'))===p);
    await step.click(); await atProgress(page,p);
    const initial=await snapshot(page);
    check('Step selects real FDI group: '+name,String(initial.visibleFDI)===String(expected));
    check('Current step announced: '+name,await step.getAttribute('aria-current')==='step');
    check('Inspection tools enabled: '+name,await orbit.isEnabled() && await reset.isEnabled() && await zin.isEnabled() && await zout.isEnabled());
    if(await orbit.getAttribute('aria-pressed')!=='true')await orbit.click();
    check('Orbit available before and between groups: '+name,await orbit.getAttribute('aria-pressed')==='true');
    await zin.click(); await settle(page);
    const close=await snapshot(page);
    check('Zoom in button changes distance: '+name,close.distance<initial.distance-.0001,{initial:initial.distance,close:close.distance});
    await zout.click(); await settle(page);
    check('Zoom out button changes distance: '+name,(await snapshot(page)).distance>close.distance+.0001);
    await reset.click(); await settle(page);
    const restored=await snapshot(page);
    check('View reset restores active stage: '+name,
      Math.hypot(...restored.camera.map((x,j)=>x-initial.camera[j]))<.002 && Math.abs(restored.progress-p)<.002,restored.camera);
    if(await orbit.getAttribute('aria-pressed')==='true')await orbit.click();
  }
  await page.locator('#journey-home').click(); await atProgress(page,0);
  await page.locator('#journey-show-all').click(); await atProgress(page,.94);
  check('Show all shortcut opens all 28 teeth',String((await snapshot(page)).visibleFDI)===String(allFDI));
  await page.locator('#journey-home').click(); await atProgress(page,0);
  await page.locator('#journey-next').click(); await atProgress(page,.34);
  await page.locator('#journey-next').click(); await atProgress(page,.64);
  await page.locator('#journey-previous').click(); await atProgress(page,.34);
  check('Home, next, previous navigate the page',await steps.nth(1).getAttribute('aria-current')==='step');
  const before=await snapshot(page); await viewer.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(220);
  const rotated=await snapshot(page);
  check('Keyboard arrow enables orbit and rotates',await orbit.getAttribute('aria-pressed')==='true' && Math.hypot(...rotated.camera.map((x,j)=>x-before.camera[j]))>.002);
  await page.keyboard.press('Shift+Equal'); await settle(page); const close=(await snapshot(page)).distance;
  await page.keyboard.press('-'); await settle(page); const far=(await snapshot(page)).distance;
  check('Keyboard +/- zoom',close<rotated.distance-.0001 && far>close+.0001,{close,far});
  await page.keyboard.press('Home'); await settle(page); const homed=await snapshot(page);
  check('Canvas Home restores current camera without leaving the story step',Math.hypot(...homed.camera.map((x,j)=>x-before.camera[j]))<.002 && Math.abs(homed.progress-.34)<.002);
  await page.keyboard.press('Escape'); await settle(page);
  check('Escape leaves inspection',await orbit.getAttribute('aria-pressed')==='false');
  const help=page.locator('#journey-help'), dialog=page.locator('#journey-help-dialog');
  await help.click(); await dialog.waitFor({state:'visible'});
  check('Help opens an accessible native modal',await dialog.evaluate(d=>d.open && d.matches(':modal') && d.textContent.trim().length>20));
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
  check('Escape closes help',!await dialog.evaluate(d=>d.open));
  await help.click();await page.locator('#journey-help-done').click();await dialog.waitFor({state:'hidden'});
  check('Help confirmation returns to the page',!await dialog.evaluate(d=>d.open));
}

async function verifyAssets(page,label) {
  const result=await page.evaluate(async()=>{
    const link=document.querySelector('a.journey-credit[href]');
    const credit=link?await fetch(link.href):null;
    const text=credit?await credit.text():'';
    const urls=performance.getEntriesByType('resource').map(e=>e.name).filter(s=>/\.(glb|hdr)(?:\?|$)|\/dentition-assets\/manifest\.json(?:\?|$)/.test(s));
    const heroURL=urls.find(s=>/\/hero-36[^/]*\.glb/.test(s));
    const provenance=heroURL?await (await fetch(new URL('hero-36-provenance.json',heroURL))).json():null;
    const teeth=window.__dentalExperience.report().teeth;
    const allCredit=link?await fetch(new URL('credits.txt',link.href)):null;
    const allText=allCredit?await allCredit.text():'';
    return {urls,heroGeometry:provenance?.geometry,heroFDI:teeth.find(t=>t.fdi===36)?.source,
      heroTriangles:teeth.find(t=>t.fdi===36)?.triangles,pairedSources:[16,26,36,46].map(fdi=>teeth.find(t=>t.fdi===fdi)?.source),
      creditURL:link?.href,status:credit?.status,type:credit?.headers.get('content-type'),dundee:text.includes('University of Dundee'),license:text.includes('creativecommons.org/licenses/by/4.0/'),
      allCredits:allCredit?.status===200 && allCredit.headers.get('content-type')?.includes('text/plain') && allText.includes('University of Dundee') && allText.includes('creativecommons.org/licenses/by/4.0/')};
  });
  const dir=site.pathname.endsWith('/')?site.pathname:site.pathname+'/';
  check(label+' loads lower 36 first and defers the atlas',result.urls.findIndex(s=>/\/hero-36[^/]*\.glb/.test(s))>=0
    &&result.urls.findIndex(s=>/\/dentition(?:-mobile)?\.glb/.test(s))>result.urls.findIndex(s=>/\/hero-36[^/]*\.glb/.test(s)),result.urls);
  check(label+' keeps runtime assets within the deployed site',result.urls.every(s=>new URL(s).origin===site.origin && new URL(s).pathname.startsWith(dir)),result.urls);
  check(label+' displays the registered two-root lower first molar',result.heroFDI===36 && result.heroGeometry?.physicalRootBranches===2 && result.heroGeometry?.triangles===result.heroTriangles,result.heroGeometry);
  check(label+' keeps distinct upper/lower first molar sources',String(result.pairedSources)==='26,26,36,36',result.pairedSources);
  check(label+' credit links to the real plain-text attribution',result.status===200 && result.type?.includes('text/plain') && result.dundee && result.license && result.allCredits && new URL(result.creditURL).pathname===dir+'dentition-assets/hero-36-credits.txt',result);
  (report.assetResolution??={})[label]=result;
}

async function scenario(name, fn) {
  process.stdout.write('[experience] ' + name + '\n');
  try { await fn(); } catch (error) { report.issues.push({ name, detail: error.stack }); }
}
async function gateAsset(page, pattern=atlas) {
  let release, requested = false;
  const gate = new Promise((resolve) => { release=resolve; });
  await page.route(pattern, async (route) => {
    requested = true; await gate;
    try { await route.continue(); } catch { /* Disposal can cancel an intercepted request. */ }
  });
  return { release, requested:()=>requested };
}
try {
  await scenario('desktop / reverse / wheel / idle', async () => {
    const {context,page}=await open();
    try {
      await goto(page); await heroReady(page); await scroll(page,.2,false); await allReady(page);
      await fourViews(page,'desktop');
      await verifyAssets(page,'main');
      const final=(await snapshot(page)).camera;
      await verifyRevealContinuity(page);
      report.transitionViews=[];
      for (const [name,p] of [['neighbors',.22],['arch',.49],['opposing-arch',.75]]) {
        await scroll(page,p);
        const state=await snapshot(page);
        const image=await pixels(page,output+'/transition-'+name+'.png');
        report.transitionViews.push({name,progress:state.progress,partlyRevealedFDI:state.reported.filter(t=>t.reveal>0 && t.reveal<1).map(t=>t.fdi),...image});
      }
      for(const p of [0,.91,.18,.98,.02,.9]) await scroll(page,p);
      const same=(await snapshot(page)).camera;
      check('Fast native jumps are reversible',Math.hypot(...same.map((v,i)=>v-final[i]))<1e-7,{final,same});
      await page.waitForTimeout(500); const idle=(await snapshot(page)).frame; await page.waitForTimeout(650);
      check('Idle stops rendering',(await snapshot(page)).frame===idle);
      await verifyControls(page);
      await benchmark(page,'desktop-1280x900');
      await explore(context,page,false);
      const disposed=await page.evaluate(()=>{const app=window.__dentalExperience,before={...app.renderer.info.memory};app.dispose();app.dispose();return {before,after:{...app.renderer.info.memory},data:{...document.querySelector('canvas').dataset}};});
      report.dispose=disposed;check('Idempotent dispose frees geometry',disposed.after.geometries===0 && disposed.data.disposed==='true',disposed);
      check('Dispose frees asset textures and shadow targets',disposed.after.textures<=3,disposed);
    } finally {await context.close();}
  });
  await scenario('alternate entry / preserved viewers',async()=>{
    for(const [entry,selector] of [['experience/?qa=1',canvas],['legacy/','#tooth-canvas'],['prototype/?qa=1','#prototype-canvas']]) {
      const {context,page}=await open();
      try {
        await goto(page,entry);
        await page.waitForSelector(selector+'[data-ready="true"]',{timeout:45000});
        if(selector===canvas) {
          await allReady(page); await scroll(page,0);
          check('Experience alias starts on FDI36',String((await snapshot(page)).visibleFDI)==='36');
          await scroll(page,.9); check('Experience alias reaches 28',String((await snapshot(page)).visibleFDI)===String(allFDI));
          await verifyAssets(page,'experience alias');
        } else {
          const data=await page.locator(selector).evaluate(c=>({...c.dataset}));
          check('Preserved viewer initializes: '+entry,data.ready==='true' && (data.shaderErrors===undefined || data.shaderErrors==='0'),data);
          if(entry==='legacy/')check('Legacy page still uses its original 388032-triangle model',Number(data.assetTriangles)===388032,data);
          else check('Approved prototype still uses its single surface',Number(data.modelMeshes)===1 && data.opacity==='1',data);
        }
      } finally {await context.close();}
    }
  });
  await scenario('touch / portrait / landscape',async()=>{
    const {context,page}=await open({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    try {
      await goto(page);await heroReady(page);await scroll(page,.2,false);await allReady(page);await fourViews(page,'mobile');
      check('No horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
      await benchmark(page,'mobile-emulation-390x844-dpr2');await explore(context,page,true);
      await page.setViewportSize({width:844,height:390});await fourViews(page,'landscape');
      await page.setViewportSize({width:320,height:568});await fourViews(page,'small-phone');
    } finally{await context.close();}
  });
  await scenario('reduced motion',async()=>{
    const {context,page}=await open({reducedMotion:'reduce'});
    try {await goto(page);await heroReady(page);await scroll(page,.25,false);await allReady(page);
      const seen=new Set();for(const p of [0,.06,.12,.26,.33,.41,.57,.63,.71,.81,.9,1,.63,.06]){await scroll(page,p);seen.add((await snapshot(page)).camera.map(v=>v.toFixed(5)).join(','));}
      check('Four reversible reduced-motion still compositions',seen.size===4,[...seen]);report.reducedMotionViews=seen.size;
    } finally{await context.close();}
  });
  await scenario('slow atlas / hero is usable first',async()=>{
    const {context,page}=await open({},true),hold=await gateAsset(page),holdHero=await gateAsset(page,'**/hero-36*.glb*');
    try{await goto(page);await page.waitForFunction(()=>window.__dentalExperience && document.querySelector('#journey-zoom-in'));
      check('Tools present but disabled during hero loading',await page.locator('#journey-zoom-in').isDisabled() && await page.locator('#journey-zoom-out').isDisabled() && await page.locator('#journey-reset').isDisabled());
      holdHero.release();await heroReady(page);await settle(page);const first=await pixels(page,output+'/slow-atlas-hero.png');
      check('Hero renders while atlas blocked',first.nonwhiteCentralFraction>.01 && await page.locator(canvas).getAttribute('data-assets-ready')!=='true',first);
      const start=await snapshot(page);
      await page.locator('#journey-zoom-in').click();await settle(page);
      check('FDI36 is usable before the rest of the dentition loads',String(start.visibleFDI)==='36' && (await snapshot(page)).distance<start.distance);
      await page.locator('#journey-reset').click();
      await scroll(page,.93,false);await page.waitForTimeout(200);const waiting=await pixels(page,output+'/slow-atlas-scroll.png');
      check('Jump during delayed atlas leaves a visible body',hold.requested()&&waiting.nonwhiteCentralFraction>.01,waiting);
      hold.release();await allReady(page);await settle(page);const finished=await snapshot(page);
      check('Late atlas resumes requested final pose',finished.visibleFDI.length===28,finished.visibleFDI);report.slowAtlas={first,waiting};
    }finally{hold.release();holdHero.release();await context.close();}
  });
  await scenario('background prefetch preserves manual hero inspection',async()=>{
    const {context,page}=await open({},true),hold=await gateAsset(page);
    try {
      await goto(page); await heroReady(page); await settle(page);
      const original=await snapshot(page);
      await page.locator('#journey-zoom-in').click(); await page.locator('#journey-zoom-in').click();
      await page.locator(canvas).focus(); await page.keyboard.press('ArrowRight'); await settle(page);
      const before=await snapshot(page);
      check('Hero can be rotated and zoomed while the atlas request is pending',
        before.exploring && before.distance<original.distance && String(before.visibleFDI)==='36' && hold.requested(),before);
      hold.release(); await allReady(page); await settle(page);
      const after=await snapshot(page);
      const samePose=(a,b)=>Math.hypot(...a.camera.map((x,i)=>x-b.camera[i]))<1e-6 &&
        Math.hypot(...a.quaternion.map((x,i)=>x-b.quaternion[i]))<1e-6;
      check('Completing the atlas does not replace a manually inspected camera',
        samePose(before,after) && after.exploring && String(after.visibleFDI)==='36' && after.toothMeshes.length===28,{before:before.camera,after:after.camera});
      // Simulates the current-position refresh used after a tab becomes visible.
      await page.evaluate(()=>window.__dentalExperience.setProgress(window.__dentalExperience.report().progress));
      await settle(page); const refreshed=await snapshot(page);
      check('Refreshing unchanged scroll progress preserves inspection',samePose(before,refreshed) && refreshed.exploring);
      await scroll(page,.34);
      const continued=await snapshot(page);
      check('Changing native scroll still leaves inspection and reaches neighbors',
        !continued.exploring && String(continued.visibleFDI)==='35,36,37',continued.visibleFDI);
      report.prefetchInspection={before:before.camera,after:after.camera,afterRefresh:refreshed.camera,visibleOnCompletion:after.visibleFDI,visibleAfterScroll:continued.visibleFDI};
    } finally {hold.release();await context.close();}
  });
  await scenario('selecting an already reached scroll position leaves a delayed inspection',async()=>{
    const {context,page}=await open({},true),hold=await gateAsset(page);
    try {
      await goto(page);await heroReady(page);await scroll(page,.94);
      await page.locator('#journey-zoom-in').click();await settle(page);
      hold.release();await allReady(page);await settle(page);
      const held=await snapshot(page), oldScroll=await page.evaluate(()=>scrollY);
      await page.locator('.journey-step').nth(3).click();await atProgress(page,.94);
      const released=await snapshot(page), newScroll=await page.evaluate(()=>scrollY);
      check('Same-position navigation returns from held FDI36 to all 28 without needing another scroll event',
        held.exploring && String(held.visibleFDI)==='36' && !released.exploring && String(released.visibleFDI)===String(allFDI)
        && Math.abs(oldScroll-newScroll)<=1,{held:held.visibleFDI,released:released.visibleFDI,oldScroll,newScroll});
    } finally {hold.release();await context.close();}
  });
  await scenario('fallback: WebGL and missing hero',async()=>{
    for(const kind of ['WebGL','hero']){
      const {context,page}=await open({},true);
      try{
        if(kind==='WebGL')await page.addInitScript(()=>{const previous=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return String(kind).startsWith('webgl')?null:previous.call(this,kind,...args);};});
        else await page.route('**/hero-36*.glb*',(r)=>r.fulfill({status:404,body:'injected missing hero'}));
        await goto(page);await page.locator('#journey-retry').waitFor({state:'visible'});const message=await page.locator('#journey-message').innerText();
        check(kind+' fallback has a readable message and retry',message.trim().length>10,message);
      }finally{await context.close();}
    }
  });
  await scenario('fallback: atlas error retains hero',async()=>{
    const {context,page}=await open({},true);try{await page.route(atlas,(r)=>r.fulfill({status:404,body:'injected missing families'}));await goto(page);await heroReady(page);await scroll(page,.9,false);
      await page.locator('#journey-retry').waitFor({state:'visible'});const shot=await pixels(page,output+'/missing-atlas.png');report.atlasError={message:await page.locator('#journey-message').innerText(),...shot};
      check('Atlas failure retains tooth and visible retry',shot.nonwhiteCentralFraction>.01,report.atlasError);
    }finally{await context.close();}
  });
  await scenario('dispose while atlas pending',async()=>{
    const {context,page}=await open({},true),hold=await gateAsset(page);try{await goto(page);await heroReady(page);await scroll(page,.4,false);await page.waitForTimeout(150);assert.ok(hold.requested());
      await page.evaluate(()=>window.__dentalExperience.dispose());hold.release();await page.waitForTimeout(400);
      const data=await page.locator(canvas).evaluate(c=>({...c.dataset}));check('Late completion does not resurrect scene',data.disposed==='true'&&data.ready!=='true',data);report.aborted=data;
    }finally{hold.release();await context.close();}
  });
  check('No unexpected browser errors',report.errors.length===0,report.errors);
  check('No unexpected failed requests or 404s',report.failures.length===0,report.failures);
} finally {
  await browser.close();report.passed=report.issues.length===0;
  await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,views:report.views.map(v=>v.name),checks:report.checks.length,issues:report.issues,benchmarks:report.benchmarks},null,2));
  if(!report.passed)process.exitCode=1;
}
