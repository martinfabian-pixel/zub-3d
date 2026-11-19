import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { angular, cameraProbe, mouseDrag, nativeJump, restingRaster, touchDrag } from './browser-camera-probes.mjs';
import { DENTAL_CHAPTERS, STORY_TIMING, brushProgress } from '../src/experience/story-config.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const url=new URL(process.env.DENTAL_STORY_TEST_URL||'http://127.0.0.1:4173/');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
url.searchParams.set('qa','1');
const output=process.env.DENTAL_STORY_REVIEW_DIR;
if(output)await mkdir(output,{recursive:true});
const stage=id=>DENTAL_CHAPTERS.find(c=>c.id===id).at;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const mobile of [false,true]){
    const viewport=mobile?{width:390,height:844}:{width:1440,height:900};
    const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1});
    try{
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      const read=()=>page.evaluate(()=>window.__dentalExperience.report());
      const camera=()=>cameraProbe(page);
      async function seek(at){
        await nativeJump(page,at);
        await page.waitForFunction(p=>{
          const r=window.__dentalExperience.report();
          return Math.abs(r.progress-p)<.002 && r.renderProgress===r.storyProgress && !r.view.returning;
        },at);
      }
      async function capture(name){
        if(!output)return;
        await restingRaster(page);
        await page.screenshot({path:join(output,(mobile?'mobile-':'desktop-')+name+'.jpg'),quality:94,scale:'css'});
      }
      await page.goto(url.href,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__dentalExperience?.report().assetsReady,null,{timeout:100000});
      await page.locator('#journey-startup').waitFor({state:'hidden'});
      assert.equal((await read()).crownMix,1);
      if(!mobile)await capture('usmev');
      await seek(stage('assembly'));
      const locating=await read();
      assert.equal(locating.visibleTeeth.length,28);
      assert.ok(locating.annotations.labels.find(label=>label.id==='molar')?.visible,'FDI 36 is labeled in the arch');
      await seek(stage('hero'));
      const windowState=await read();
      assert.equal(windowState.story.tissueWindow,1);
      assert.deepEqual(windowState.visibleTeeth,[35,36,37]);
      const seated=windowState.teeth.filter(t=>[35,36,37].includes(t.fdi));
      if(!mobile)await capture('korene');
      const halfway=STORY_TIMING.anatomy.dentin.reduce((sum,p)=>sum+p,0)/2;
      await seek(halfway);
      const partial=await read(),before=await camera();
      assert.ok(partial.healthyAnatomy.amount>1.35&&partial.healthyAnatomy.amount<1.65);
      if(mobile)await touchDrag(context,page,82,0);
      else await mouseDrag(page,120,12);
      const turned=await camera();
      assert.ok(angular(before.quat,turned.quat)>.2,'The partially cut tooth can be examined from the side');
      assert.equal((await read()).healthyAnatomy.amount,partial.healthyAnatomy.amount);
      const workingAt=brushProgress(.62);
      for(const at of [.53,.56,.581,.60,.624,stage('space'),stage('plaque'),.80,workingAt])await seek(at);
      const working=await read();
      assert.equal(working.healthyAnatomy.cut,0);
      assert.equal(working.story.cleaningWindow,1);
      assert.ok(working.story.brush.visible&&working.story.brush.bentFilaments>0);
      const targetError=await page.evaluate(()=>{
        const app=window.__dentalExperience;
        const nearest=app.path.nearest(app.rig.pose.target);
        return nearest.distanceMm;
      });
      assert.ok(targetError<.01,'Camera target lies on the surveyed wire centerline: '+targetError+' mm');
      for(const tooth of seated)assert.deepEqual(tooth.worldMatrix,working.teeth.find(t=>t.fdi===tooth.fdi).worldMatrix);
      await capture('kefka');
      await seek(1);
      assert.equal((await read()).crownMix,1);
      for(const at of [.965,.92,workingAt,.790,.73,.65,.60,stage('anatomy')])await seek(at);
      assert.equal((await read()).healthyAnatomy.layer,'pulp');
      await capture('rez');
      for(const at of [halfway,.475,.435,stage('hero'),.29,stage('assembly'),.165,.13,0])await seek(at);
      const returned=await read();
      assert.equal(returned.crownMix,1);
      assert.equal(returned.story.tissueWindow,0);
      assert.equal(returned.story.cleaningWindow,0);
      assert.equal(returned.healthyAnatomy.cut,0);
      assert.equal(returned.shaderErrors,0);
      assert.deepEqual(errors,[]);
      console.log('Verified seat, cut rotation, approach, contact and reverse at '+viewport.width+'×'+viewport.height+
        '; centerline distance '+targetError.toFixed(4)+' mm; '+working.story.brush.bentFilaments+' bent filaments.');
    }finally{await context.close();}
  }
}finally{await browser.close();}
