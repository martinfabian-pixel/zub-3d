import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { nativeJump, restingRaster, touchDrag } from './browser-camera-probes.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
url.searchParams.set('qa', '1');
const out = process.env.DENTAL_STORY_REVIEW_DIR;
if (out) await mkdir(out, {recursive:true});
const angles = [
  ['front', 0, 0], ['three-quarter-left', 47, 5], ['left', 91, 8], ['back-left', 137, 15],
  ['back-right', -137, 15], ['right', -91, 8], ['three-quarter-right', -47, 5],
];
const browser = await chromium.launch({channel:'chrome',headless:true});
const results = [], captures = [];

// Two synchronous renders from the exact same camera. In the ID pass every
// other surface still writes depth, including the gingiva and arch backing.
// Only pure interior ID pixels enter each tooth's brightness distribution.
function measureVisibleCrowns() {
  const {scene, renderer, rig, arch} = window.__dentalExperience;
  const canvas = document.createElement('canvas');
  canvas.width=renderer.domElement.width; canvas.height=renderer.domElement.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  function pixels(){
    renderer.render(scene,rig.camera);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(renderer.domElement,0,0);
    return ctx.getImageData(0,0,canvas.width,canvas.height).data;
  }
  const beauty = pixels();
  const originals=[], ids=new Map();
  for(const [fdi,item] of arch.teeth)ids.set(item.crown,fdi);
  const flat=arch.landmarks.hero().material;
  const markers=new Map();
  function marker(fdi,side){
    const key=fdi*4+side;
    if(!markers.has(key)){
      const material=flat.clone();
      material.color.setHex(fdi?((fdi*5)<<16)+(77<<8)+181:0);
      material.side=side; material.toneMapped=false;material.fog=false;
      markers.set(key,material);
    }
    return markers.get(key);
  }
  let mask;
  const shadows=renderer.shadowMap.autoUpdate;
  try{
    renderer.shadowMap.autoUpdate=false;
    scene.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      const original=mesh.material, fdi=ids.get(mesh)||0;
      originals.push([mesh,original]);
      mesh.material=Array.isArray(original)?original.map(m=>marker(fdi,m.side)):marker(fdi,original.side);
    });
    mask=pixels();
  }finally{
    for(const [mesh,material] of originals)mesh.material=material;
    renderer.shadowMap.autoUpdate=shadows;
    renderer.render(scene,rig.camera);
    for(const material of markers.values())material.dispose();
  }
  const {width,height}=canvas, histograms=new Map();
  for(let y=2;y<height-2;y+=2)for(let x=2;x<width-2;x+=2){
    const i=(y*width+x)*4,fdi=Math.round(mask[i]/5), code=fdi*5;
    if(!arch.teeth.has(fdi))continue;
    if(![0,-8,8,-8*width,8*width].every(d=>mask[i+d]===code && Math.abs(mask[i+d+1]-77)<=1 &&
      Math.abs(mask[i+d+2]-181)<=1 && mask[i+d+3]===255))continue;
    const luma=Math.round(.2126*beauty[i]+.7152*beauty[i+1]+.0722*beauty[i+2]);
    let histogram=histograms.get(fdi);
    if(!histogram){histogram=new Uint32Array(256);histograms.set(fdi,histogram);}
    histogram[luma]++;
  }
  const scale=renderer.domElement.width/renderer.domElement.clientWidth;
  const rows=[];
  for(const [fdi,h] of histograms){
    const n=h.reduce((a,b)=>a+b,0), area=Math.round(n*4/(scale*scale));
    if(area<110)continue;
    const percent=q=>{let count=0;return h.findIndex(v=>(count+=v)>=q*n);};
    rows.push({fdi,area,p10:percent(.1),median:percent(.5),p90:percent(.9)});
  }
  return rows.sort((a,b)=>a.fdi-b.fdi);
}

try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url.href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__dentalExperience?.report().assetsReady,null,{timeout:120000});
  await page.locator('#journey-startup').waitFor({state:'hidden'});
  for(const progress of [0,1]){
    if(progress===1){
      await page.locator('#journey-explore').tap();
      await nativeJump(page,progress);
    }
    await page.waitForFunction(p=>{
      const s=window.__dentalExperience.report();
      return s.crownMix===1 && s.renderProgress===s.storyProgress && Math.abs(s.renderProgress-p)<.0002 && !s.exploring;
    },progress);
    if(out){
      await restingRaster(page);
      const name=progress===0?'front':'final-smile-front';
      const buffer=await page.screenshot({path:resolve(out,name+'.png'),scale:'css'});
      if(progress===0)captures.push({name,data:'data:image/png;base64,'+buffer.toString('base64')});
    }
    await page.locator('#journey-explore').tap();
    const frozen=await page.evaluate(()=>window.__dentalExperience.report().renderProgress);
    for(const [name,degrees,elevation] of angles){
      for(let step=0;step<12;step++){
        const {yaw,pitch}=await page.evaluate(()=>window.__dentalExperience.report().view);
        const deltaYaw=Math.atan2(Math.sin(degrees*Math.PI/180-yaw),Math.cos(degrees*Math.PI/180-yaw));
        const deltaPitch=elevation*Math.PI/180-pitch;
        if(Math.max(Math.abs(deltaYaw),Math.abs(deltaPitch))<.045)break;
        const px=844/(2*Math.PI*.65);
        await touchDrag(context,page,-deltaYaw*px,-deltaPitch*px);
      }
      await restingRaster(page);
      const actual=await page.evaluate(()=>{
        const s=window.__dentalExperience.report();
        return {yaw:s.view.yaw,pitch:s.view.pitch,progress:s.renderProgress};
      });
      const diff=actual.yaw-degrees*Math.PI/180;
      assert.ok(Math.abs(Math.atan2(Math.sin(diff),Math.cos(diff)))<.06 && Math.abs(actual.pitch-elevation*Math.PI/180)<.06,
        'Touch drag reached '+name+': '+JSON.stringify(actual));
      assert.equal(actual.progress,frozen,'Touch exploration preserves the seated smile');
      const teeth=await page.evaluate(measureVisibleCrowns);
      assert.ok(teeth.length>=6,'ID pass sees the individual seated crowns');
      const chapter=progress===0?'01':'07';
      results.push({chapter,name,degrees,teeth});
      console.log(chapter,name,teeth.map(t=>t.fdi+'='+t.median).join(' '));
      if(out && chapter==='01' && ['three-quarter-left','left','back-right'].includes(name)){
        const buffer=await page.screenshot({path:resolve(out,name+'.png'),scale:'css'});
        captures.push({name,data:'data:image/png;base64,'+buffer.toString('base64')});
      }
    }
  }
  assert.deepEqual(errors,[]);
  if(out){
    await writeFile(resolve(out,'brightness.json'),JSON.stringify(results,null,2));
    const sheet=await page.evaluate(async sources=>{
      const canvas=document.createElement('canvas');
      canvas.width=390*sources.length;canvas.height=844;
      const ctx=canvas.getContext('2d');
      for(const [i,source] of sources.entries()){
        const image=new Image();image.src=source.data;await image.decode();ctx.drawImage(image,i*390,0);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    },captures);
    await writeFile(resolve(out,'smile-orbit.png'),Buffer.from(sheet,'base64'));
  }
  for(const {chapter,name,degrees,teeth} of results){
    const incisors=teeth.filter(t=>t.fdi%10<=2);
    const molars=teeth.filter(t=>t.fdi%10>=6);
    if(degrees===0){
      assert.ok(incisors.length>=6,'The front photograph includes both rows of incisors');
      for(const tooth of incisors){
        assert.ok(tooth.median>=228 && tooth.p90>=240 && tooth.p90-tooth.p10>=7,
          chapter+' '+name+' FDI '+tooth.fdi+' needs white enamel with a visible highlight and contour: '+JSON.stringify(tooth));
      }
    }
    if(Math.abs(degrees)>=85){
      assert.ok(molars.length>=3,'Each lateral view includes the back molars');
      const broadFaces=molars.sort((a,b)=>b.area-a.area).slice(0,2);
      for(const tooth of broadFaces){
        assert.ok(tooth.median>=225 && tooth.p10>=195 && tooth.p90-tooth.p10>=7,
          chapter+' '+name+' FDI '+tooth.fdi+' needs bright, shaded enamel across its visible molar face: '+JSON.stringify(tooth));
      }
    }
    for(const tooth of teeth){
      assert.ok(tooth.median>=196,chapter+' '+name+' FDI '+tooth.fdi+' has a grey exposed face: '+JSON.stringify(tooth));
    }
  }
}finally{await browser.close();}
