import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { mouseDrag, touchDrag, pinchOut, wheelOnCanvas } from './browser-camera-probes.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const url=process.env.DENTAL_STORY_TEST_URL||'http://127.0.0.1:4173/';
const out=process.env.DENTAL_STORY_REVIEW_DIR||'../professional-review/crown-finale-final';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try {
 for(const [width,height] of [[1440,900],[390,844],[360,800]]) {
  const mobile=width<700;
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto(url+'?qa=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__dentalExperience?.report().assetsReady,null,{timeout:90000});
  const motion=await page.evaluate(async()=>{
   const app=window.__dentalExperience,box=document.querySelector('#dental-journey').getBoundingClientRect();
   const length=box.height-document.querySelector('#journey-stage').clientHeight,base=scrollY+box.top;
   const intervals=[];let previous=0;
   for(let i=0;i<=120;i++) {
    const time=await new Promise(requestAnimationFrame);
    if(previous)intervals.push(time-previous);
    previous=time;
    scrollTo({top:base+length*i/120,behavior:'instant'});
   }
   intervals.sort((a,b)=>a-b);
   return {samples:intervals.length,p50Ms:intervals[60],p95Ms:intervals[114],over33ms:intervals.filter(v=>v>33.4).length};
  });
  async function seek(progress) {
   await page.evaluate(p=>{const r=document.querySelector('#dental-journey').getBoundingClientRect();
    const h=document.querySelector('#journey-stage').clientHeight;
    window.scrollTo({top:scrollY+r.top+(r.height-h)*p,behavior:'instant'});},progress);
   await page.waitForFunction(p=>{const r=window.__dentalExperience.report();
    return Math.abs(r.progress-p)<.002&&Math.abs(r.renderProgress-r.storyProgress)<.00002;},progress,{timeout:15000});
  }
  const states=[];
  for(const [name,progress] of [['brush',.62],['result',.76],['floating',.85],['smile',.98]]) {
   await seek(progress);await page.waitForTimeout(200);
   const state=await page.evaluate(()=>{const a=window.__dentalExperience,r=a.report();
    return {chapter:r.story.chapterId,lesion:r.story.lesionProgress,crowns:[...a.arch.teeth.values()].filter(t=>t.crown?.visible).length,
     anatomy:[...a.arch.teeth.values()].filter(t=>t.mesh?.visible).length,matrices:[...a.arch.teeth.values()].map(t=>t.mesh.matrix.toArray())};});
   assert.equal(state.lesion,1);
   if(name==='smile'){assert.equal(state.crowns,28);assert.equal(state.anatomy,0);}
   if(name==='floating')assert.equal(state.crowns,28);
   states.push({name,...state});
   await page.screenshot({path:`${out}/${width}-${name}.png`});
  }
  await page.locator('#journey-view-anatomy').click();await page.waitForTimeout(700);
  const anatomy=await page.evaluate(()=>{const a=window.__dentalExperience;
   return {crowns:[...a.arch.teeth.values()].filter(t=>t.crown?.visible).length,anatomy:[...a.arch.teeth.values()].filter(t=>t.mesh?.visible).length};});
  assert.equal(anatomy.crowns,0);assert.equal(anatomy.anatomy,28);
  await page.screenshot({path:`${out}/${width}-anatomy.png`});
  await page.locator('#journey-view-smile').click();await page.waitForTimeout(700);
  await seek(.85);
  const reversed=await page.evaluate(()=>[...window.__dentalExperience.arch.teeth.values()].map(t=>t.mesh.matrix.toArray()));
  for(let i=0;i<reversed.length;i++) for(let j=0;j<16;j++)
   assert.ok(Math.abs(reversed[i][j]-states[2].matrices[i][j])<1e-5,'Reverse restores the same transforms');
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
  assert.deepEqual(errors,[]);
  results.push({width,height,motion,stages:states.map(({name,chapter,lesion,crowns,anatomy})=>({name,chapter,lesion,crowns,anatomy})),anatomy,errors});
  console.log(width, 'passed');
  await context.close();
 }
 await writeFile(out+'/report.json',JSON.stringify({passed:true,browser:browser.version(),results},null,2));
} finally {await browser.close();}
