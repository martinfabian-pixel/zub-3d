// End-to-end checks use the real scene, pointer gestures and measured path.
// Phone dimensions and touch are emulated; this is not an iPhone Safari test.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const url=process.env.DENTAL_STORY_TEST_URL||'http://127.0.0.1:4173/';
const out=process.env.DENTAL_STORY_REVIEW_DIR;
if(out)await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const cases=[[390,844,true],[1440,900,false]].filter(([, ,mobile])=>
    (process.env.MANUAL_CLEANING_MOBILE_ONLY!=='1'||mobile)&&
    (process.env.MANUAL_CLEANING_DESKTOP_ONLY!=='1'||!mobile));
  for(const [width,height,mobile] of cases) {
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
    try {
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const cdp=mobile?await context.newCDPSession(page):null;
      const state=()=>page.evaluate(()=>window.__dentalExperience.report());
      const wait=predicate=>page.waitForFunction(predicate,null,{timeout:20000});
      await page.goto(new URL('?qa=1',url).href);
      await wait(()=>window.__dentalExperience?.report().assetsReady);
      await page.locator('.journey-step').nth(4).click();
      await wait(()=>{const s=window.__dentalExperience.report();return s.story.chapterId==='brush'&&Math.abs(s.renderProgress-s.storyProgress)<.00002;});
      if(!mobile) {
        // The saved view can be the visitor's own orbit, not just the default.
        await page.mouse.move(width*.55,height*.7);await page.mouse.down();
        await page.mouse.move(width*.55+48,height*.7+10,{steps:6});await page.mouse.up();
        await page.waitForTimeout(600);
        assert.ok(Math.abs((await state()).view.desiredYaw)>.01,'Desktop orbit changes the view');
      }
      const before=await state(),scrollBefore=await page.evaluate(()=>window.scrollY);
      await page.locator('.manual-cleaning-start').click();
      await wait(()=>window.__dentalExperience.report().manualCleaning?.transition==='active');
      let s=await state();
      assert.equal(s.manualCleaning.phase,'ready');
      assert.equal(s.manualCleaning.cleaningProgress,0);
      assert.equal(s.story.caries.morphInfluence,0);
      if(out&&mobile)await page.screenshot({path:`${out}/01-before.png`});
      const axis=await page.evaluate(()=>{
        const e=window.__dentalExperience,path=e.path,camera=e.rig.camera,rect=document.querySelector('canvas').getBoundingClientRect();
        const a=path.sample(path.tipArcMm(0,0)).position.clone().project(camera);
        const b=path.sample(path.tipArcMm(1,1)).position.clone().project(camera);
        return {x:(b.x-a.x)*rect.width*.5,y:-(b.y-a.y)*rect.height*.5};
      });
      async function drag(fraction) {
        const box=await page.locator('.manual-cleaning-grip').boundingBox();
        assert.ok(box,'The grip is available while brushing');
        const x=box.x+box.width/2,y=box.y+box.height/2;
        let dx=axis.x*fraction,dy=axis.y*fraction,scale=1;
        for(const [start,delta,limit] of [[x,dx,width],[y,dy,height]]) {
          if(delta>0)scale=Math.min(scale,(limit-2-start)/delta);
          if(delta<0)scale=Math.min(scale,(start-2)/-delta);
        }
        assert.ok(scale>0,'A touch starts inside the viewport');dx*=scale;dy*=scale;
        assert.ok(x+dx>=1&&x+dx<width&&y+dy>=1&&y+dy<height,'All pointer coordinates stay on screen');
        if(mobile) {
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
          for(let i=1;i<=4;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/4,y:y+dy*i/4,id:1}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        } else {
          await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:4});await page.mouse.up();
        }
        await page.waitForTimeout(90);
      }
      // A touch alone must not remove plaque.
      await drag(0);assert.equal((await state()).manualCleaning.cleaningProgress,0);
      async function moveTo(destination) {
        for(let i=0;i<70;i++) {
          const current=(await state()).manualCleaning;
          if(current.phase==='result'||Math.abs(current.target-destination)<.02)return;
          await drag(Math.sign(destination-current.target)*Math.min(.07,Math.abs(destination-current.target)));
        }
        throw new Error('The projected brush grip could not reach its limit within the viewport');
      }
      await moveTo(.55);await page.waitForTimeout(300);
      if(out&&mobile)await page.screenshot({path:`${out}/02-cleaning.png`});
      await moveTo(1);await page.waitForTimeout(300);s=await state();
      assert.ok(s.manualCleaning.position>.96,'Dragging inserts the brush');
      assert.ok(s.manualCleaning.cleaningProgress>0,'Actual travel cleans reachable plaque');
      assert.ok(Math.abs(s.storyProgress-before.storyProgress)<.004,'Manual cleaning freezes the story');
      assert.ok(Math.abs((await page.evaluate(()=>window.scrollY))-scrollBefore)<1,'Dragging the grip does not scroll the page');
      for(let pass=0;pass<4&&(await state()).manualCleaning.phase!=='result';pass++) {await moveTo(0);await moveTo(1);}
      s=await state();assert.equal(s.manualCleaning.phase,'result');assert.ok(s.manualCleaning.passes>=3);
      assert.ok(s.story.plaque.cleaningProgress>0);
      if(out&&mobile){await page.waitForTimeout(500);await page.screenshot({path:`${out}/03-result.png`});}
      await page.locator('.manual-cleaning-repeat').click();
      await wait(()=>window.__dentalExperience.report().manualCleaning?.phase==='ready');
      assert.equal((await state()).manualCleaning.cleaningProgress,0);
      await page.locator('.manual-cleaning-exit').click();
      await wait(()=>window.__dentalExperience.report().manualCleaning===null);
      s=await state();assert.ok(Math.abs(s.storyProgress-before.storyProgress)<.004);assert.equal(s.story.chapterId,'brush');
      const distance=(a,b)=>Math.hypot(...a.map((value,i)=>value-b[i]));
      assert.ok(distance(s.camera,before.camera)<.04,'The camera returns to its previous position');
      assert.ok(distance(s.target,before.target)<.04,'The camera returns to its previous orientation');
      await page.locator('.journey-step').last().click();
      await wait(()=>{const s=window.__dentalExperience.report();return s.story.chapterId==='dentition'&&s.crownMix===1;});
      await page.locator('.journey-step').nth(4).click();
      await wait(()=>{const s=window.__dentalExperience.report();return s.story.chapterId==='brush'&&Math.abs(s.renderProgress-s.storyProgress)<.00002;});
      assert.deepEqual(errors,[]);
      console.log(`Manual cleaning passed: ${width}×${height}, ${mobile?'emulated touch':'mouse'}`);
      await cdp?.detach();
    } finally {await context.close();}
  }
} finally {await browser.close();}
