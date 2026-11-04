// Production WebGL QA. Launches a fresh local Chrome; no existing user profile,
// external websites, remote-debugging port, or production-site mutations.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { extname, relative, resolve, sep, isAbsolute } from 'node:path';
import { DENTAL_CHAPTERS as chapters } from '../src/experience/story-config.js';
import { cameraProbe, mouseDrag, touchDrag, nativeJump, desktopInputSequence, mobileInputSequence, projectedFootprints, opticalState, restingRaster, angular, zoomTravel } from './browser-camera-probes.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const site = new URL(process.env.DENTAL_STORY_TEST_URL || process.env.EXPERIENCE_TEST_URL || 'http://127.0.0.1:4173/');
if (!['localhost', '127.0.0.1', '[::1]'].includes(site.hostname) || !['http:', 'https:'].includes(site.protocol)) throw new Error('Use a loopback HTTP(S) preview URL.');
if (!site.pathname.endsWith('/')) site.pathname += '/';
const out = resolve(process.env.DENTAL_STORY_REVIEW_DIR || 'docs/visual-polish-review');
const perfOnly=process.env.DENTAL_STORY_BENCHMARK_ONLY==='1';
const prefixOnly=process.env.DENTAL_STORY_PREFIX_ONLY==='1';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { date: new Date().toISOString(), browser:browser.version(), site:site.href,
  scope:'Fresh local headless Chrome. Screenshots are real WebGL frames; touch and phone viewports are emulated on the desktop GPU. No soft tissue or clinical validation.',
  checks:[], issues:[], errors:[], warnings:[], failedRequests:[], views:[], navigation:[], scenarios:[] };
const closingContexts=new WeakSet();
async function closeContext(ctx){closingContexts.add(ctx);await ctx.close();}
const q = '#journey-canvas', allFDI=[1,2,3,4].flatMap(k=>Array.from({length:7},(_,i)=>k*10+i+1));
const near = (a,b,tol=1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= tol;
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const dist = (a,b) => Math.hypot(...a.map((n,i)=>n-b[i]));
const threeFrames = page => page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
const goto = (page,end='?qa=1',base=site) => page.goto(new URL(end, base).href,{waitUntil:'domcontentloaded'});
function check(name,pass,detail) {
  const passed=Boolean(pass);report.checks.push({name,passed});
  if (!passed) { report.issues.push({name,detail}); console.error('FAIL:',name,JSON.stringify(detail)?.slice(0,500)); }
}
async function scenario(name,fn) {
  console.log('QA:',name);
  try { await fn(); report.scenarios.push({name,completed:true}); }
  catch(error) { report.scenarios.push({name,completed:false});check(name+' completed',false,String(error.stack||error).slice(0,2000)); }
}
async function open(settings={},allowedOrigin=site.origin) {
  const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,serviceWorkers:'block',...settings});
  await ctx.route('**/*',r=>{
    if(new URL(r.request().url()).origin===allowedOrigin)return r.continue();
    report.failedRequests.push({external:r.request().url()});return r.abort('blockedbyclient');
  });
  const page=await ctx.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror', e=>report.errors.push(e.message));
  page.on('console',m=>{const t=m.text();if(m.type()==='error')report.errors.push(t);else if(m.type()==='warning'&&!report.warnings.includes(t))report.warnings.push(t);});
  page.on('requestfailed',r=>{
    const info={url:r.url(),reason:r.failure()?.errorText,resourceType:r.resourceType(),method:r.method(),duringContextTeardown:closingContexts.has(ctx)};
    if(info.duringContextTeardown&&info.reason==='net::ERR_ABORTED')(report.teardownAborts??=[]).push(info);
    else report.failedRequests.push(info);
  });
  page.on('response',r=>{if(r.status()>=400)report.failedRequests.push({url:r.url(),status:r.status()});});
  return {ctx,page};
}
async function ready(page) {
  await page.waitForSelector(q+'[data-ready="true"][data-assets-ready="true"]',{timeout:60000});
  await page.waitForFunction(()=>{const d=window.__dentalExperience?.report();return d?.story?.caries && d.story.plaque && d.story.brush;},null,{timeout:30000});
  await threeFrames(page);
}
async function at(page,p) {
  await page.waitForFunction(p=>Math.abs(Number(document.querySelector('#journey-canvas')?.dataset.progress)-p)<.002,p);
  await threeFrames(page);
}
async function scroll(page,p) {
  await page.evaluate(p=>{const box=document.querySelector('#dental-journey').getBoundingClientRect();const travel=box.height-document.querySelector('#journey-stage').getBoundingClientRect().height;
    window.scrollTo({top:scrollY+box.top+travel*p,behavior:'instant'});},p);
  await at(page,p);
}
async function read(page) {
  return page.evaluate(()=>{
    const app=window.__dentalExperience,d=app.report(),s=d.story,cam=app.rig.camera;
    app.scene.updateMatrixWorld(true);cam.updateMatrixWorld(true);
    const m36=app.arch.teeth.get(36).mesh,m46=app.arch.teeth.get(46).mesh;
    const geom=m36.geometry,morph=geom.morphAttributes.position?.[0],v=cam.position.clone();
    let deepest=-1,mag2=-1;
    if(morph)for(let i=0;i<morph.count;i++){const x=morph.getX(i),y=morph.getY(i),z=morph.getZ(i),l=x*x+y*y+z*z;if(l>mag2){mag2=l;deepest=i;}}
    let depthLocal=null, lesionNDC=null;
    if(deepest>=0){const base=geom.attributes.position;m36.getVertexPosition(deepest,v);depthLocal=Math.hypot(v.x-base.getX(deepest),v.y-base.getY(deepest),v.z-base.getZ(deepest));
      lesionNDC=v.applyMatrix4(m36.matrixWorld).project(cam).toArray();}
    const visible=[],meshFDIs=[],kinds={};
    app.scene.traverse(n=>{if(!n.isMesh)return;const fdi=Number(n.userData.fdi);if(!fdi){const k=n.userData.kind||n.name||'unnamed';kinds[k]=(kinds[k]||0)+1;return;}
      meshFDIs.push(fdi);for(let a=n;a;a=a.parent)if(!a.visible)return;visible.push(fdi);});
    const box=sel=>{const el=document.querySelector(sel);if(!el||el.getClientRects().length===0)return null;const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const canvas=box('#journey-canvas'),copy=box('.journey-copy'),tools=box('#journey-inspect');
    const overlap=(a,b)=>a&&b?Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)):0;
    const clippedText=[];
    const walker=document.createTreeWalker(document.querySelector('.journey-copy'),NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()){
      if(!node.textContent.trim()||!node.parentElement?.checkVisibility({visibilityProperty:true,opacityProperty:true}))continue;
      const rng=document.createRange();rng.selectNodeContents(node);
      for(const r of rng.getClientRects())if(r.width>1&&r.height>1&&(r.top < -2 || r.left < -2 || r.right>innerWidth+2 || r.bottom>innerHeight+2 || overlap(r,canvas)>2)){
        clippedText.push(node.textContent.trim().slice(0,95));break;
      }
    }
    const gl=app.renderer.getContext(), ex=gl.getExtension('WEBGL_debug_renderer_info');
    const lights=app.scene.children.filter(o=>o.isLight).map(o=>({type:o.type,position:o.position.toArray(),rotation:o.quaternion.toArray(),intensity:o.intensity,color:o.color.toArray(),
      width:o.width??null,height:o.height??null,target:o.target?.position.toArray()??null,shadowCamera:o.shadow?.camera?['left','right','top','bottom','near','far'].map(k=>o.shadow.camera[k]):null}));
    return {progress:d.progress,sceneProgress:d.sceneProgress,chapter:s.chapterId,exploring:d.exploring,mode:d.mode,view:d.view,finalView:d.finalView,closureCm:d.closureCm,shaderErrors:d.shaderErrors,canvasCount:document.querySelectorAll('canvas').length,
      visible:visible.sort((a,b)=>a-b),meshFDIs:meshFDIs.sort((a,b)=>a-b),kinds,camera:cam.position.toArray(),quaternion:cam.quaternion.toArray(),target:d.target??app.rig.target.toArray(),
      pose36:m36.matrixWorld.toArray(),geometry36:geom.uuid,geometry46:m46.geometry.uuid,depthLocal,lesionNDC,healthyMolar:{morphBuffers:m46.geometry.morphAttributes.position?.length||0,lesionAttribute:Boolean(m46.geometry.getAttribute('lesionRegion'))},
      lesion:s.lesionProgress,clean:s.cleaningProgress,deposit:s.plaqueDeposition,brushPose:s.brushPose,caries:s.caries,plaque:s.plaque,brush:s.brush,
      active:document.querySelector('.journey-step[aria-current="step"]')?.innerText,activeCount:document.querySelectorAll('.journey-step[aria-current="step"]').length,
      title:document.querySelector('#journey-title')?.innerText,description:document.querySelector('#journey-description')?.innerText,
      note:document.querySelector('#journey-note')?.innerText,instruction:document.querySelector('#journey-instruction')?.innerText,
      resultLabels:document.querySelector('#journey-result-labels')?.innerText,
      layout:{width:innerWidth,height:innerHeight,overflowX:document.documentElement.scrollWidth-innerWidth,canvas,copy,tools,clippedText,copyOverlap:overlap(canvas,copy),toolsOverlap:overlap(canvas,tools)},
      lights,gpu:gl.getParameter(ex?ex.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};
  });
}
async function saveView(page,label,p,index,expected,base) {
  await scroll(page,p);const raster=await restingRaster(page),s=await read(page);
  s.raster=raster;s.optics=await opticalState(page);
  if(/^(desktop|mobile)-(hero|caries|brush|full)$/.test(label)){
    const {matrices,...footprint}=await projectedFootprints(page);s.projectedFootprint=footprint;
  }
  const png=await page.screenshot({path:resolve(out,label+'.png'),scale:'css',animations:'disabled'});
  // Sample only the 3D viewport in the screenshot: navigation typography or
  // coloured controls outside the canvas cannot make an empty WebGL frame pass.
  const fraction=await page.evaluate(async({bytes,b})=>{const im=await createImageBitmap(new Blob([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],{type:'image/png'}));
    const o=new OffscreenCanvas(im.width,im.height),cx=o.getContext('2d');cx.drawImage(im,0,0);im.close();const a=cx.getImageData(0,0,o.width,o.height).data;
    let body=0,n=0;for(let y=Math.max(0,Math.ceil(b.top+3));y<Math.min(o.height,b.bottom-3);y+=3)for(let x=Math.max(0,Math.ceil(b.left+3));x<Math.min(o.width,b.right-3);x+=3){const k=4*(o.width*y+x);if(Math.min(a[k],a[k+1],a[k+2])<239)body++;n++;}return body/Math.max(n,1);}, {bytes:png.toString('base64'),b:s.layout.canvas});
  report.views.push({name:label,nonwhiteCanvasFraction:fraction,...s});
  const l=s.layout,b=l.canvas;
  check(label+' settled frame uses full device profile with no mask, alpha filter, fog or clipping planes',
    raster.dpr===raster.fullDpr&&!s.optics.effects.length&&s.optics.fog===null&&s.optics.clippingPlanes===0,{raster,optics:s.optics});
  check(label+' active chapter and nonblank WebGL',s.chapter===chapters[index].id&&s.canvasCount===1&&s.shaderErrors===0&&fraction>.012,{chapter:s.chapter,fraction,shaderErrors:s.shaderErrors});
  const normalize=t=>String(t||'').trim().replace(/\s+/g,' ');
  check(label+' educational chapter title matches its state',normalize(s.title)===normalize(chapters[index].title),s.title);
  if(index!==4)check(label+' chapter copy matches the displayed clinical state',normalize(s.description)===normalize(chapters[index].text),s.description);
  if(chapters[index].note)check(label+' clinical illustration note stays available',normalize(s.note)===normalize(chapters[index].note),s.note);
  if(index===5)check(label+' cleaned surface and irreversible cavity carry separate labels',chapters[5].resultLabels.every(x=>s.resultLabels?.includes(x)),s.resultLabels);
  check(label+' actual tooth mesh visibility',equal(s.visible,expected),s.visible);
  check(label+' dedicated model area fits without UI over it',b.width>40&&b.height>45&&b.left>=-1&&b.top>=-1&&b.right<=l.width+1&&b.bottom<=l.height+1&&l.overflowX<=1&&l.copyOverlap<1&&l.toolsOverlap<1,l);
  check(label+' visible educational copy stays on screen outside the canvas',l.clippedText.length===0,l.clippedText);
  check(label+' protected healthy 46 and fixed 36 pose',s.healthyMolar.morphBuffers===0&&!s.healthyMolar.lesionAttribute&&s.geometry36!==s.geometry46&&equal(s.pose36,base.pose36));
  if(index>=3)check(label+' actual mature 36 morphology persists',s.lesion===1&&s.caries.morphInfluence===1&&s.depthLocal>0&&s.caries.isolated,{lesion:s.lesion,influence:s.caries.morphInfluence,depth:s.depthLocal});
  else check(label+' healthy geometry before lesion',s.lesion===0&&s.depthLocal===0,{lesion:s.lesion,depth:s.depthLocal});
  if(index>=2&&index<=5)check(label+' proximal lesion site projects into view',s.lesionNDC?.every(n=>Math.abs(n)<1.001),s.lesionNDC);
  if(index===1)check(label+' contact established before deposits',s.deposit===0&&!s.plaque.visible&&!s.brush.visible);
  if(index===2)check(label+' attached deposits on actual 36 and 37',s.plaque.visible&&s.plaque.deposition>.99&&equal(s.plaque.patches.map(x=>x.fdi).sort(),[36,37])&&s.plaque.patches.every(x=>x.triangles>0&&x.maxRegistrationErrorMm<=.04));
  if(index===4)check(label+' brush visibly engaged or aligning as sampled',s.brush.visible&&s.brush.filamentInstances>0&&near(s.brush.insertion,s.brushPose.insertion,.0001),s.brush);
  if(index===5)check(label+' contact-only removal leaves out-of-reach deposit',s.clean===1&&!s.brush.visible&&s.plaque.patches.some(x=>x.currentWeightedRemoval>0)&&s.plaque.patches.some(x=>x.unreachableVertices>0&&x.currentWeightedRemoval<.999999)&&s.plaque.patches.every(x=>x.outsideRemovedWeight===0),s.plaque);
  if(index===6&&p>=.96)check(label+' 28 distinct teeth, no brush in the final arch',equal(s.meshFDIs,allFDI)&&!s.brush.visible&&equal(s.visible,allFDI));
  return s;
}
const three=[35,36,37], lower=allFDI.slice(14);
const standard=[['hero',0,0,[36]],['space',.21,1,three],['plaque',.33,2,three],['caries',.475,3,three],['brush',.62,4,three],['result',.76,5,three],['full',.98,6,allFDI]];
const extra=[['brush-align',.51,4,three],['brush-entry',.542,4,three],['brush-insert',.58,4,three],['brush-stroke',.64,4,three],['lower',.876,6,lower]];
const stamp=s=>({p:s.progress,chapter:s.chapter,visible:s.visible,lesion:s.lesion,deform:s.depthLocal,deposit:s.deposit,clean:s.clean,brush:s.brushPose,insertion:s.brush.insertion,tip:s.brush.tipWorld,removed:s.plaque.patches.map(x=>x.currentWeightedRemoval),camera:s.camera,pose36:s.pose36,lights:s.lights});

const drift=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const guided=s=>s.mode==='presentation'&&!s.free;
const free=s=>s.mode==='free'&&s.free;
const sameStory=(a,b)=>equal(a.story,b.story);
const sameOffsets=(a,b)=>['desiredYaw','desiredPitch','desiredZoom'].every(k=>near(a.manual?.[k],b.manual?.[k],1e-7));
function checkHandover(name,t) {
  check(name+' leaves the click-handler view continuous',t.clickAngleJump<.035&&t.clickPositionJump<.025,{clickAngle:t.clickAngleJump,clickPosition:t.clickPositionJump});
  check(name+' visibly traverses intermediate frames',t.movingFrames>=3&&t.largestFrameAngle<.45, {movingFrames:t.movingFrames,maxAngle:t.largestFrameAngle,endpointRotation:t.endpointRotation});
}
async function desktopInputs(page) {
  const evidence=await desktopInputSequence(page,p=>scroll(page,p)),s=evidence.states;
  check('Desktop first drag orbits horizontally immediately in presentation',guided(s.initial)&&guided(s.guidedX)&&drift(s.initial.yaw,s.guidedX.yaw)>.03&&sameStory(s.initial,s.guidedX));
  check('Desktop default drag also changes elevation, not native scroll',guided(s.guidedY)&&Math.abs(s.guidedY.pitch-s.guidedX.pitch)>.025&&Math.abs(s.guidedY.nativeY-s.initial.nativeY)<=1&&sameStory(s.guidedY,s.initial));
  check('Default +/- zoom affects actual camera without selecting Free 3D',guided(s.guidedPlus)&&guided(s.guidedMinus)&&zoomTravel(s.guidedY,s.guidedPlus)>.002&&zoomTravel(s.guidedPlus,s.guidedMinus)<-.002&&sameStory(s.guidedPlus,s.guidedMinus));
  check('Arrow key adjusts the presentation camera without changing the lesson',guided(s.guidedKey)&&angular(s.guidedMinus.quat,s.guidedKey.quat)>.005&&sameStory(s.guidedMinus,s.guidedKey));
  check('Presentation wheel scrolls the actual document, no extra zoom gesture',guided(s.guidedWheel)&&s.guidedWheel.nativeY>s.guidedKey.nativeY+5&&near(s.guidedWheel.manual?.desiredZoom,s.guidedKey.manual?.desiredZoom));
  check('Explicit Free 3D handles both mouse axes',free(s.freeStart)&&free(s.freeDrag)&&drift(s.freeDrag.yaw,s.freeStart.yaw)>.02&&Math.abs(s.freeDrag.pitch-s.freeStart.pitch)>.02);
  check('Free-mode wheel zooms camera while native page position stays fixed',free(s.freeWheel)&&zoomTravel(s.freeDrag,s.freeWheel)>.002&&Math.abs(s.freeWheel.nativeY-s.freeDrag.nativeY)<=1);
  check('Free mode freezes brush, plaque, cavity and teeth even after actual document scroll',free(s.freeNativeJump)&&Math.abs(s.freeNativeJump.nativeP-s.freeStart.nativeP)>.20&&[s.freeDrag,s.freeWheel,s.freeNativeJump].every(v=>sameStory(s.freeStart,v)));
  check('Continue returns to the frozen educational point',guided(s.continued)&&s.continued.story.chapter===s.freeStart.story.chapter&&near(s.continued.nativeP,s.freeStart.nativeP,.0005)&&near(s.continued.story.clean,s.freeStart.story.clean,.001));
  checkHandover('Continue from a rotated/zoomed brush',evidence.continueTrace);
  check('Guided user offsets survive an actual viewport resize',guided(s.beforeResize)&&guided(s.afterResize)&&Math.abs(s.beforeResize.manual?.desiredYaw)>.02&&s.beforeResize.manual?.desiredZoom<.99&&sameOffsets(s.beforeResize,s.afterResize));
  checkHandover('Selecting another chapter after dragging',evidence.chapterTrace);
  check('Direct chapter destination renders the cleaned patch and persistent cavity',guided(s.navigated)&&s.navigated.story.chapter==='result'&&s.navigated.story.clean===1&&s.navigated.story.influence===1);
  checkHandover('Native wheel chapter crossing after a drag',evidence.wheelTrace);
  check('Purposeful native chapter crossing returns manual offsets to the authored view',guided(s.afterWheelHandover)&&s.beforeWheelHandover.story.chapter==='caries'&&s.afterWheelHandover.story.chapter==='brush'&&
    s.afterWheelHandover.nativeY-s.beforeWheelHandover.nativeY>64&&Math.abs(s.beforeWheelHandover.manual?.desiredYaw)>.05&&near(s.afterWheelHandover.manual?.desiredYaw,0,1e-5));
  report.desktopInput=evidence;
  // Native p can already equal the clicked destination while Free 3D still
  // displays another chapter. The action cannot depend on a new scroll event.
  await scroll(page,.62);await page.locator('#journey-explore').click();await nativeJump(page,0);
  const held=await cameraProbe(page);await page.locator('#journey-home').click();await page.waitForTimeout(680);
  const home=await cameraProbe(page);
  check('Clicking an already reached native position reconciles frozen state',free(held)&&held.story.chapter==='brush'&&near(held.nativeP,0,.0005)&&guided(home)&&home.story.chapter==='hero'&&equal(home.story.visible,[36]),{held:held.story.chapter,home:home.story.chapter,native:home.nativeP});
}
async function mobileInputs(ctx,page){
  const evidence=await mobileInputSequence(ctx,page,p=>scroll(page,p)),s=evidence.states;
  check('Mobile first horizontal gesture rotates immediately, vertical scroll remains available',guided(s.guidedX)&&s.initial.touchAction.includes('pan-y')&&drift(s.initial.yaw,s.guidedX.yaw)>.02&&Math.abs(s.guidedX.nativeY-s.initial.nativeY)<=1&&sameStory(s.initial,s.guidedX));
  check('Mobile guided zoom button works without enabling free mode',guided(s.guidedPlus)&&zoomTravel(s.guidedX,s.guidedPlus)>.002);
  check('Guided vertical finger gesture actually scrolls the page',guided(s.guidedY)&&s.guidedY.nativeY>s.guidedPlus.nativeY+5);
  check('Entering Free 3D changes touch-action before the gesture',free(s.freeStart)&&s.freeStart.touchAction==='none');
  check('Free touch drag orbits horizontally and vertically without page movement',free(s.freeX)&&free(s.freeY)&&drift(s.freeStart.yaw,s.freeX.yaw)>.02&&Math.abs(s.freeY.pitch-s.freeX.pitch)>.02&&Math.abs(s.freeY.nativeY-s.freeStart.nativeY)<=1);
  check('Two fingers pinch-zoom the model, not the browser or the lesson',free(s.freePinch)&&zoomTravel(s.freeY,s.freePinch)>.002&&near(s.freePinch.pageScale,1,.01)&&sameStory(s.freePinch,s.freeStart));
  check('Mobile frozen scene survives outside-canvas document scroll',free(s.freeNativeJump)&&Math.abs(s.freeNativeJump.nativeP-s.freeStart.nativeP)>.2&&sameStory(s.freeNativeJump,s.freeStart));
  check('Mobile chapter navigation explicitly leaves free mode',guided(s.navigated)&&s.navigated.story.chapter==='result'&&s.navigated.story.influence===1&&s.navigated.story.clean===1);
  report.mobileInput=evidence;
}
async function finalViews(page,label) {
  await scroll(page,.98);await restingRaster(page);
  const smile=await cameraProbe(page),smileProjection=await projectedFootprints(page),smileOptics=await opticalState(page);
  const aspect=smile.raster.rect.width/smile.raster.rect.height,expectedAspect=label==='desktop'?2.70:2.32;
  check(label+' frontal composition uses an actual wide camera viewport',near(aspect,expectedAspect,.025)&&
    smile.computedMask==='none'&&!smileOptics.effects.length&&smileOptics.fog===null&&smileOptics.clippingPlanes===0&&smileOptics.translucentTeeth===0,
    {aspect,expectedAspect,smileOptics});
  await page.locator('#journey-explore').click();await restingRaster(page);
  const freeSmile=await cameraProbe(page);
  check(label+' Free 3D expands the actual camera viewport at the frozen final chapter',free(freeSmile)&&
    freeSmile.raster.rect.height>smile.raster.rect.height*1.2&&sameStory(freeSmile,smile)&&freeSmile.computedMask==='none',
    {freeHeight:freeSmile.raster.rect.height,smileHeight:smile.raster.rect.height});
  await page.locator('#journey-explore').click();await restingRaster(page);
  if(label==='mobile')await touchDrag(page.context(),page,60,0);else await mouseDrag(page,60,0);
  const manuallyMoved=await cameraProbe(page);await page.locator('#journey-reset').click();await restingRaster(page);
  const afterReset=await cameraProbe(page);
  check(label+' default drag moves the view without hiding tissue; reset restores the frontal orientation',
    guided(manuallyMoved)&&manuallyMoved.computedMask==='none'&&angular(manuallyMoved.quat,smile.quat)>.02&&
    angular(afterReset.quat,smile.quat)<.006&&near(afterReset.raster.rect.height,smile.raster.rect.height,.5));
  await page.locator('#journey-view-anatomy').click();await restingRaster(page);
  const anatomy=await cameraProbe(page),anatomyProjection=await projectedFootprints(page),anatomyOptics=await opticalState(page);
  await page.screenshot({path:resolve(out,label+'-anatomy.png'),scale:'css',animations:'disabled'});
  check(label+' final smile and anatomical overview both retain all 28 opaque surfaces',smile.finalView==='smile'&&anatomy.finalView==='anatomy'&&equal(smile.story.visible,allFDI)&&equal(anatomy.story.visible,allFDI)&&anatomyOptics.translucentTeeth===0);
  check(label+' smile translates upper arch only; lower and tooth morphology stay fixed',near(smile.closureCm,.58,.0005)&&near(anatomy.closureCm,0,.0005)&&allFDI.every(fdi=>{
    const a=anatomyProjection.matrices[fdi],s=smileProjection.matrices[fdi];return a.every((v,i)=>near(v-s[i],fdi<30&&i===13?.58:0,1e-5));})&&smile.story.influence===1&&anatomy.story.influence===1);
  check(label+' Anatomy expands the viewport and fits both whole arches',anatomy.raster.rect.height>smile.raster.rect.height*1.2&&anatomyProjection.geometry?.clipped===0&&
    !anatomyOptics.effects.length&&anatomyOptics.fog===null&&anatomyOptics.clippingPlanes===0,{bounds:anatomyProjection.geometry,optics:anatomyOptics});
  await page.locator('#journey-view-smile').click();await restingRaster(page);const restored=await cameraProbe(page);
  check(label+' returning to smile reproduces frontal pose and viewport',restored.finalView==='smile'&&near(restored.closureCm,smile.closureCm,.0005)&&dist(smile.pos,restored.pos)<.008&&
    angular(smile.quat,restored.quat)<.006&&near(restored.raster.rect.height,smile.raster.rect.height,.5));
  (report.finalViews??=[]).push({label,smile:smileProjection,anatomy:anatomyProjection,aspect,expectedAspect,
    smileOptics,anatomyOptics,smileHeight:smile.raster.rect.height,freeHeight:freeSmile.raster.rect.height,anatomyHeight:anatomy.raster.rect.height});
}
async function macroZoom(page,label) {
  await scroll(page,.475);await page.locator('#journey-reset').click();await page.waitForTimeout(580);
  const before=await projectedFootprints(page),state=await cameraProbe(page);
  await page.locator('#journey-zoom-in').click();await page.locator('#journey-zoom-in').click();await restingRaster(page);
  const enlarged=await projectedFootprints(page),after=await cameraProbe(page);
  await page.screenshot({path:resolve(out,label+'-caries-macro.png'),scale:'css',animations:'disabled'});
  check(label+' two guided zoom steps enlarge the actual projected cavity floor',guided(after)&&sameStory(state,after)&&
    enlarged.floor?.width>before.floor?.width*1.1&&enlarged.floor?.height>before.floor?.height*1.1,{before:before.floor,after:enlarged.floor});
  (report.manualMacro??=[]).push({label,originalFloor:before.floor,userZoomFloor:enlarged.floor,zoom:after.manual?.zoom});
  await page.locator('#journey-reset').click();await page.waitForTimeout(570);
}
async function lightingHistory(page) {
  // Identical destination after a near/far jump: measuring only the camera
  // misses illumination accidentally calculated using the previous VIEW pose.
  async function take(from){await scroll(page,from);await scroll(page,.475);await restingRaster(page);
    return {state:await read(page),png:await page.locator(q).screenshot({scale:'css',animations:'disabled'})};}
  const a=await take(0),b=await take(.98);
  const pixels=await page.evaluate(async([aa,bb])=>{
    async function read(s){const im=await createImageBitmap(new Blob([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],{type:'image/png'}));const c=new OffscreenCanvas(im.width,im.height),ctx=c.getContext('2d');ctx.drawImage(im,0,0);im.close();return ctx.getImageData(0,0,c.width,c.height).data;}
    const a=await read(aa),b=await read(bb);let peak=0,changed=0,sum=0;
    for(let i=0;i<a.length;i+=4){const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));peak=Math.max(peak,d);if(d>2)changed++;sum+=d;}
    return {pixels:a.length/4,peak,changedOver2:changed,meanMaximumChannelDifference:sum/(a.length/4)};
  },[a.png.toString('base64'),b.png.toString('base64')]);
  check('Actual studio lights/shadow extents are identical at the same caries pose after different scroll histories',a.state.lights.length>=4&&equal(a.state.lights,b.state.lights),{fromHero:a.state.lights,fromFull:b.state.lights});
  check('Rendered cavity frame is repeatable from opposite scroll directions',pixels.peak<=2,pixels);
  report.lightingHistory={from:[0,.98],destination:.475,lights:b.state.lights,pixels};
}

async function desktop() {
  const {ctx,page}=await open();try {
    await goto(page);await ready(page);const base=await read(page), states={};
    for(const [name,p,i,fdi] of [...standard,...extra])states[name]=await saveView(page,'desktop-'+name,p,i,fdi,base);
    check('Identical displaced refined floor vertex at and after cleaning',states.caries.depthLocal>0&&['brush','result','full'].every(k=>near(states[k].depthLocal,states.caries.depthLocal,1e-12)));
    const recipe=JSON.parse(await readFile(new URL('../public/story-assets/caries-36.json',import.meta.url),'utf8'));
    const bindings=await page.evaluate(()=>{const a=window.__dentalExperience,n=a.arch.teeth.get(36).mesh.geometry,h=a.arch.teeth.get(46).mesh.geometry;
      const r=n.userData.lesionRefinement;return{vertices:n.attributes.position.count,faces:n.index.count/3,morphVertices:n.morphAttributes.position[0].count,sourceVertices:r?.sourceVertexCount,
        sourceFaces:n.userData.lesionSourceIndex?.count/3,edgeMidpoints:r?.edgeMidpoints.length,healthy46HasRefinement:Boolean(h.userData.lesionRefinement),healthy46Vertices:h.attributes.position.count};});
    report.refinedSurface=bindings;
    check('Only 36 receives the fitted subdivision and sparse morph from the released recipe',
      bindings.vertices===recipe.vertexCount&&bindings.faces===recipe.triangleCount&&bindings.morphVertices===recipe.vertexCount&&
      bindings.sourceFaces===recipe.refinement.sourceTriangleCount&&bindings.sourceVertices===recipe.refinement.sourceVertexCount&&
      bindings.vertices===bindings.sourceVertices+bindings.edgeMidpoints/2&&bindings.healthy46Vertices===bindings.sourceVertices&&
      !bindings.healthy46HasRefinement&&states.caries.caries.sparseVertices===recipe.indices.length,bindings);
    check('Only the affected tooth owns caries attributes',states.caries.caries.sparseVertices>0&&states.caries.caries.fdi===36&&states.caries.healthyMolar.morphBuffers===0);
    check('Localized plaque removal progresses through working passes',states['brush-insert'].plaque.patches.some((x,i)=>states.brush.plaque.patches[i].currentWeightedRemoval>x.currentWeightedRemoval)&&states.result.plaque.patches.every((x,i)=>x.currentWeightedRemoval>=states.brush.plaque.patches[i].currentWeightedRemoval));
    check('All three brush instructions appear at their relevant physical phases',
      [states['brush-align'],states['brush-entry'],states['brush-stroke']].every((s,i)=>s.instruction.includes(chapters[4].instructions[i])));
    // Physically scroll the document across chapter boundaries over successive
    // rendered frames, including reverse motion and a fast endpoint jump.
    const track=await page.evaluate(async()=>{const app=window.__dentalExperience,sec=document.querySelector('#dental-journey'),stage=document.querySelector('#journey-stage'),samples=[],seen=new Set();
      const r=sec.getBoundingClientRect(),base=scrollY+r.top,len=r.height-stage.getBoundingClientRect().height;
      for(let i=0;i<=70;i++){window.scrollTo({top:base+len*i/70,behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const a=app.report();seen.add(a.story.chapterId);samples.push([a.progress,a.story.caries.morphInfluence,a.story.plaque.cleaningProgress]);}
      return {seen:[...seen],samples};});report.forwardScroll=track;
    check('Native gradual scrolling visits seven chapters',equal(track.seen,chapters.map(c=>c.id)),track.seen);
    for(const name of ['result','brush','caries','space','full','hero','brush','result']){
      const p=standard.find(x=>x[0]===name)[1];await scroll(page,p);const s=await read(page);
      check('Reverse/jump reproduces '+name,equal(stamp(s),stamp(states[name])),{before:stamp(states[name]),after:stamp(s)});
    }
    // Navigation, semantics, help and manual camera return through real inputs.
    const buttons=page.locator('.journey-step');check('Seven focusable desktop chapters',await buttons.count()===7);
    for(let i=0;i<chapters.length;i++){await buttons.nth(i).click();await at(page,chapters[i].at);const a=await read(page);check('Direct chapter '+chapters[i].label,a.chapter===chapters[i].id&&a.activeCount===1&&(await buttons.nth(i).getAttribute('aria-current'))==='step');}
    await page.locator('#journey-home').click();await at(page,0);await page.locator('#journey-next').click();await at(page,chapters[1].at);
    await page.locator('#journey-previous').click();await at(page,0);
    await page.locator('#journey-help').click();check('Help opens an accessible modal',await page.locator('#journey-help-dialog').evaluate(d=>d.open&&Boolean(d.getAttribute('aria-labelledby'))));
    await page.keyboard.press('Escape');check('Escape dismisses the help dialog',!(await page.locator('#journey-help-dialog').isVisible()));
    await lightingHistory(page);await macroZoom(page,'desktop');await desktopInputs(page);
    await finalViews(page,'desktop');
  }finally{await closeContext(ctx);}
}
async function adaptiveBuffers(page) {
  await restingRaster(page);
  const states=await page.evaluate(()=>{
    const a=window.__dentalExperience,r=a.renderer,canvas=r.domElement;
    const snapshot=()=>({dpr:r.getPixelRatio(),buffer:[canvas.width,canvas.height]});
    const idle=snapshot();
    a.adaptive.beginInteraction();const moving=snapshot();
    // Feed deliberately slow frame intervals into the actual quality controller.
    // This controlled branch test is separate from measured scroll timings.
    for(let i=0;i<64;i++)a.adaptive.recordFrame(70);
    const slow=snapshot();a.adaptive.endInteraction();
    return {idle,moving,slow,profile:a.profile.pixelRatio,inputIntervalMs:70,inputCount:64};
  });
  states.restored=await restingRaster(page);
  check('Compact still image renders at DPR 2 and interaction reduces the actual drawing buffer',
    near(states.idle.dpr,2)&&near(states.profile,2)&&states.moving.dpr<=1.35&&states.moving.buffer[0]<states.idle.buffer[0],states);
  check('Sustained slow input intervals lower the interaction buffer; ending interaction restores native sharpness',
    states.slow.dpr<states.moving.dpr&&states.slow.buffer[0]<states.moving.buffer[0]&&near(states.restored.dpr,states.idle.dpr)&&equal(states.restored.buffer,states.idle.buffer),states);
  report.adaptiveBuffers=states;
}
async function mobile() {
  const {ctx,page}=await open({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});try {
    await goto(page);await ready(page);const base=await read(page);
    await adaptiveBuffers(page);
    for(const [n,p,i,f]of standard)await saveView(page,'mobile-'+n,p,i,f,base);
    const selector=page.locator('#journey-chapter-select');check('Compact chapter selector is visible and contains all seven destinations',await selector.isVisible()&&await selector.locator('option').count()===7);
    for(const i of [0,4,5,6]){await selector.selectOption({index:i});await at(page,chapters[i].at);check('Native mobile selector lands on '+chapters[i].id,(await read(page)).chapter===chapters[i].id);}
    await macroZoom(page,'mobile');await mobileInputs(ctx,page);
    await finalViews(page,'mobile');
    for(const [label,size]of [['phone-360',{width:360,height:780}],['landscape',{width:844,height:390}],['small-phone',{width:320,height:568}]]){
      await page.setViewportSize(size);await threeFrames(page);
      for(const [n,p,i,f]of standard){await saveView(page,label+'-'+n,p,i,f,base);}
    }
    const warmCleanup=await page.evaluate(()=>{const a=window.__dentalExperience,r=a.renderer,area=document.querySelector('.journey-scene-area'),before={...r.info.memory},composedHeight=area.style.maxHeight;a.dispose();return {before,after:{...r.info.memory},disposed:a.report().disposed,composedHeight,restoredHeight:area.style.maxHeight};});
    check('Successfully rendered brush and full arch release tracked GPU resources on dispose',warmCleanup.before.geometries>1&&warmCleanup.before.textures>3&&warmCleanup.disposed&&warmCleanup.after.geometries===0&&warmCleanup.after.textures===0,warmCleanup);
    check('Dispose restores the native height of the photographic viewport',warmCleanup.composedHeight.endsWith('px')&&!warmCleanup.restoredHeight,warmCleanup);
    report.successfulSceneCleanup=warmCleanup;
  }finally{await closeContext(ctx);}
}
async function reduced() {
  const {ctx,page}=await open({reducedMotion:'reduce'});try {
    await goto(page);await ready(page);const poses=[];
    const still=s=>({camera:s.camera,visible:s.visible,deform:s.depthLocal,clean:s.clean,deposit:s.deposit,brush:s.brushPose,tip:s.brush.tipWorld});
    for(const c of chapters){const span=c.end-c.start;await scroll(page,c.start+.10*span);const a=await read(page);await scroll(page,c.start+.86*span);const b=await read(page);
      check('Reduced motion keeps one pose and material state within '+c.id,equal(still(a),still(b)),{a:still(a),b:still(b)});poses.push(still(a));}
    check('Seven meaningfully different reduced-motion scenes',new Set(poses.map(x=>JSON.stringify(x))).size===7);
    await scroll(page,.56);const brush=await read(page);check('Reduced brush depicts a fixed live contact and a persistent lesion',brush.brush.visible&&brush.brush.insertion>.1&&brush.depthLocal>0&&brush.clean>0&&brush.clean<1);
    report.reducedMotion=poses;
  }finally{await closeContext(ctx);}
}
async function aliases() {
  for(const [entry,selector]of [['experience/?qa=1',q],['legacy/','#tooth-canvas'],['prototype/','#prototype-canvas']]){
    const {ctx,page}=await open();try{await goto(page,entry);await page.waitForSelector(selector+'[data-ready="true"]',{timeout:60000});
      if(entry.startsWith('experience')){await ready(page);check('/experience/ alias loads same seven-chapter story',(await read(page)).chapter==='hero'&&await page.locator('.journey-step').count()===7);}
      else{const d=await page.locator(selector).evaluate(el=>({...el.dataset}));check('Preserved '+entry+' loads original model',d.ready==='true'&&(entry==='legacy/'?Number(d.assetTriangles)===388032:Number(d.modelMeshes)===1),d);}
    }finally{await closeContext(ctx);}
  }
}
async function malformedStoryOwnership() {
  const {ctx,page}=await open();
  try{
    // Real texture bitmaps, observed before any module runs. Never replace
    // disposal semantics: call the original method, record object identity only.
    await page.addInitScript(()=>{
      const proto=ImageBitmap.prototype,descriptor=Object.getOwnPropertyDescriptor(proto,'close'),native=descriptor.value;
      const seen=new WeakSet(),stats={calls:0,duplicates:0};
      Object.defineProperty(proto,'close',{...descriptor,value:function(...args){stats.calls++;if(seen.has(this))stats.duplicates++;else seen.add(this);return native.apply(this,args);}});
      Object.defineProperty(window,'__qaBitmapDisposals',{value:()=>({...stats})});
    });
    const bad=JSON.parse(await readFile(new URL('../public/story-assets/caries-36.json',import.meta.url),'utf8'));bad.vertexCount+=1;
    let corruptResponses=0;
    await page.route('**/story-assets/caries-36.json*',r=>{corruptResponses++;return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(bad)});});
    await goto(page);await page.locator('#journey-retry').waitFor({state:'visible',timeout:60000});await threeFrames(page);
    const fail=await page.evaluate(()=>{
      const a=window.__dentalExperience,s=a.report(),m=a.arch.teeth.get(36).mesh;
      return {ready:s.ready,assetsReady:s.assetsReady,anatomyReady:s.anatomyReady,loadedTeeth:s.teeth.filter(t=>t.loaded).length,
        visible:s.visibleTeeth,error:document.querySelector('#journey-canvas').dataset.error,
        upcoming:document.querySelector('#journey-status').classList.contains('is-upcoming'),message:document.querySelector('#journey-message').innerText,
        triangles:m.geometry.index.count/3,morphs:m.geometry.morphAttributes.position?.length||0,
        frame:a.renderer.info.render.frame,camera:a.rig.camera.position.toArray(),target:a.rig.target.toArray(),bitmaps:window.__qaBitmapDisposals()};
    });
    check('Injected malformed caries is rejected after 28 tooth objects transfer to the arch',corruptResponses===1&&fail.anatomyReady===true&&!fail.assetsReady&&fail.loadedTeeth===28&&/Cavity refinement does not match|Caries asset does not match/.test(fail.error),fail);
    check('Upcoming-data failure keeps the native healthy hero and readable retry',fail.ready&&fail.upcoming&&fail.message.length>10&&equal(fail.visible,[36])&&fail.triangles===55184&&fail.morphs===0,fail);
    await page.locator('#journey-zoom-in').click();await threeFrames(page);
    const inspect=await page.evaluate(()=>{const a=window.__dentalExperience;return {frame:a.renderer.info.render.frame,camera:a.rig.camera.position.toArray(),target:a.rig.target.toArray(),errors:a.report().shaderErrors};});
    check('Healthy 36 still renders and responds to zoom after late failure',inspect.frame>fail.frame&&!inspect.errors&&dist(inspect.camera,inspect.target)<dist(fail.camera,fail.target)-.001,inspect);
    const cleanup=await page.evaluate(()=>{
      const a=window.__dentalExperience,measure=()=>({gpu:{...a.renderer.info.memory},bitmaps:window.__qaBitmapDisposals(),disposed:a.report().disposed});
      const uniforms=a.renderer.properties.get(a.arch.teeth.get(36).mesh.material).uniforms;
      const luts=['ltc_1','ltc_2','dfgLUT'].map(key=>{const t=uniforms?.[key]?.value;return {key,name:t?.name,width:t?.image?.width,height:t?.image?.height,uploaded:t?!!a.renderer.properties.get(t).__webglTexture:false};});
      const before=measure();a.dispose();const first=measure();a.dispose();return {before,first,second:measure(),renderedLightingLuts:luts};
    });
    check('Late failed scene releases tracked GPU geometries and textures exactly once',cleanup.before.gpu.geometries>0&&cleanup.before.gpu.textures>0&&cleanup.first.disposed&&cleanup.first.gpu.geometries===0&&cleanup.first.gpu.textures===0&&equal(cleanup.first,cleanup.second),cleanup);
    check('No ImageBitmap is closed twice across failure, release and repeated dispose',cleanup.first.bitmaps.calls>0&&cleanup.first.bitmaps.duplicates===0,cleanup.first.bitmaps);
    report.failureInjection={kind:'A real valid source JSON with only vertexCount increased by one; HTTP 200.',corruptResponses,fail,inspect,cleanup};
  }finally{await closeContext(ctx);}
}
async function lostContextDuringInitialLoad() {
  const {ctx,page}=await open();let release,signalRequest;
  const gate=new Promise(r=>{release=r;}),requested=new Promise(r=>{signalRequest=r;});
  try{
    await page.route('**/dentition-assets/hero-36*.glb*',async r=>{signalRequest();await gate;return r.continue();});
    await goto(page);
    // Bound the intentional gate even if an asset URL changes in the future.
    let timeout;try{await Promise.race([requested,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Initial hero was never requested')),15000);})]);}finally{clearTimeout(timeout);}
    const injected=await page.evaluate(()=>{const c=document.querySelector('#journey-canvas');const gl=c.getContext('webgl2'),ext=gl?.getExtension('WEBGL_lose_context');
      if(!ext)return false;ext.loseContext();return true;});
    check('Chrome test can lose the actual WebGL2 context while initial data is pending',injected);
    if(!injected)return;
    await page.locator('#journey-retry').waitFor({state:'visible'});
    release();await page.evaluate(()=>window.__dentalExperience.ready.then(()=>true));await threeFrames(page);
    const state=await page.evaluate(()=>{const a=window.__dentalExperience.report(),c=document.querySelector('#journey-canvas');return{
      ready:a.ready,assetsReady:a.assetsReady,anatomyReady:a.anatomyReady,datasetReady:c.dataset.ready,lost:c.getContext('webgl2').isContextLost(),
      message:document.querySelector('#journey-message').innerText,retryVisible:!document.querySelector('#journey-retry').hidden,
      controlsDisabled:document.querySelector('#journey-zoom-in').disabled};});
    check('Completing an initially gated GLB cannot resurrect a lost context or replace its recovery message',state.lost&&!state.ready&&!state.assetsReady&&state.datasetReady==='false'&&state.retryVisible&&state.controlsDisabled&&/prerušilo|WebGL/i.test(state.message),state);
    report.contextLossInjection=state;
  }finally{release();await closeContext(ctx);}
}
async function pendingAssetsWithInput() {
  for(const mode of ['presentation','free']){
    const {ctx,page}=await open();let release,noticed;
    const gate=new Promise(r=>{release=r;}),request=new Promise(r=>{noticed=r;});
    try{
      await page.route('**/story-assets/caries-36.json*',async r=>{noticed();await gate;return r.continue();});
      await goto(page);await page.waitForSelector(q+'[data-ready="true"]',{timeout:60000});
      let timer;try{await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Story data gate not reached')),15000);})]);}finally{clearTimeout(timer);}
      if(mode==='free')await page.locator('#journey-explore').click();
      await mouseDrag(page,65,-40);await page.locator('#journey-zoom-in').click();await page.waitForTimeout(450);
      const held=await cameraProbe(page);release();await ready(page);await page.waitForTimeout(180);const after=await cameraProbe(page);
      check('Completing background assets keeps real user rotation/zoom in '+mode,
        held.mode===mode&&after.mode===mode&&sameOffsets(held,after)&&Math.abs(after.manual?.desiredYaw)>.015&&after.manual?.desiredZoom<.99&&
        angular(held.quat,after.quat)<.025&&equal(held.story.visible,[36])&&equal(after.story.visible,[36]),{held,after});
      (report.pendingAssetInput??=[]).push({mode,held,after});
    }finally{release();await closeContext(ctx);}
  }
}
async function pagesPrefix() {
  // Vite preview can resolve an accidental root-relative path even when the
  // deployed GitHub Pages repository subdirectory cannot. Mount ONLY /zub-3d/
  // on an ephemeral loopback port and return 404 for everything outside it.
  const prefix='/zub-3d/',dist=await realpath(resolve(process.env.DENTAL_STORY_DIST_DIR||'dist'));
  const requests=[],rejected=[];
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.glb':'model/gltf-binary',
    '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
  const server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      if(!pathname.startsWith(prefix)){rejected.push(pathname);res.writeHead(404);res.end();return;}
      const name=pathname.slice(prefix.length)+(pathname.endsWith('/')?'index.html':'');
      const file=await realpath(resolve(dist,name)),rel=relative(dist,file);
      if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)){res.writeHead(403);res.end();return;}
      const info=await stat(file);if(!info.isFile()){res.writeHead(404);res.end();return;}requests.push(pathname);
      // Serve binary files as actual streams, as ordinary static hosts do.
      res.writeHead(200,{'Content-Type':types[extname(file).toLowerCase()]||'application/octet-stream','Content-Length':info.size,
        'Last-Modified':info.mtime.toUTCString(),'ETag':`W/"${info.size}-${Math.trunc(info.mtimeMs)}"`,'Cache-Control':'no-cache'});
      if(req.method==='HEAD')res.end();
      else{const stream=createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base=new URL(`http://127.0.0.1:${server.address().port}${prefix}`);const routes=[];
  try{
    for(const [entry,selector]of [['?qa=1',q],['experience/?qa=1',q],['prototype/','#prototype-canvas'],['legacy/','#tooth-canvas']]){
      const {ctx,page}=await open({},base.origin),before=requests.length;
      try{
        await goto(page,entry,base);await page.waitForSelector(selector+'[data-ready="true"]',{timeout:60000});
        const details=await page.locator(selector).evaluate(el=>({...el.dataset}));
        let valid=details.ready==='true';
        if(selector===q){await ready(page);await scroll(page,.98);const s=await read(page);valid&&=s.chapter==='dentition'&&equal(s.visible,allFDI)&&s.shaderErrors===0;}
        else valid&&=selector==='#tooth-canvas'?Number(details.assetTriangles)===388032:Number(details.modelMeshes)===1;
        const modules=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(n=>new URL(n.src).pathname));
        const assets=requests.slice(before);valid&&=modules.length>0&&modules.every(x=>x.startsWith(prefix))&&assets.some(x=>x.endsWith('.glb'));
        check('GitHub Pages prefix loads actual models and script: '+entry,valid,{details,modules,assets});
        routes.push({entry,modules,requests:assets.length,models:assets.filter(x=>x.endsWith('.glb'))});
      }finally{await closeContext(ctx);}
    }
    check('No route escaped the repository path',rejected.length===0,rejected);
    report.pagesPrefix={prefix,routes,rejected,scope:'Actual production dist mounted only under /zub-3d/ on a loopback HTTP server; not a claim about CDN deployment status.'};
  }finally{
    server.closeAllConnections();await new Promise(r=>server.close(r));
  }
}
async function benchmark(label,settings) {
  const {ctx,page}=await open(settings);try {
    await goto(page);await ready(page);
    // Warm each unique material/reveal combination before timing. Do not take
    // screenshots or run CPU-heavy mesh/patch reports inside the measured loop.
    for(const p of [0,.33,.475,.62,.76,.98,.10])await scroll(page,p);
    const runs=await page.evaluate(async()=>{
      const app=window.__dentalExperience,sec=document.querySelector('#dental-journey').getBoundingClientRect();
      const start=scrollY+sec.top,travel=sec.height-document.querySelector('#journey-stage').getBoundingClientRect().height;
      const runs=[],gl=app.renderer.getContext(),dbg=gl.getExtension('WEBGL_debug_renderer_info');
      for(const [name,lo,hi]of [['whole story',0,1],['brush working passes',.54,.70]]){
        const samples=[];let prev=0;const f0=app.renderer.info.render.frame;
        for(let i=0;i<=130;i++){
          const t=await new Promise(r=>requestAnimationFrame(r));if(i>10)samples.push(t-prev);prev=t;
          window.scrollTo({top:start+travel*(lo+(hi-lo)*i/130),behavior:'instant'});
        }
        const renderedFrames=app.renderer.info.render.frame-f0; samples.sort((a,b)=>a-b);
        runs.push({name,samples:samples.length,p50FrameIntervalMs:samples[Math.floor(.5*(samples.length-1))],p95FrameIntervalMs:samples[Math.floor(.95*(samples.length-1))],
          slowIntervalsOver33ms:samples.filter(x=>x>33.4).length,renderedFrames,gpu:gl.getParameter(dbg?dbg.UNMASKED_RENDERER_WEBGL:gl.RENDERER)});
      }
      return runs;
    });
    const measuredBuild=await page.evaluate(()=>({modules:[...document.querySelectorAll('script[type="module"][src]')].map(n=>new URL(n.src).pathname),
      styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(n=>new URL(n.href).pathname),assetRevision:document.querySelector('#journey-canvas').dataset.revision}));
    (report.performance??=[]).push({label,measuredBuild,scope:'Native scroll and requestAnimationFrame intervals on this desktop. Not a GPU timer query or physical mobile FPS.',runs});
    check(label+' native scroll produced draws during both timing windows',runs.every(x=>x.renderedFrames>30&&x.samples===120),runs);
  }finally{await closeContext(ctx);}
}
try {
  if(!perfOnly&&!prefixOnly){
    await scenario('desktop medical sequence / navigation / native scroll',desktop);
    await scenario('touch portrait, short landscape, 320px layouts',mobile);
    await scenario('reduced motion seven meaningful still scenes',reduced);
    await scenario('historical viewer routes and narrative alias',aliases);
    await scenario('late malformed story data / retained geometry ownership / idempotent GPU cleanup',malformedStoryOwnership);
    await scenario('initial asset gate + actual WebGL context loss',lostContextDuringInitialLoad);
    await scenario('manual offsets and frozen subject survive deferred asset completion',pendingAssetsWithInput);
  }
  if(!perfOnly)await scenario('strict GitHub Pages subdirectory mount',pagesPrefix);
  if(perfOnly||process.env.DENTAL_STORY_BENCHMARK==='1'){
    await scenario('isolated desktop timing',()=>benchmark('desktop-1280x900',{}));
    await scenario('isolated emulated mobile timing',()=>benchmark('emulated-390x844',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}));
  }
  // The offline BVH audit is stronger evidence of numerical surface clearance
  // than a screenshot. Keep its conclusions separate from browser observations.
  const audit=JSON.parse(await readFile(new URL('../docs/proximal-reframe-review/independent-geometry.json',import.meta.url),'utf8'));
  const siteData=JSON.parse(await readFile(new URL('../public/story-assets/site.json',import.meta.url),'utf8'));
  report.offlineEvidence={morphAudit:'docs/proximal-reframe-review/independent-geometry.json',summary:audit.summary,
    rigidEnvelope:siteData.brush.rigidEnvelope,note:'Precomputed hard-tooth surface/path checks only; no gingiva is modelled. This run does not validate clinical fit.'};
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
  const auditedHashes=await Promise.all(['site.json','caries-36.json'].map(async n=>({name:n,expected:audit.changedStoryJson[n]?.currentSha256,actual:digest(await readFile(new URL('../public/story-assets/'+n,import.meta.url)))})));
  check('Companion audit describes these exact refined lesion data and unchanged source tooth assets',
    audit.passed&&audit.checks.healthyRefinementIsClosedAndConforming&&audit.summary.sourceAssetsAllByteIdenticalTo510a734&&auditedHashes.every(x=>x.actual===x.expected),auditedHashes);
  check('Independent two-LOD tooth/brush sampling finds no hard-tissue crossings in the cleaning pose',audit.summary.all28HardToothPairsAcrossStagesAndLods===3780&&audit.summary.toothSelfOrPairHits===0&&audit.summary.toolVsMatureHardHits===0&&!audit.summary.anyFloorToolHit,audit.summary);
  const env=siteData.brush.rigidEnvelope;
  check('Documented wire diameter is within the conservative hard-tooth path bound',env.wireRadialMarginLowerBoundMm>0&&env.illustrativeWireDiameterMm<2*env.continuousLowerBoundRadiusMm,env);
  check('No unexpected WebGL or JavaScript errors',report.errors.length===0,report.errors);
  check('No unexpected 404/network failures/external requests',report.failedRequests.length===0,report.failedRequests);
}finally{
  await browser.close();report.passed=report.issues.length===0;
  await writeFile(resolve(out,perfOnly?'performance.json':prefixOnly?'prefix.json':'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,views:report.views.length,issues:report.issues.map(x=>x.name),warnings:report.warnings.length,out},null,2));
  if(!report.passed)process.exitCode=1;
}
