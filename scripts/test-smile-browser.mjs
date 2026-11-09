import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { mouseDrag, touchDrag, pinchOut, wheelOnCanvas } from './browser-camera-probes.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const url=process.env.DENTAL_STORY_TEST_URL||'http://127.0.0.1:4173/';
const out=process.env.DENTAL_STORY_REVIEW_DIR||'../professional-review/rooted-flight-review';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try {
 for(const [width,height] of [[1440,900],[390,844]]) {
  const mobile=width<700;
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto(url+'?qa=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__dentalExperience?.report().assetsReady,null,{timeout:90000});
  async function seek(progress) {
   await page.evaluate(p=>{const r=document.querySelector('#dental-journey').getBoundingClientRect();
    const h=document.querySelector('#journey-stage').clientHeight;
    window.scrollTo({top:scrollY+r.top+(r.height-h)*p,behavior:'instant'});},progress);
   await page.waitForFunction(p=>{const r=window.__dentalExperience.report();
    return Math.abs(r.progress-p)<.002&&Math.abs(r.renderProgress-r.storyProgress)<.00002;},progress,{timeout:15000});
  }
  await seek(.80);
  const motion=await page.evaluate(async()=>{
   const box=document.querySelector('#dental-journey').getBoundingClientRect();
   const length=box.height-document.querySelector('#journey-stage').clientHeight,base=scrollY+box.top;
   const intervals=[];let previous=0;
   for(let i=0;i<=120;i++) {
    const time=await new Promise(requestAnimationFrame);
    if(previous)intervals.push(time-previous);
    previous=time;
    scrollTo({top:base+length*(.80+.20*i/120),behavior:'instant'});
   }
   intervals.sort((a,b)=>a-b);
   return {samples:intervals.length,p50Ms:intervals[60],p95Ms:intervals[114],over33ms:intervals.filter(v=>v>33.4).length};
  });
  async function readState() {
   const state=await page.evaluate(()=>{
    const {arch,report}=window.__dentalExperience,r=report(),teeth=[...arch.teeth.values()];
    const backing=arch.object.getObjectByName('Discreet enamel-coloured smile contact backing');
    return {chapter:r.story.chapterId,lesion:r.story.lesionProgress,crownMix:arch.crownMix,
     crowns:teeth.filter(t=>t.crown?.visible).length,anatomy:teeth.filter(t=>t.mesh?.visible).length,
     backingVisible:backing?.visible??false,backingOpacity:backing?.material.opacity??0,
     matrices:teeth.map(t=>t.mesh.matrix.toArray()),shaderErrors:r.shaderErrors};
   });
   assert.equal(state.lesion,1);
   assert.equal(state.shaderErrors,0);
   return state;
  }
  function expectMeshes(state,crowns,anatomy) {
   assert.equal(state.crowns,crowns);
   assert.equal(state.anatomy,anatomy);
  }

  await seek(.875);
  const floating=await readState();
  expectMeshes(floating,0,28);
  assert.equal(floating.crownMix,0);
  assert.equal(floating.backingVisible,false);
  await page.screenshot({path:`${out}/${width}-floating.png`});

  await seek(.945);
  const seated=await readState();
  expectMeshes(seated,0,28);
  assert.equal(seated.crownMix,0);
  assert.notDeepEqual(seated.matrices,floating.matrices,'The rooted teeth move toward their seats');

  await seek(.963);
  const dissolveStart=await readState();
  expectMeshes(dissolveStart,28,28);
  assert.ok(dissolveStart.crownMix>0&&dissolveStart.crownMix<.5);
  await seek(.980);
  const dissolveEnd=await readState();
  expectMeshes(dissolveEnd,28,28);
  assert.ok(dissolveEnd.crownMix>.5&&dissolveEnd.crownMix<1);

  await seek(.995);
  const smile=await readState();
  expectMeshes(smile,28,0);
  assert.equal(smile.crownMix,1);
  assert.equal(smile.backingVisible,true);
  assert.equal(smile.backingOpacity,1);
  await page.screenshot({path:`${out}/${width}-smile.png`});

  await page.locator('#journey-view-anatomy').click();await page.waitForTimeout(700);
  const anatomy=await readState();
  expectMeshes(anatomy,0,28);
  assert.equal(anatomy.crownMix,0);
  assert.equal(anatomy.backingVisible,false);
  await page.screenshot({path:`${out}/${width}-anatomy.png`});
  await page.locator('#journey-view-smile').click();await page.waitForTimeout(700);
  expectMeshes(await readState(),28,0);

  await seek(.963);
  const reversedDissolve=await readState();
  assert.equal(reversedDissolve.crownMix,dissolveStart.crownMix);
  await seek(.875);
  const reversed=await readState();
  expectMeshes(reversed,0,28);
  assert.equal(reversed.backingVisible,false);
  for(let i=0;i<reversed.matrices.length;i++) for(let j=0;j<16;j++)
   assert.ok(Math.abs(reversed.matrices[i][j]-floating.matrices[i][j])<1e-5,'Reverse restores the same transforms');
  await seek(.62);
  const beforeDrag=await page.evaluate(()=>window.__dentalExperience.report().view.desiredYaw);
  if(mobile)await touchDrag(context,page,60,0);else await mouseDrag(page,60,20);
  const afterDrag=await page.evaluate(()=>window.__dentalExperience.report().view.desiredYaw);
  assert.ok(Math.abs(afterDrag-beforeDrag)>.01,'Direct drag rotates the model');
  await page.locator('#journey-explore').click();
  assert.equal(await page.evaluate(()=>window.__dentalExperience.report().exploring),true);
  const beforeZoom=await page.evaluate(()=>window.__dentalExperience.report().view.desiredZoom);
  if(mobile)await pinchOut(context,page);else await wheelOnCanvas(page,-100);
  const afterZoom=await page.evaluate(()=>window.__dentalExperience.report().view.desiredZoom);
  assert.ok(Math.abs(afterZoom-beforeZoom)>.01,'Free-mode gesture zooms the model');
  await page.locator('#journey-explore').click();await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>window.__dentalExperience.report().exploring),false);
  await page.setViewportSize({width:height,height:width});await page.waitForTimeout(500);
  assert.ok(Math.abs((await page.evaluate(()=>window.__dentalExperience.report().progress))-.62)<.01);
  await page.locator('.journey-step').first().click();
  await page.waitForFunction(()=>{const r=window.__dentalExperience.report();return r.story.chapterId==='hero'&&r.renderProgress<.001;});
  await page.locator('.journey-step').last().click();
  await page.waitForFunction(()=>{const r=window.__dentalExperience.report();return r.story.chapterId==='dentition'&&Math.abs(r.renderProgress-r.storyProgress)<.00002;});
  expectMeshes(await readState(),28,0);
  assert.deepEqual(errors,[]);
  const stages=Object.entries({floating,seated,dissolveStart,dissolveEnd,smile,anatomy})
   .map(([name,{chapter,lesion,crownMix,crowns,anatomy}])=>({name,chapter,lesion,crownMix,crowns,anatomy}));
  results.push({width,height,motion,stages,errors});
  console.log(width, 'passed');
  await context.close();
 }
 await writeFile(out+'/report.json',JSON.stringify({passed:true,browser:browser.version(),results},null,2));
} finally {await browser.close();}
