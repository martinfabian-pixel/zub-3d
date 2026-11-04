import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { experienceConfig } from './config.js';
import { createScene, disposeObject } from './scene.js';
import { loadManifest, loadModel } from './assets.js';
import { createArch } from './arch.js';
import { createLighting } from './lighting.js';
import { createTimeline } from './timeline.js';
import { createJourneyCamera } from './camera.js';
import { createScrollDriver } from './scroll.js';
import { chooseQuality, createAdaptiveQuality } from '../prototype/quality.js';
import './style.css';

export function createExperience(config=experienceConfig) {
  const canvas=document.querySelector('#journey-canvas');
  const section=document.querySelector('#dental-journey');
  const stage=document.querySelector('#journey-stage');
  const status=document.querySelector('#journey-status');
  const message=document.querySelector('#journey-message');
  const hint=document.querySelector('#journey-hint');
  const inspect=document.querySelector('#journey-inspect');
  const explore=document.querySelector('#journey-explore');
  const reset=document.querySelector('#journey-reset');
  const orbitHint=document.querySelector('#journey-orbit-hint');
  const retry=document.querySelector('#journey-retry');
  const listeners=new AbortController(), signal=listeners.signal;
  const profile=chooseQuality(config);
  const query=new URLSearchParams(location.search), qa=query.has('qa'), clay=query.get('material')==='clay';
  let renderer,scene,arch,lighting,rig,controls,scroll,adaptive,observer,hero,atlas;
  let frame=0,renderedFrames=0,lastFrame=0,settleTimer,ready=false,disposed=false,shaderError=false;
  let progress=0,storyProgress=0,reducedMotion=false,exploring=false,interaction=false,scrolling=false,atlasError=false;
  let lastScrollProgress=0;
  canvas.dataset.ready='false'; canvas.dataset.assetsReady='false';

  function requestRender() {if(!disposed&&ready&&!document.hidden&&!frame)frame=requestAnimationFrame(render);}
  function showError(text,error,{upcoming=false}={}) {
    if(disposed)return;
    status.hidden=false;status.classList.add('error');status.classList.toggle('is-upcoming',upcoming);
    status.setAttribute('role','alert');message.textContent=text;retry.hidden=false;
    canvas.dataset.error=error?.message??text;
    if(!upcoming){ready=false;canvas.dataset.ready='false';inspect.hidden=true;hint.hidden=true;}
  }
  function updateUI() {
    const complete=arch?.assetsReady;
    inspect.hidden=!(ready&&complete&&storyProgress>=config.reveal.exploreStart);
    hint.hidden=!ready||progress>.15||(!complete&&progress>.09);
    hint.style.opacity=String(1-THREE.MathUtils.smoothstep(progress,.015,.15));
    if(!complete&&progress>.09&&!atlasError&&ready) {
      status.hidden=false;status.classList.add('is-upcoming');message.textContent='Pripravujem celý chrup…';
    }else if(ready&&!atlasError)status.hidden=true;
    canvas.dataset.progress=progress.toFixed(6);
    canvas.dataset.exploring=String(exploring);
    canvas.dataset.reducedMotion=String(reducedMotion);
  }
  function leaveExplore() {
    if(!exploring)return;
    exploring=false;controls.enabled=false;interaction=false;
    controls.reset();controls.enabled=false;
    canvas.style.cursor='';canvas.style.touchAction='pan-y';
    explore.textContent='Preskúmať 3D ↗';explore.setAttribute('aria-pressed','false');reset.hidden=true;orbitHint.hidden=true;
  }
  function setProgress(next,{reducedMotion:motion=reducedMotion}={}) {
    if(disposed||!rig)return null;
    progress=THREE.MathUtils.clamp(next,0,1);reducedMotion=Boolean(motion);
    storyProgress=THREE.MathUtils.lerp(config.story.startProgress,config.story.endProgress,progress);
    if(exploring&&Math.abs(progress-lastScrollProgress)>.00001)leaveExplore();
    lastScrollProgress=progress;
    // First paint does not wait for all 28 surfaces. If the visitor jumps far
    // ahead on a slow connection, hold the hero composition with a loading cue.
    const applied=arch.assetsReady?storyProgress:Math.min(storyProgress,config.camera.stops.hero);
    const pose=rig.setProgress(applied,{reducedMotion});
    arch.setProgress(pose.sceneProgress);
    const radius=Math.max(1.1,rig.camera.position.distanceTo(rig.target)*Math.tan(THREE.MathUtils.degToRad(config.camera.fov/2))*.68);
    lighting.update(rig.target,radius);
    canvas.dataset.stage=pose.stage;canvas.dataset.sceneProgress=pose.sceneProgress.toFixed(6);
    clearTimeout(settleTimer);
    scrolling=true;
    adaptive?.beginInteraction();
    settleTimer=setTimeout(()=>{scrolling=false;if(!exploring){adaptive?.endInteraction();lastFrame=0;}},120);
    updateUI();requestRender();
    return pose;
  }
  function report() {
    const teeth=arch?.report()??[];
    return {
      progress,storyProgress,sceneProgress:Number(canvas.dataset.sceneProgress),stage:canvas.dataset.stage,
      ready,assetsReady:arch?.assetsReady??false,disposed,exploring,reducedMotion,
      profile:profile.name,frames:renderedFrames,teeth,
      visibleTeeth:teeth.filter((t)=>t.loaded&&t.reveal>.00001).map((t)=>t.fdi),
      fullyVisibleTeeth:teeth.filter((t)=>t.loaded&&t.reveal>.99999).map((t)=>t.fdi),
      camera:rig?.camera.position.toArray(),target:rig?.target.toArray(),
      drawCalls:renderer?.info.render.calls,renderTriangles:renderer?.info.render.triangles,
      pixelRatio:renderer?.getPixelRatio(),gpuGeometries:renderer?.info.memory.geometries,gpuTextures:renderer?.info.memory.textures,
      shaderErrors:shaderError||renderer?.info.programs?.some((p)=>p.diagnostics?.runnable===false)?1:0,
      environment:lighting?.label,heroBytes:hero?.bytes,atlasBytes:atlas?.bytes,
    };
  }
  function render(now) {
    frame=0;
    if(disposed||document.hidden||!ready){lastFrame=0;return;}
    const changing=exploring?controls.update():false;
    if(lastFrame&&(interaction||changing||scrolling))adaptive.recordFrame(now-lastFrame);
    lastFrame=now;
    try {
      renderer.info.reset();renderer.render(scene,rig.camera);renderedFrames++;
      if(shaderError)throw new Error('Dental surface shader failed to compile.');
    }catch(error){showError('3D zobrazenie sa nepodarilo vykresliť.',error);return;}
    canvas.dataset.frameCount=String(renderedFrames);
    canvas.dataset.shaderErrors=String(shaderError?1:0);
    canvas.dataset.visibleTeeth=String(arch.visibleCount);
    if(changing||interaction){adaptive.beginInteraction();requestRender();}
    else if(!scrolling){adaptive.endInteraction();lastFrame=0;}
  }
  function resize() {
    if(disposed||!renderer)return;
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width||!height)return;
    renderer.setSize(width,height,false);
    if(!rig)return;
    // Fit into a real content viewport, then extend its projection downward
    // for the discreet controls. This preserves perspective and phone width
    // without putting the scroll cue over a cusp on short landscape screens.
    const reserve=Math.min(config.camera.footerReservePx,height*config.camera.footerReserveMaxFraction);
    const contentHeight=height-reserve;
    if(exploring)rig.camera.aspect=width/contentHeight;
    else rig.resize(width,contentHeight);
    rig.camera.setViewOffset(width,contentHeight,0,0,width,height);
    if(!exploring)setProgress(progress);
    requestRender();
  }
  function dispose() {
    if(disposed)return;
    disposed=true;ready=false;listeners.abort();
    if(frame)cancelAnimationFrame(frame);frame=0;clearTimeout(settleTimer);
    observer?.disconnect();scroll?.dispose();controls?.dispose();rig?.dispose();adaptive?.dispose();lighting?.dispose();
    if(arch)arch.dispose();else disposeObject(hero?.object);
    if(atlas&&!arch?.assetsReady)disposeObject(atlas.object);
    renderer?.renderLists.dispose();renderer?.dispose();
    canvas.dataset.ready='false';canvas.dataset.disposed='true';
  }
  const controller={dispose,ready:null,report,setProgress};
  if(qa)window.__dentalExperience=controller;
  retry.addEventListener('click',()=>location.reload(),{signal});
  window.addEventListener('pagehide',(e)=>{if(!e.persisted)dispose();},{signal});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;lastFrame=0;adaptive?.endInteraction();}
    else {scroll?.refresh();requestRender();}
  },{signal});
  canvas.addEventListener('webglcontextlost',(e)=>{
    e.preventDefault();if(frame)cancelAnimationFrame(frame);frame=0;controls&&(controls.enabled=false);
    showError('3D zobrazenie sa prerušilo. Obnovte ho tlačidlom nižšie.',new Error('WebGL context lost'));
  },{signal});

  controller.ready=(async()=>{
    try {
      ({renderer,scene}=createScene(canvas,config,profile));
      renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{shaderError=true;console.error('Dental shader:',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment));};
      observer=new ResizeObserver(resize);observer.observe(canvas);resize();
      const results=await Promise.allSettled([
        loadManifest(config,signal),
        loadModel(config,profile.compact?config.assets.heroCompact:config.assets.heroDesktop,signal,(percent)=>{if(!disposed)message.textContent=percent===null?'Načítavam zub…':`Načítavam zub… ${percent} %`;}),
        createLighting(scene,renderer,config,profile,signal),
      ]);
      const manifest=results[0].status==='fulfilled'?results[0].value:null;
      if(results[1].status==='fulfilled')hero=results[1].value;
      if(results[2].status==='fulfilled')lighting=results[2].value;
      if(disposed){disposeObject(hero?.object);lighting?.dispose();return controller;}
      for(const result of results)if(result.status==='rejected')throw result.reason;
      arch=createArch({manifest,hero,config,renderer,profile,clay});scene.add(arch.object);
      const timeline=createTimeline({landmarks:arch.landmarks,cameraOptions:config.camera});
      rig=createJourneyCamera({timeline,config});
      adaptive=createAdaptiveQuality({renderer,profile,requestRender,config});
      controls=new OrbitControls(rig.camera,canvas);controls.enabled=false;controls.enablePan=false;
      controls.enableDamping=true;controls.dampingFactor=config.interaction.dampingFactor;controls.rotateSpeed=.55;controls.zoomSpeed=.65;
      controls.minPolarAngle=.04;controls.maxPolarAngle=3.10;
      canvas.style.touchAction='pan-y';
      controls.addEventListener('start',()=>{interaction=true;adaptive.beginInteraction();requestRender();});
      controls.addEventListener('end',()=>{interaction=false;requestRender();});
      controls.addEventListener('change',()=>{if(exploring)requestRender();});
      // A normal wheel always returns to the story and scrolls the document.
      // No event is canceled, including while the explicit orbit mode is active.
      canvas.addEventListener('wheel',()=>{if(exploring){leaveExplore();setProgress(progress);}},{capture:true,passive:true,signal});
      explore.addEventListener('click',()=>{
        if(exploring){leaveExplore();setProgress(progress);return;}
        if(!arch.assetsReady||storyProgress<config.reveal.exploreStart)return;
        controls.target.copy(rig.target);controls.update();
        const distance=rig.camera.position.distanceTo(rig.target);
        controls.minDistance=distance*config.interaction.minimumDistanceFraction;controls.maxDistance=distance*config.interaction.maximumDistanceFraction;
        controls.saveState();exploring=true;controls.enabled=true;
        canvas.style.touchAction='pan-y';canvas.style.cursor='grab';
        explore.textContent='Späť na prezentáciu';explore.setAttribute('aria-pressed','true');reset.hidden=false;orbitHint.hidden=false;
        updateUI();requestRender();
      },{signal});
      reset.addEventListener('click',()=>{controls.reset();requestRender();},{signal});
      ready=true;canvas.dataset.ready='true';canvas.dataset.profile=profile.name;canvas.dataset.revision=config.revision;
      resize();scroll=createScrollDriver({section,stage,onProgress:setProgress});
      Object.assign(controller,{scene,renderer,rig,controls,arch,profile});
      requestRender();
      // Give the hero an actual rendered frame before decoding the upcoming
      // atlas. Its compact shared maps are then prefetched without a scroll gate.
      requestAnimationFrame(async()=>{
        if(disposed)return;
        try {
          atlas=await loadModel(config,profile.compact?config.assets.compact:config.assets.desktop,signal);
          if(disposed){disposeObject(atlas.object);return;}
          arch.attachAtlas(atlas);
          await renderer.compileAsync(scene,rig.camera);
          if(disposed)return;
          canvas.dataset.assetsReady='true';setProgress(progress);
        }catch(error){
          if(disposed)return;
          atlasError=true;disposeObject(atlas?.object);
          showError('Ďalšie zuby sa nepodarilo načítať. Skúste to znova.',error,{upcoming:true});
          hint.hidden=true;
        }
      });
      return controller;
    }catch(error){
      if(disposed)return controller;
      showError(/WebGL|context|Error creating/i.test(error.message)
        ?'WebGL 2 nie je dostupné. Skúste aktuálny prehliadač s hardvérovou akceleráciou.'
        :'3D podklady sa nepodarilo načítať. Skontrolujte pripojenie a skúste to znova.',error);
      observer?.disconnect();adaptive?.dispose();controls?.dispose();lighting?.dispose();
      if(arch)arch.dispose();else disposeObject(hero?.object);
      renderer?.dispose();return controller;
    }
  })();
  return controller;
}

const experience=createExperience();
if(import.meta.hot)import.meta.hot.dispose(()=>experience.dispose());
