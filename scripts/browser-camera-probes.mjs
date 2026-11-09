// Real user inputs for the localhost-only WebGL test runner. These helpers do
// not reposition the camera, change story state, dispatch synthetic DOM mouse
// events, or read Three.js controls' requested angles instead of the live view.
const canvas = '#journey-canvas';
export const distance = (a,b) => Math.hypot(...a.map((x,i)=>x-b[i]));
export const angular = (a,b) => 2*Math.acos(Math.min(1,Math.abs(a.reduce((s,x,i)=>s+x*b[i],0))));
export const zoomTravel = (from,to) => to.pos.reduce((s,x,i)=>s+(x-from.pos[i])*from.direction[i],0);

export async function cameraProbe(page) {
  return page.evaluate(()=>{
    const app=window.__dentalExperience,r=app.report(),cam=app.rig.camera,el=document.querySelector('#journey-canvas');
    const s=r.story??{}, tooth=app.arch.teeth.get(36)?.mesh;
    cam.updateMatrixWorld(true); const d=cam.getWorldDirection(cam.position.clone());
    const section=document.querySelector('#dental-journey').getBoundingClientRect(), height=document.querySelector('#journey-stage').getBoundingClientRect().height;
    const manual=r.view??r.manualCamera??r.cameraControl??null;
    const button=document.querySelector('#journey-explore');
    return {pos:cam.position.toArray(),quat:cam.quaternion.toArray(),direction:d.toArray(),target:r.target??app.rig.target.toArray(),
      yaw:Math.atan2(d.x,d.z),pitch:Math.asin(Math.max(-1,Math.min(1,d.y))),manual,
      mode:r.mode??(r.exploring?'free':'presentation'),free:button?.getAttribute('aria-pressed')==='true',
      finalView:r.finalView,closureCm:r.closureCm,
      mask:el.style.maskImage,computedMask:getComputedStyle(el).maskImage,
      raster:{dpr:app.renderer.getPixelRatio(),fullDpr:app.profile.pixelRatio,buffer:[el.width,el.height],frame:app.renderer.info.render.frame,rect:el.getBoundingClientRect().toJSON()},
      nativeY:scrollY,nativeP:-section.top/Math.max(1,section.height-height),reportedP:r.progress,
      touchAction:getComputedStyle(el).touchAction,pageScale:visualViewport?.scale??1,draws:app.renderer.info.render.frame,
      story:{chapter:s.chapterId,evaluated:s.sceneProgress,lesion:s.lesionProgress,influence:tooth?.morphTargetInfluences?.[0]??0,
        deposition:s.plaqueDeposition,clean:s.cleaningProgress,removed:s.plaque?.patches?.map(x=>x.currentWeightedRemoval)??[],
        brush:s.brushPose?{...s.brushPose}:null,tip:s.brush?.tipWorld??null,visible:[...r.visibleTeeth].sort((a,b)=>a-b),
        pose36:tooth?.matrixWorld.toArray()??null}};
  });
}

// Pixel A/B comparisons must not straddle a quality restore or an animation
// whose final pose is numerically close but rasterizes on different edges.
export async function restingRaster(page) {
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const a=window.__dentalExperience,c=document.querySelector('#journey-canvas'),start=performance.now();let frame=-1,since=start;
    function observe(now){const next=a.renderer.info.render.frame,ratio=a.renderer.getPixelRatio();
      if(next!==frame||ratio!==a.profile.pixelRatio||a.report().view?.returning){frame=next;since=now;}
      if(now-since>=250){resolve({frame,dpr:ratio,fullDpr:a.profile.pixelRatio,buffer:[c.width,c.height],idleMs:now-since});return;}
      if(now-start>6500){reject(new Error('Renderer did not reach its resting pixel ratio / still frame.'));return;}
      requestAnimationFrame(observe);
    }
    requestAnimationFrame(observe);
  }));
}

/** Geometric projected footprints in CSS pixels, from the actual native or
 * morphed render vertices. These bounds alone do not prove surface visibility
 * behind another tooth. Use the companion screenshot and independent ray audit. */
export async function projectedFootprints(page) {
  return page.evaluate(()=>{
    const a=window.__dentalExperience,cam=a.rig.camera,el=document.querySelector('#journey-canvas'),v=cam.position.clone();
    a.scene.updateMatrixWorld(true);cam.updateMatrixWorld(true);
    const bounds=()=>({left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity,vertices:0,clipped:0});
    const include=(b,p)=>{const x=(p.x*.5+.5)*el.clientWidth,y=(.5-p.y*.5)*el.clientHeight;
      b.left=Math.min(b.left,x);b.right=Math.max(b.right,x);b.top=Math.min(b.top,y);b.bottom=Math.max(b.bottom,y);b.vertices++;
      if(Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))>1.0001)b.clipped++;
    };
    const measured=b=>b.vertices?{...b,width:b.right-b.left,height:b.bottom-b.top}:null;
    const whole=bounds(),floor=bounds(),affected=bounds(),matrices={};
    for(const [fdi,item]of a.arch.teeth){const original=item.mesh;if(!original)continue;matrices[fdi]=original.matrixWorld.toArray();const m=original.visible?original:item.crown;if(!m?.visible)continue;
      const n=m.geometry.attributes.position.count,region=m.geometry.getAttribute('lesionRegion'),delta=m.geometry.morphAttributes.position?.[0];
      for(let i=0;i<n;i++){m.getVertexPosition(i,v).applyMatrix4(m.matrixWorld).project(cam);include(whole,v);
        if(fdi===36&&region){if(region.getY(i)>.50)include(floor,v);
          if(delta&&Math.hypot(delta.getX(i),delta.getY(i),delta.getZ(i))>5e-6)include(affected,v);}
      }
    }
    return {canvas:{width:el.clientWidth,height:el.clientHeight},geometry:measured(whole),floor:measured(floor),
      verticesDisplacedOver5umAtMaturity:measured(affected),matrices,units:'CSS-pixel projection before depth testing; positions from the active morph and actual world matrices.'};
  });
}

// Check every layer between the canvas and document. A mask, filter, clip
// path, fog or material clipping plane could otherwise imitate a camera crop.
export async function opticalState(page) {
  return page.evaluate(()=>{
    const app=window.__dentalExperience,canvas=app.renderer.domElement;
    const effects=[];
    for(let n=canvas;n;n=n.parentElement){
      const s=getComputedStyle(n);
      if(s.maskImage!=='none'||s.clipPath!=='none'||s.filter!=='none'||Number(s.opacity)!==1)
        effects.push({element:n.id||n.tagName,mask:s.maskImage,clip:s.clipPath,filter:s.filter,opacity:s.opacity});
    }
    let clippingPlanes=app.renderer.clippingPlanes?.length??0, translucentTeeth=0;
    for(const {mesh} of app.arch.teeth.values()){
      if(!mesh?.visible)continue;
      for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        clippingPlanes+=mat.clippingPlanes?.length??0;
        if(mat.opacity!==1||mat.transparent)translucentTeeth++;
      }
    }
    return {effects, fog:app.scene.fog?.type??(app.scene.fog?'present':null),clippingPlanes,translucentTeeth};
  });
}

export async function mouseDrag(page,dx,dy) {
  const b=await page.locator(canvas).boundingBox();
  const x=b.x+b.width*.5,y=b.y+b.height*.52;
  dx=Math.sign(dx)*Math.min(Math.abs(dx),b.width*.34);dy=Math.sign(dy)*Math.min(Math.abs(dy),b.height*.33);
  await page.mouse.move(x,y);await page.mouse.down();
  try{await page.mouse.move(x+dx,y+dy,{steps:12});}finally{await page.mouse.up();}
  await page.waitForTimeout(170);
}

export async function wheelOnCanvas(page,delta) {
  const b=await page.locator(canvas).boundingBox();await page.mouse.move(b.x+b.width*.53,b.y+b.height*.52);
  await page.mouse.wheel(0,delta);await page.waitForTimeout(220);
}

export async function touchDrag(ctx,page,dx,dy) {
  const b=await page.locator(canvas).boundingBox(),cdp=await ctx.newCDPSession(page);
  const x=b.x+b.width*.43,y=b.y+b.height*.49;
  dx=Math.sign(dx)*Math.min(Math.abs(dx),b.width*.36);dy=Math.sign(dy)*Math.min(Math.abs(dy),b.height*.36);
  try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:0}]});
    for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/12,y:y+dy*i/12,id:0}]});await page.waitForTimeout(17);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await cdp.detach();}
  await page.waitForTimeout(180);
}

export async function pinchOut(ctx,page) {
  const b=await page.locator(canvas).boundingBox(),cdp=await ctx.newCDPSession(page),x=b.x+b.width*.50,y=b.y+b.height*.52;
  const start=Math.min(24,b.width*.065),travel=Math.min(32,b.width*.10);
  const pair=t=>[{x:x-start-travel*t,y,id:0},{x:x+start+travel*t,y,id:1}];
  try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pair(0)});
    for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pair(i/10)});await page.waitForTimeout(17);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await cdp.detach();}
  await page.waitForTimeout(180);
}

/** Scroll the document itself, e.g. scrollbar/PageDown, not a canvas wheel.
 * Unlike the guided-story helper it does not wait for educational progress to
 * follow; that would mask a freeze failure or hang in correct free mode. */
export async function nativeJump(page,p) {
  await page.evaluate(p=>{const sec=document.querySelector('#dental-journey').getBoundingClientRect();
    const travel=sec.height-document.querySelector('#journey-stage').getBoundingClientRect().height;
    scrollTo({top:scrollY+sec.top+Math.max(0,Math.min(1,p))*travel,behavior:'instant'});},p);
  await page.waitForTimeout(190);
}

/** Observe a real click and the following animation, without touching state. */
export async function traceHandover(page,action,eventName='click') {
  await page.evaluate(eventName=>{
    const camera=window.__dentalExperience.rig.camera,read=()=>({t:performance.now(),pos:camera.position.toArray(),quat:camera.quaternion.toArray()});
    const trace={before:null,afterHandler:null,frames:[],done:false};window.__qaCameraHandover=trace;
    document.addEventListener(eventName,()=>{trace.before=read();
      const start=performance.now();function frame(){trace.frames.push(read());if(performance.now()-start<950)requestAnimationFrame(frame);else trace.done=true;}requestAnimationFrame(frame);
    },{capture:true,once:true});
    document.addEventListener(eventName,()=>{trace.afterHandler=read();},{once:true});
  },eventName);
  await action();await page.waitForFunction(()=>window.__qaCameraHandover?.done,null,{timeout:5000});
  const t=await page.evaluate(()=>{const t=window.__qaCameraHandover;delete window.__qaCameraHandover;return t;});
  const radius=distance(t.before.pos,t.frames.at(-1).pos);
  const samples=[t.before,t.afterHandler??t.frames[0],...t.frames];
  const motion=[];for(let i=1;i<samples.length;i++)motion.push({dt:samples[i].t-samples[i-1].t,
    pos:distance(samples[i].pos,samples[i-1].pos),angle:angular(samples[i].quat,samples[i-1].quat)});
  return {durationMs:t.frames.at(-1).t-t.before.t,frames:t.frames.length,clickPositionJump:motion[0].pos,
    clickAngleJump:motion[0].angle,largestFramePosition:Math.max(...motion.map(m=>m.pos)),largestFrameAngle:Math.max(...motion.map(m=>m.angle)),
    movingFrames:motion.filter(m=>m.pos>1e-5||m.angle>1e-5).length,
    endpointDistance:radius,endpointRotation:angular(t.before.quat,t.frames.at(-1).quat),samples};
}

/** Record separate guided vs free states around real inputs. Assertions live in
 * the calling E2E suite; the recorder does not repair a failed transition. */
export async function desktopInputSequence(page,go) {
  const record={},snap=async k=>{record[k]=await cameraProbe(page);};
  const initialViewport=page.viewportSize();
  await go(0);await snap('initial');
  await mouseDrag(page,100,0);await snap('guidedX');
  await mouseDrag(page,0,68);await snap('guidedY');
  await page.locator('#journey-zoom-in').click();await page.waitForTimeout(160);await snap('guidedPlus');
  await page.locator('#journey-zoom-out').click();await page.waitForTimeout(160);await snap('guidedMinus');
  await page.locator(canvas).focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(140);await snap('guidedKey');
  await wheelOnCanvas(page,200);await snap('guidedWheel');
  await go(.62);await page.locator('#journey-reset').click();await page.waitForTimeout(500);await snap('guidedBrush');
  await page.locator('#journey-explore').click();await snap('freeStart');
  await mouseDrag(page,-110,68);await snap('freeDrag');
  await wheelOnCanvas(page,-145);await snap('freeWheel');
  await nativeJump(page,.20);await snap('freeNativeJump');
  const continueTrace=await traceHandover(page,()=>page.locator('#journey-explore').click());await snap('continued');
  await go(.475123);await mouseDrag(page,75,-42);await page.locator('#journey-zoom-in').click();await page.waitForTimeout(190);await snap('beforeResize');
  await page.setViewportSize({width:1073,height:811});await page.waitForTimeout(240);await snap('afterResize');
  await page.setViewportSize(initialViewport);await page.waitForTimeout(240);
  const chapterTrace=await traceHandover(page,()=>page.locator('.journey-step').nth(5).click());await snap('navigated');
  await go(.475);await page.locator('#journey-reset').click();await page.waitForTimeout(550);
  await mouseDrag(page,-110,62);await snap('beforeWheelHandover');
  const wheelTrace=await traceHandover(page,()=>wheelOnCanvas(page,188),'wheel');await snap('afterWheelHandover');
  return {states:record,continueTrace,chapterTrace,wheelTrace};
}

export async function mobileInputSequence(ctx,page,go) {
  const record={},snap=async k=>{record[k]=await cameraProbe(page);};
  await go(0);await snap('initial');await touchDrag(ctx,page,85,0);await snap('guidedX');
  await page.locator('#journey-zoom-in').tap();await page.waitForTimeout(160);await snap('guidedPlus');
  await touchDrag(ctx,page,1,-110);await snap('guidedY');
  await page.waitForTimeout(500);await go(.62);await page.locator('#journey-reset').tap();await page.waitForTimeout(500);await snap('guidedBrush');
  await page.locator('#journey-explore').tap();await snap('freeStart');await touchDrag(ctx,page,85,0);await snap('freeX');
  await touchDrag(ctx,page,0,85);await snap('freeY');await pinchOut(ctx,page);await snap('freePinch');
  await nativeJump(page,.20);await snap('freeNativeJump');
  await page.locator('.journey-step').nth(5).tap();await page.waitForTimeout(1000);await snap('navigated');
  return {states:record};
}
