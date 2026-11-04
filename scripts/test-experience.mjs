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
const url = new URL('experience/?qa=1', origin.href.endsWith('/') ? origin : new URL(origin.href + '/')).href;
const output = resolve(process.env.EXPERIENCE_REVIEW_DIR || 'docs/experience-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const canvas = '#journey-canvas', atlas = '**/dentition-assets/dentition*.glb*';
const allFDI = [1, 2, 3, 4].flatMap((q) => Array.from({ length: 7 }, (_, i) => 10*q + i + 1));
const shots = [['hero', 0, [26]], ['neighbors', .34, [25, 26, 27]], ['upper', .64, allFDI.slice(0, 14)], ['full', .9, allFDI]];
const report = { date: new Date().toISOString(), scope: 'Own headless Chrome on localhost. Touch and mobile dimensions are emulated on this desktop GPU.', checks: [], issues: [], errors: [], warnings: [], failures: [], views: [], benchmarks: [] };
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
  if (!injected) {
    page.on('pageerror', (e) => report.errors.push(e.message));
    page.on('console', (entry) => {
      if (entry.type() === 'error') report.errors.push(entry.text());
      if (entry.type() === 'warning' && !report.warnings.includes(entry.text())) report.warnings.push(entry.text());
    });
    page.on('requestfailed', (request) => report.failures.push(request.url() + ': ' + request.failure()?.errorText));
    page.on('response', (response) => { if (response.status() >= 400) report.failures.push(response.status() + ': ' + response.url()); });
  }
  return { context, page };
}
const goto = (p) => p.goto(url, { waitUntil: 'domcontentloaded' });
const heroReady = (p) => p.waitForSelector(canvas + '[data-ready="true"]', { timeout: 45000 });
const allReady = (p) => p.waitForSelector(canvas + '[data-assets-ready="true"]', { timeout: 45000 });
const settle = (p) => p.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));

// Use only native scrolling for poses, including skips and reverse journeys.
async function scroll(page, p, wait = true) {
  await page.evaluate((progress) => {
    const section = document.querySelector('#dental-journey').getBoundingClientRect();
    const height = document.querySelector('#journey-stage').getBoundingClientRect().height;
    window.scrollTo({ top: window.scrollY + section.top + progress * (section.height - height), behavior: 'instant' });
  }, p);
  if (wait) {
    await page.waitForFunction((p) => {
      const app = window.__dentalExperience, data = document.querySelector('canvas')?.dataset;
      const actual = Number(data?.progress ?? app?.report()?.progress);
      return Number.isFinite(actual) && Math.abs(actual - p) < .002;
    }, p);
    await settle(page);
  }
}

async function snapshot(page, project = false) {
  return page.evaluate((project) => {
    const app = window.__dentalExperience, c = document.querySelector('#journey-canvas');
    const data = app.report(), teeth = data.teeth ?? [];
    const camera = app.rig.camera, result = { dataset: { ...c.dataset }, progress: data.progress,
      sceneProgress: data.sceneProgress, stage: data.stage, shaderErrors: data.shaderErrors, camera: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
      frame: app.renderer.info.render.frame, gpu: { ...app.renderer.info.memory }, counts: { canvases: document.querySelectorAll('canvas').length },
      reported: teeth.map((t) => ({ fdi: Number(t.fdi), reveal: Number(t.reveal), matrix: t.worldMatrix ?? t.matrixWorld })),
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
  // Read the composited screenshot, not a cleared WebGL drawing buffer. Ignore
  // edge UI and footer. The measure detects blank white output, not aesthetics.
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const image = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = image.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const w = image.width, h = image.height, data = ctx.getImageData(0, 0, w, h).data;
    let body = 0, total = 0;
    for (let y = Math.ceil(.06*h); y < .88*h; y+=2) for (let x = Math.ceil(.04*w); x < .96*w; x+=2) {
      const i = 4*(y*w + x); total++;
      if (Math.min(data[i], data[i+1], data[i+2]) < 242) body++;
    }
    return { width: w, height: h, nonwhiteCentralFraction: body / total };
  }, png.toString('base64'));
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
    const matrix = pose.reported.find((t) => t.fdi === 26)?.matrix;
    if (!heroMatrix) heroMatrix = matrix;
    check(label + ' ' + name + ' FDI26 seated identically', matrix?.length === 16 && JSON.stringify(matrix) === JSON.stringify(heroMatrix), matrix);
    report.views.push({ name: label + '-' + name, ...shot, ...pose });
  }
}

// Detect discontinuities that static keyframes cannot show. Freeze the camera
// and lights so a visible colour jump is attributable to the introduction pass,
// not motion of the tooth silhouette or its specular reflection.
async function verifyRevealContinuity(page) {
  report.revealContinuity = await page.evaluate(() => {
    const app = window.__dentalExperience, gl = app.renderer.getContext();
    const originalProgress = app.report().progress;
    const subjects = new Map();
    app.scene.traverse(m => { if (m.isMesh && m.userData.fdi !== 26 && m.userData.fdi) subjects.set(m.userData.fdi, m); });
    const cases = [
      { kind:'boundary', name:'neighbors appear', p:.12, before:.119999, after:.1208 },
      { kind:'boundary', name:'lower teeth appear', p:.66, before:.65999, after:.6608 },
      { kind:'boundary', name:'neighbors become opaque', p:.33, before:.32999, after:.33001 },
      { kind:'boundary', name:'upper teeth become opaque', p:.61, before:.60999, after:.61001 },
      { kind:'boundary', name:'lower teeth become opaque', p:.85, before:.84999, after:.85001 },
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
  const cdp = await context.newCDPSession(page), size = page.viewportSize();
  const x = size.width*.40, y = size.height*.38;
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
  else { await page.mouse.move(560,380); await page.mouse.down(); await page.mouse.move(730,380,{steps:12}); await page.mouse.up(); }
  await page.waitForTimeout(250);
  const after = (await snapshot(page)).camera;
  check('Horizontal inspection rotates ' + (mobile?'touch':'mouse'), Math.hypot(...after.map((v,i)=>v-before[i])) > .005, {before,after});
  const y = await page.evaluate(()=>window.scrollY);
  if (mobile) await touchSwipe(context,page,0,230);
  else await page.mouse.wheel(0,-430);
  await page.waitForFunction((previous)=>window.scrollY < previous-10, y);
  check('Vertical ' + (mobile?'touch':'wheel') + ' scroll wins over inspect', await page.evaluate(()=>window.scrollY) < y-10);
}

async function scenario(name, fn) {
  process.stdout.write('[experience] ' + name + '\n');
  try { await fn(); } catch (error) { report.issues.push({ name, detail: error.stack }); }
}
async function gateAtlas(page) {
  let release, requested = false;
  const gate = new Promise((resolve) => { release=resolve; });
  await page.route(atlas, async (route) => {
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
      const final=(await snapshot(page)).camera;
      await verifyRevealContinuity(page);
      report.transitionViews=[];
      for (const [name,p] of [['neighbors',.22],['upper',.49],['lower',.75]]) {
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
      await benchmark(page,'desktop-1280x900');
      await explore(context,page,false);
      const disposed=await page.evaluate(()=>{const app=window.__dentalExperience,before={...app.renderer.info.memory};app.dispose();app.dispose();return {before,after:{...app.renderer.info.memory},data:{...document.querySelector('canvas').dataset}};});
      report.dispose=disposed;check('Idempotent dispose frees geometry',disposed.after.geometries===0 && disposed.data.disposed==='true',disposed);
    } finally {await context.close();}
  });
  await scenario('touch / portrait / landscape',async()=>{
    const {context,page}=await open({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    try {
      await goto(page);await heroReady(page);await scroll(page,.2,false);await allReady(page);await fourViews(page,'mobile');
      check('No horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
      await benchmark(page,'mobile-emulation-390x844-dpr2');await explore(context,page,true);
      await page.setViewportSize({width:844,height:390});await fourViews(page,'landscape');
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
    const {context,page}=await open({},true),hold=await gateAtlas(page);
    try{await goto(page);await heroReady(page);await settle(page);const first=await pixels(page,output+'/slow-atlas-hero.png');
      check('Hero renders while atlas blocked',first.nonwhiteCentralFraction>.01 && await page.locator(canvas).getAttribute('data-assets-ready')!=='true',first);
      await scroll(page,.93,false);await page.waitForTimeout(200);const waiting=await pixels(page,output+'/slow-atlas-scroll.png');
      check('Jump during delayed atlas leaves a visible body',hold.requested()&&waiting.nonwhiteCentralFraction>.01,waiting);
      hold.release();await allReady(page);await settle(page);const finished=await snapshot(page);
      check('Late atlas resumes requested final pose',finished.visibleFDI.length===28,finished.visibleFDI);report.slowAtlas={first,waiting};
    }finally{hold.release();await context.close();}
  });
  await scenario('fallback: WebGL and missing hero',async()=>{
    for(const kind of ['WebGL','hero']){
      const {context,page}=await open({},true);
      try{
        if(kind==='WebGL')await page.addInitScript(()=>{const previous=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return String(kind).startsWith('webgl')?null:previous.call(this,kind,...args);};});
        else await page.route('**/prototype-assets/molar*.glb*',(r)=>r.fulfill({status:404,body:'injected missing hero'}));
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
    const {context,page}=await open({},true),hold=await gateAtlas(page);try{await goto(page);await heroReady(page);await scroll(page,.4,false);await page.waitForTimeout(150);assert.ok(hold.requested());
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
