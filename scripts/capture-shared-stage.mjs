// Matched production captures. Use the same checkout's preview and the same
// progress positions for before/after comparisons. No camera setter is used.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { nativeJump, restingRaster, cameraProbe, projectedFootprints } from './browser-camera-probes.mjs';
import { measureSharedStage } from './shared-stage-probes.mjs';
import { DENTAL_CHAPTERS, STORY_TIMING } from '../src/experience/story-config.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const output = process.argv[2];
if (!output) throw Error('Pass the capture output directory.');
await mkdir(output, { recursive:true });
const base = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
if (!['127.0.0.1','localhost','[::1]'].includes(base.hostname)) throw Error('Use a loopback preview.');
const chapters = DENTAL_CHAPTERS.map(({id,at})=>[id,at])
  .concat([['result',STORY_TIMING.resultAt],['closing',1]]);
const sizes=(process.env.DENTAL_STORY_CAPTURE_SIZES||'1440x900,390x844,360x800').split(',').map(text=>{
  const match=/^(\d{3,4})x(\d{3,4})$/.exec(text.trim());
  if(!match)throw Error('DENTAL_STORY_CAPTURE_SIZES must list WIDTHxHEIGHT pairs.');
  return match.slice(1).map(Number);
});
const browser = await chromium.launch({ channel:'chrome', headless:true });
const report = { browser:browser.version(), url:base.href, frames:[], errors:[] };
try {
  for (const [width,height] of sizes) {
    const mobile=width<600;
    const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
    const page=await ctx.newPage();
    page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto(new URL('?qa=1',base).href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__dentalExperience?.report().assetsReady,null,{timeout:60000});
    for(const [chapter,progress] of chapters) {
      await nativeJump(page,progress);
      await page.waitForTimeout(360);
      await restingRaster(page);
      const bytes=await page.screenshot({path:resolve(output,`${width}x${height}-${chapter}.png`),scale:'css'});
      const frame=await page.evaluate(()=>{
        const canvas=document.querySelector('#journey-canvas');
        const rect=canvas.getBoundingClientRect();
        const scripts=performance.getEntriesByType('resource').map(e=>new URL(e.name).pathname).filter(p=>/\/assets\/main-[^/]+\.js$/.test(p));
        return {bundle:scripts.at(-1),heading:document.querySelector('h1')?.innerText,
          counter:document.querySelector('#journey-step-number')?.textContent,
          canvas:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
      });
      const stageAudit=await measureSharedStage(page);
      const annotations=await page.evaluate(()=>window.__dentalExperience.annotations?.report()??null);
      report.frames.push({chapter,progress,width,height,...frame,sha256:createHash('sha256').update(bytes).digest('hex'),
        camera:await cameraProbe(page),projected:await projectedFootprints(page),stageAudit,annotations});
      console.log(width,chapter,frame.bundle);
    }
    await ctx.close();
    await writeFile(resolve(output,'capture.json'),JSON.stringify(report,null,2)+'\n');
  }
} finally {await browser.close();}
if (report.errors.length) throw Error(JSON.stringify(report.errors));
