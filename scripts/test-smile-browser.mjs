import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { mouseDrag, touchDrag, pinchOut, wheelOnCanvas } from './browser-camera-probes.mjs';
import { DENTAL_CHAPTERS, DENTAL_STORY, STORY_TIMING } from '../src/experience/story-config.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const url=process.env.DENTAL_STORY_TEST_URL||'http://127.0.0.1:4173/';
const out=process.env.DENTAL_STORY_REVIEW_DIR||'../professional-review/tooth-approach-review';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
const atlasIndex=DENTAL_CHAPTERS.findIndex(chapter=>chapter.id==='dentition');
const atlasAt=DENTAL_CHAPTERS[atlasIndex].at;
const [atlasChapter,assemblyChapter,heroChapter]=DENTAL_CHAPTERS;
const brushAt=DENTAL_CHAPTERS.find(chapter=>chapter.id==='brush').at;
const [dissolveFrom,dissolveTo]=STORY_TIMING.assemblyCrowns;
const dissolveAt=fraction=>dissolveFrom+(dissolveTo-dissolveFrom)*fraction;
const seatedAt=STORY_TIMING.extraction.recede[0]+.012;
const extractedAt=STORY_TIMING.extraction.lead[1]+.006;
try {
 for(const [width,height] of [[1440,900],[390,844]]) {
  const mobile=width<700;
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto(url+'?qa=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__dentalExperience?.report().assetsReady,null,{timeout:90000});
  await page.locator('#journey-startup').waitFor({state:'hidden'});
  assert.equal(await page.locator('#journey-step-number').innerText(),'01 / 07');
  assert.equal(await page.evaluate(()=>window.__dentalExperience.report().story.chapterId),'dentition');
  assert.equal(await page.locator('#journey-title').innerText(),'Celý chrup.');
  assert.equal(await page.locator('#journey-hero-explore').isVisible(),false);
  async function seek(progress) {
   await page.evaluate(p=>{const r=document.querySelector('#dental-journey').getBoundingClientRect();
    const h=document.querySelector('#journey-stage').clientHeight;
    window.scrollTo({top:scrollY+r.top+(r.height-h)*p,behavior:'instant'});},progress);
   await page.waitForFunction(p=>{const r=window.__dentalExperience.report();
    return Math.abs(r.progress-p)<.002&&Math.abs(r.renderProgress-r.storyProgress)<.00002;},progress,{timeout:15000});
  }
  const smile=await readState();
  expectMeshes(smile,28,0);
  assert.equal(smile.crownMix,1);
  assert.equal(smile.backingVisible,true);
  assert.equal(smile.backingOpacity,1);
  await page.screenshot({path:`${out}/${width}-smile.png`});

  const motion=await page.evaluate(async({start,end})=>{
   const box=document.querySelector('#dental-journey').getBoundingClientRect();
   const length=box.height-document.querySelector('#journey-stage').clientHeight,base=scrollY+box.top;
   const intervals=[];let previous=0;
   for(let i=0;i<=120;i++) {
    const time=await new Promise(requestAnimationFrame);
    if(previous)intervals.push(time-previous);
    previous=time;
    scrollTo({top:base+length*(start+(end-start)*i/120),behavior:'instant'});
   }
   intervals.sort((a,b)=>a-b);
   return {samples:intervals.length,p50Ms:intervals[60],p95Ms:intervals[114],over33ms:intervals.filter(v=>v>33.4).length};
  },{start:atlasAt,end:assemblyChapter.at});
  async function readState() {
   const state=await page.evaluate(()=>{
    const {arch,report}=window.__dentalExperience,r=report(),teeth=[...arch.teeth.values()];
    const backing=arch.object.getObjectByName('Discreet enamel-coloured smile contact backing');
    return {chapter:r.story.chapterId,crownMix:arch.crownMix,
     crowns:teeth.filter(t=>t.crown?.visible).length,anatomy:teeth.filter(t=>t.mesh?.visible).length,
     healthy:teeth.every(t=>!t.mesh.geometry.hasAttribute('lesionRegion')&&!t.mesh.geometry.morphAttributes.position?.length),
     backingVisible:backing?.visible??false,backingOpacity:backing?.material.opacity??0,
     fdis:teeth.map(t=>t.entry.fdi),matrices:teeth.map(t=>t.mesh.matrix.toArray()),
     crownMatrices:teeth.map(t=>t.crown?.matrix.toArray()),shaderErrors:r.shaderErrors};
   });
   assert.equal(state.healthy,true);
   assert.equal(state.shaderErrors,0);
   return state;
  }
  function expectMeshes(state,crowns,anatomy) {
   assert.equal(state.crowns,crowns);
   assert.equal(state.anatomy,anatomy);
  }
  async function navigateTo(selector,chapter,index) {
   const button=page.locator(selector);
   if(mobile)await button.tap();else await button.click();
   await page.waitForFunction(({id,at})=>{const r=window.__dentalExperience.report();
    return r.story.chapterId===id&&Math.abs(r.progress-at)<.002&&Math.abs(r.renderProgress-r.storyProgress)<.00002;},chapter);
   assert.equal(await page.locator('#journey-step-number').innerText(),`0${index} / 07`);
  }

  await seek(seatedAt);
  const seated=await readState();
  expectMeshes(seated,0,28);
  assert.equal(seated.crownMix,0);

  await seek(extractedAt);
  const extracted=await readState();
  expectMeshes(extracted,0,3);
  assert.equal(extracted.crownMix,0);
  assert.equal(extracted.backingVisible,false);
  assert.ok(extracted.matrices.every((matrix,i)=>{
   const fdi=extracted.fdis[i];
   if(fdi===DENTAL_STORY.fdi.hero)return matrix[12]-seated.matrices[i][12]>.4;
   return matrix.every((value,j)=>j===13&&fdi<30||Math.abs(value-seated.matrices[i][j])<1e-5);
  }), 'Only the molar moves forward; the rest remain seated while receding');

  await seek(dissolveAt(.25));
  const dissolveStart=await readState();
  expectMeshes(dissolveStart,28,28);
  assert.ok(dissolveStart.crownMix>.5&&dissolveStart.crownMix<1);
  await seek(dissolveAt(.80));
  const dissolveEnd=await readState();
  expectMeshes(dissolveEnd,28,28);
  assert.ok(dissolveEnd.crownMix>0&&dissolveEnd.crownMix<.5);

  await seek(atlasAt);
  expectMeshes(await readState(),28,0);

  await page.locator('#journey-view-anatomy').click();await page.waitForTimeout(700);
  const anatomy=await readState();
  expectMeshes(anatomy,0,28);
  assert.equal(anatomy.crownMix,0);
  assert.equal(anatomy.backingVisible,false);
  await page.screenshot({path:`${out}/${width}-anatomy.png`});
  await page.locator('#journey-view-smile').click();await page.waitForTimeout(700);
  expectMeshes(await readState(),28,0);

  await seek(dissolveAt(.25));
  const reversedDissolve=await readState();
  assert.equal(reversedDissolve.crownMix,dissolveStart.crownMix);
  await seek(extractedAt);
  const reversed=await readState();
  expectMeshes(reversed,0,3);
  assert.equal(reversed.backingVisible,false);
  for(let i=0;i<reversed.matrices.length;i++) for(let j=0;j<16;j++)
   assert.ok(Math.abs(reversed.matrices[i][j]-extracted.matrices[i][j])<1e-5,'Reverse restores the same approach transforms');
  await seek(brushAt);
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
  assert.ok(Math.abs((await page.evaluate(()=>window.__dentalExperience.report().progress))-brushAt)<.01);
  await navigateTo('.journey-step:first-child',atlasChapter,1);
  expectMeshes(await readState(),28,0);
  await navigateTo('#journey-mobile-next',assemblyChapter,2);
  expectMeshes(await readState(),0,1);
  assert.deepEqual(await page.evaluate(()=>window.__dentalExperience.report().visibleTeeth),[36]);
  assert.equal(await page.locator('#journey-view-anatomy').isVisible(),false);
  await page.screenshot({path:`${out}/${width}-single-tooth.png`});
  await navigateTo('#journey-mobile-next',heroChapter,3);
  expectMeshes(await readState(),0,1);
  assert.equal(await page.locator('#journey-hero-explore').isVisible(),true);
  assert.equal(await page.locator('#journey-view-anatomy').isVisible(),false);
  await page.waitForFunction(()=>Math.abs(window.__dentalExperience.report().heroSpin.angle)>.04);
  await navigateTo('#journey-mobile-previous',assemblyChapter,2);
  expectMeshes(await readState(),0,1);
  await navigateTo('#journey-mobile-previous',atlasChapter,1);
  expectMeshes(await readState(),28,0);
  await page.locator('#journey-view-anatomy').click();await page.waitForTimeout(700);
  expectMeshes(await readState(),0,28);
  await seek(.965);
  const calmReturn=await readState();
  assert.equal(calmReturn.crowns,0);
  assert.ok(calmReturn.anatomy>3,'The closing reveal progressively brings back the rooted arch');
  for(let i=0;i<calmReturn.matrices.length;i++) {
    const seated=anatomy.matrices[i], current=calmReturn.matrices[i];
    assert.ok(current.every((value,index)=>index===13||Math.abs(value-seated[index])<1e-5),
      'Closing uses the rooted seats with only the vertical jaw adjustment');
  }
  await seek(1);
  const closing=await readState();
  expectMeshes(closing,28,0);
  assert.equal(closing.chapter,'brush');
  assert.equal(closing.crownMix,1,'The last smile does not depend on the selected atlas view');
  assert.deepEqual(closing.crownMatrices,smile.crownMatrices,'Both smiles use the same approved crown seating');
  await page.screenshot({path:`${out}/${width}-zaverecny-usmev.png`});
  assert.deepEqual(errors,[]);
  const stages=Object.entries({seated,extracted,dissolveStart,dissolveEnd,smile,anatomy,calmReturn,closing})
   .map(([name,{chapter,crownMix,crowns,anatomy}])=>({name,chapter,crownMix,crowns,anatomy}));
  results.push({width,height,motion,stages,errors});
  console.log(width, 'passed');
  await context.close();
 }
 await writeFile(out+'/report.json',JSON.stringify({passed:true,browser:browser.version(),results},null,2));
} finally {await browser.close();}
