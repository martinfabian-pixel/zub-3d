import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { angular, cameraProbe, distance, mouseDrag, nativeJump, projectedFootprints, restingRaster, touchDrag } from './browser-camera-probes.mjs';
import { DENTAL_CHAPTERS, STORY_TIMING, brushProgress } from '../src/experience/story-config.js';
import { recordMolarTransition } from './record-molar-transition.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const url=new URL(process.env.DENTAL_STORY_TEST_URL||'http://127.0.0.1:4173/');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
url.searchParams.set('qa','1');
const output=process.env.DENTAL_STORY_REVIEW_DIR;
if(output)await mkdir(output,{recursive:true});
const stage=id=>DENTAL_CHAPTERS.find(c=>c.id===id).at;
// Hide only DOM chrome. Keep the same canvas, camera, responsive crop, stage
// gradient, material state and native scrolling as the visitor sees.
const reviewStyle=`
  #journey-stage > :not(.view-shell), #journey-status, .skip-link { opacity: 0 !important; pointer-events: none !important; }
  #journey-canvas { outline: none !important; }
  html { scrollbar-width: none; }
`;
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
      async function withoutInterface(run){
        const sheet=await page.addStyleTag({content:reviewStyle});
        try {await restingRaster(page);await run();}
        finally {await sheet.evaluate(el=>el.remove());}
      }
      async function capture(name){
        if(!output||!mobile)return;
        await withoutInterface(()=>page.screenshot({path:join(output,name+'.png'),scale:'css'}));
      }
      await page.goto(url.href,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__dentalExperience?.report().assetsReady,null,{timeout:100000});
      await page.locator('#journey-startup').waitFor({state:'hidden'});
      assert.equal((await read()).crownMix,1);
      await capture('01-usmev');
      await seek(stage('assembly'));
      const locating=await read();
      assert.equal(locating.visibleTeeth.length,28);
      assert.ok(locating.annotations.labels.find(label=>label.id==='molar')?.visible,'FDI 36 is labeled in the arch');
      const matrix=(state,fdi)=>state.teeth.find(tooth=>tooth.fdi===fdi).worldMatrix;
      const seat=matrix(locating,36);
      const lift=state=>Math.hypot(...[12,13,14].map(i=>matrix(state,36)[i]-seat[i]));
      await seek(.29);
      const rising=await read();
      await seek(stage('hero'));
      const detail=await read();
      assert.ok(lift(rising)>.05&&lift(rising)<lift(detail)-.05,'36 travels out of its native seat');
      assert.ok(lift(detail)>.6,'The fully extracted molar has traveled into foreground');
      assert.deepEqual(detail.visibleTeeth,[36]);
      const exteriorCamera=await camera();
      if(mobile){
        const {geometry}=await projectedFootprints(page);
        assert.ok(geometry.left>24&&geometry.right<viewport.width-24&&geometry.top>24&&geometry.bottom<viewport.height-48,
          'The isolated crown and both root tips have space on the portrait sensor');
      }
      await capture('02-sestka');
      const halfway=STORY_TIMING.anatomy.dentin.reduce((sum,p)=>sum+p,0)/2;
      await seek(halfway);
      const partial=await read(),before=await camera();
      assert.deepEqual(matrix(partial,36),matrix(detail,36),'Section stays on the same extracted tooth');
      assert.ok(distance(exteriorCamera.pos,before.pos)<.001&&angular(exteriorCamera.quat,before.quat)<.001&&
        Math.abs(detail.composition.opticalZoom-partial.composition.opticalZoom)<.001,'The longitudinal cut opens in the exterior shot');
      assert.ok(partial.healthyAnatomy.amount>1.35&&partial.healthyAnatomy.amount<1.65);
      if(mobile)await touchDrag(context,page,82,0);
      else await mouseDrag(page,120,12);
      const turned=await camera();
      assert.ok(angular(before.quat,turned.quat)>.2,'The partially cut tooth can be examined from the side');
      assert.equal((await read()).healthyAnatomy.amount,partial.healthyAnatomy.amount);
      const workingAt=brushProgress(.62);
      for(const at of [.53,.56,.581,.60,.624,stage('space'),stage('plaque')])await seek(at);
      const film=await read();
      assert.equal(film.story.brush.visible,false);
      assert.ok(film.story.plaque.visible&&film.story.plaqueDeposition>.99);
      await seek(.80);
      await seek(workingAt);
      const working=await read();
      assert.equal(working.healthyAnatomy.cut,0);
      assert.ok(working.story.brush.visible&&working.story.brush.bentFilaments>0);
      const targetError=await page.evaluate(()=>{
        const app=window.__dentalExperience;
        const nearest=app.path.nearest(app.rig.pose.target);
        return nearest.distanceMm;
      });
      assert.ok(targetError<.01,'Camera target lies on the surveyed wire centerline: '+targetError+' mm');
      for(const fdi of [35,36,37])assert.deepEqual(matrix(working,fdi),matrix(locating,fdi));
      await capture('04-kefka');
      const workingCamera=await camera();
      await seek(STORY_TIMING.resultAt);
      assert.equal((await read()).story.brush.visible,false);
      assert.ok(angular(workingCamera.quat,(await camera()).quat)<.13,'The contact remains in view after withdrawal');
      await seek(1);
      assert.equal((await read()).crownMix,1);
      for(const at of [.965,.92,workingAt,.790,.73,.65,.60,stage('anatomy')])await seek(at);
      assert.equal((await read()).healthyAnatomy.layer,'pulp');
      for(const [layer,amount] of [['dentin',2],['pulp',3]]){
        await page.locator('.healthy-anatomy-layer[data-layer="'+layer+'"]').click();
        await page.waitForFunction(goal=>window.__dentalExperience.report().healthyAnatomy.amount===goal,amount);
      }
      const pulpLabel=page.locator('#healthy-anatomy [data-annotation-id="pulp"][data-active]');
      await pulpLabel.waitFor({state:'visible'});
      assert.ok(await page.locator('#journey-annotations [data-leader-for="pulp"][data-active]:not([hidden])').count());
      assert.equal(await page.locator('#healthy-anatomy [data-anatomy-annotation]:not([hidden],[data-active],[data-secondary])').count(),0);
      await page.locator('.healthy-anatomy-follow').click();
      await page.waitForFunction(()=>!window.__dentalExperience.report().healthyAnatomy.manual);
      await capture('03-rez');
      for(const at of [halfway,.475,.435,stage('hero'),.29,stage('assembly'),.165,.13,0])await seek(at);
      const returned=await read();
      assert.equal(returned.crownMix,1);
      assert.equal(returned.story.toothExtraction,0);
      assert.equal(returned.healthyAnatomy.cut,0);
      assert.equal(returned.shaderErrors,0);
      assert.deepEqual(errors,[]);
      if(mobile&&output&&process.env.FFMPEG_PATH){
        await seek(stage('hero'));
        await withoutInterface(()=>recordMolarTransition(page,join(output,'sestka-ku-kefke.mp4'),process.env.FFMPEG_PATH));
      }
      console.log('Verified extraction, cut rotation, reseating, brush contact and reverse at '+viewport.width+'×'+viewport.height+
        '; centerline distance '+targetError.toFixed(4)+' mm; '+working.story.brush.bentFilaments+' bent filaments.');
    }finally{await context.close();}
  }
}finally{await browser.close();}
