import * as THREE from 'three';
import { experienceConfig } from './config.js';
import { createScene, disposeObject, releaseRendererLuts } from './scene.js';
import { loadManifest, loadModel, loadStoryData, loadCrownAtlas } from './assets.js';
import { createArch } from './arch.js';
import { createLighting } from './lighting.js';
import { createTimeline } from './timeline.js';
import { createJourneyCamera } from './camera.js';
import { createScrollDriver } from './scroll.js';
import { createInterface } from './interface.js';
import { sampleDentalStory, sampleReducedDentalStory } from './dental-story.js';
import { createStoryCameraConfig } from './story-camera.js';
import { createCaries } from './caries.js';
import { createCleaningPath } from './cleaning-path.js';
import { createInterdentalBrush } from './interdental-brush.js';
import { createPlaque } from './plaque.js';
import { createViewController } from './view-controller.js';
import { createModelGestures } from './gestures.js';
import { createAnnotations } from './annotations.js';
import { chooseQuality, createAdaptiveQuality } from '../prototype/quality.js';
import './stage.css';

export function createExperience(configuration=experienceConfig) {
  const config={...configuration,assetBaseURL:new URL(document.body.dataset.assetBase??'./',document.baseURI).href};
  const canvas=document.querySelector('#journey-canvas');
  const section=document.querySelector('#dental-journey');
  const stage=document.querySelector('#journey-stage');
  const status=document.querySelector('#journey-status');
  const message=document.querySelector('#journey-message');
  const explore=document.querySelector('#journey-explore');
  const retry=document.querySelector('#journey-retry');
  const listeners=new AbortController(), signal=listeners.signal;
  const profile=chooseQuality(config);
  const query=new URLSearchParams(location.search), qa=query.has('qa'), clay=query.get('material')==='clay';
  let renderer,scene,arch,lighting,rig,controls,scroll,adaptive,observer,hero,atlas,upperMolar;
  let site,caries,plaque,brush,path,view,annotations,storyReady=false;
  const dentalState={brushPose:{}};
  sampleDentalStory(0,dentalState);
  let frame=0,renderedFrames=0,lastFrame=0,settleTimer,ready=false,disposed=false,shaderError=false,contextLost=false;
  let logicalWidth=0,logicalHeight=0,fittedRig=null;
  let progress=0,storyProgress=0,reducedMotion=false,exploring=false,interaction=false,scrolling=false,atlasError=false;
  let renderProgress=0,progressFrame=0;
  let inspectionProgress=0,manualProgress=0,manualChapter=null,finalView='smile';
  const finalTimelines={};let smileWeight=1,finalViewTransition=null;
  canvas.dataset.ready='false'; canvas.dataset.assetsReady='false';
  const ui=createInterface({config,section,stage,signal,navigate,explore:toggleExplore,reset:resetView,zoom,finalView:selectFinalView});

  function requestRender() {if(!disposed&&ready&&!document.hidden&&!frame)frame=requestAnimationFrame(render);}
  function showError(text,error,{upcoming=false}={}) {
    if(disposed)return;
    status.hidden=false;status.classList.add('error');status.classList.toggle('is-upcoming',upcoming);
    status.setAttribute('role','alert');message.textContent=text;retry.hidden=false;
    canvas.dataset.error=error?.message??text;
    if(!upcoming){ready=false;canvas.dataset.ready='false';document.querySelector('#journey-annotations').hidden=true;}
    updateUI();
  }
  function updateUI() {
    const complete=storyReady;
    ui.update({progress:exploring?inspectionProgress:storyProgress,ready,complete,exploring,finalView,compact:profile.compact,state:dentalState,reducedMotion});
    if(!complete&&progress>.09&&!atlasError&&ready) {
      status.hidden=false;status.classList.add('is-upcoming');message.textContent='Pripravujem medzizubnú ukážku…';
    }else if(ready&&!atlasError)status.hidden=true;
    canvas.dataset.progress=progress.toFixed(6);
    canvas.dataset.exploring=String(exploring);
    canvas.dataset.mode=exploring?'free':'presentation';
    canvas.dataset.reducedMotion=String(reducedMotion);
  }
  function leaveExplore(){if(!exploring)return;exploring=false;controls.setFree(false);interaction=false;}
  function navigate(next) {
    leaveExplore();
    manualChapter=null;
    const travel=Math.max(1,section.getBoundingClientRect().height-stage.getBoundingClientRect().height);
    if(Math.abs(progress-next)*travel<1)setProgress(next);
    else if(view)applyState(dentalState.progress,true);
    if(view?.modified)view.reset(performance.now(),reducedMotion);
    updateUI();
    // Navigation changes the native scroll target immediately. The single
    // render-progress follower owns the visible transition.
    ui.scrollTo(next,true);
    requestRender();
  }
  function enterExplore(focus=false) {
    if(!ready||disposed)return false;
    if(exploring)return true;
    exploring=true;inspectionProgress=dentalState.progress;
    controls.setFree(true);
    if(focus)canvas.focus({preventScroll:true});
    updateUI();requestRender();return true;
  }
  function toggleExplore() {
    if(exploring){
      const resume=inspectionProgress;leaveExplore();manualChapter=null;
      ui.scrollTo(resume,true);setProgress(resume);view.reset(performance.now(),reducedMotion);
    }
    else enterExplore(true);
    requestRender();
  }
  function resetView() {
    if(!ready)return;
    manualChapter=null;view.reset(performance.now(),reducedMotion);
    requestRender();
  }
  function markManual(){manualProgress=progress;manualChapter=dentalState.chapterId;requestRender();}
  function zoom(factor) {
    if(!ready)return;view.zoomBy(factor);markManual();
  }
  function selectFinalView(next){
    if(!storyReady||!finalTimelines[next]||next===finalView)return;
    finalView=next;
    const now=performance.now(),to=next==='smile'?1:0;
    if(reducedMotion){smileWeight=to;finalViewTransition=null;}else finalViewTransition={from:smileWeight,to,start:now};
    applyState(exploring?inspectionProgress:dentalState.progress,true);view.reset(now,reducedMotion);manualChapter=null;
    Object.assign(controller,{rig,timeline:finalTimelines[next]});updateUI();requestRender();
  }
  function setProgress(next,{reducedMotion:motion=reducedMotion}={}) {
    if(disposed||!rig)return null;
    progress=THREE.MathUtils.clamp(next,0,1);reducedMotion=Boolean(motion);
    storyProgress=THREE.MathUtils.lerp(config.story.startProgress,config.story.endProgress,progress);
    if(exploring){
      applyState(inspectionProgress,false);updateUI();requestRender();return null;
    }
    // First paint does not wait for all 28 surfaces. If the visitor jumps far
    // ahead on a slow connection, hold the hero composition with a loading cue.
    if(reducedMotion)renderProgress=storyProgress;
    clearTimeout(settleTimer);
    scrolling=true;
    adaptive?.beginInteraction();
    settleTimer=setTimeout(()=>{scrolling=false;if(!interaction){adaptive?.endInteraction();lastFrame=0;}},120);
    requestRender();
    return rig.pose;
  }
  function applyState(p,moveCamera) {
    (reducedMotion?sampleReducedDentalStory:sampleDentalStory)(p,dentalState);
    arch.setFinalView?.(finalView,smileWeight);
    arch.setState(dentalState);
    caries?.setProgress(dentalState.lesionProgress);
    plaque?.setState({visible:dentalState.sceneProgress<.80,opacity:dentalState.plaqueDeposition,progress:dentalState.cleaningProgress,lesionProgress:dentalState.lesionProgress});
    brush?.setPose(dentalState.brushPose);
    if(!moveCamera)return null;
    const pose=rig.setProgress(dentalState.sceneProgress,{reducedMotion:false,alternateWeight:1-smileWeight});
    view?.setStoryPose(pose);
    const radius=Math.max(1.1,pose.position.distanceTo(pose.target)*Math.tan(THREE.MathUtils.degToRad(config.camera.fov/2))*.68);
    lighting?.update(pose.target,radius);
    return pose;
  }
  function report() {
    const teeth=arch?.report()??[];
    return {
      progress,storyProgress,renderProgress,sceneProgress:Number(canvas.dataset.sceneProgress),stage:canvas.dataset.stage,
      ready,assetsReady:storyReady,anatomyReady:arch?.assetsReady??false,disposed,exploring,mode:exploring?'free':'presentation',finalView,closureCm:arch?.closureCm,crownMix:arch?.crownMix,reducedMotion,view:view?.report(),
      composition:rig?{focus:[rig.pose.screenX,rig.pose.screenY],opticalZoom:rig.pose.opticalZoom,fullSensor:[rig.camera.view?.fullWidth,rig.camera.view?.fullHeight]}:null,
      typography:ui.report(),annotations:annotations?.report(),
      profile:profile.name,frames:renderedFrames,teeth,
      visibleTeeth:teeth.filter((t)=>t.loaded&&t.reveal>.00001).map((t)=>t.fdi),
      fullyVisibleTeeth:teeth.filter((t)=>t.loaded&&t.reveal>.99999).map((t)=>t.fdi),
      camera:rig?.camera.position.toArray(),target:view?.target.toArray(),storyTarget:rig?.target.toArray(),
      drawCalls:renderer?.info.render.calls,renderTriangles:renderer?.info.render.triangles,
      pixelRatio:renderer?.getPixelRatio(),gpuGeometries:renderer?.info.memory.geometries,gpuTextures:renderer?.info.memory.textures,
      shaderErrors:shaderError||renderer?.info.programs?.some((p)=>p.diagnostics?.runnable===false)?1:0,
      environment:lighting?.label,heroBytes:hero?.bytes,atlasBytes:atlas?.bytes,upperMolarBytes:upperMolar?.bytes,
      story:{chapterId:dentalState.chapterId,sceneProgress:dentalState.sceneProgress,lesionProgress:dentalState.lesionProgress,cleaningProgress:dentalState.cleaningProgress,plaqueDeposition:dentalState.plaqueDeposition,plaqueCoverage:dentalState.plaqueCoverage,brushPose:{...dentalState.brushPose},caries:caries?.report(),plaque:plaque?.report(),brush:brush?.report()},
    };
  }
  function render(now) {
    frame=0;
    if(disposed||document.hidden||!ready){lastFrame=0;return;}
    if(finalViewTransition){
      const t=THREE.MathUtils.clamp((now-finalViewTransition.start)/(config.interaction.returnDurationMs??480),0,1);
      smileWeight=THREE.MathUtils.lerp(finalViewTransition.from,finalViewTransition.to,t*t*(3-2*t));
      if(exploring)applyState(inspectionProgress,true);
      if(t===1)finalViewTransition=null;
    }
    const target=storyReady?storyProgress:Math.min(storyProgress,.045);
    let following=false;
    if(!exploring) {
      const dt=progressFrame?Math.min(50,Math.max(0,now-progressFrame)):16.67;
      renderProgress=reducedMotion?target:renderProgress+(target-renderProgress)*(1-Math.exp(-dt/85));
      if(Math.abs(target-renderProgress)<.00002)renderProgress=target;
      following=renderProgress!==target;
      applyState(renderProgress,true);
      const travel=Math.max(1,section.getBoundingClientRect().height-stage.getBoundingClientRect().height);
      if(view?.modified&&manualChapter&&dentalState.chapterId!==manualChapter&&Math.abs(progress-manualProgress)*travel>(config.interaction.handoverScrollPx??64)){
        manualChapter=null;view.reset(now,reducedMotion);
      }
      canvas.dataset.stage=dentalState.chapterId;
      canvas.dataset.sceneProgress=dentalState.sceneProgress.toFixed(6);
      updateUI();
    }
    progressFrame=now;
    // Canvas and DOM use the same full-stage dimensions in every chapter.
    resize();
    const changing=view?.update(now)??false;
    annotations?.update({state:dentalState,camera:rig.camera,brush,free:exploring});
    if(lastFrame&&(interaction||changing||scrolling))adaptive.recordFrame(now-lastFrame);
    lastFrame=now;
    try {
      renderer.info.reset();renderer.render(scene,rig.camera);renderedFrames++;
      if(shaderError)throw new Error('Dental surface shader failed to compile.');
    }catch(error){showError('3D zobrazenie sa nepodarilo vykresliť.',error);return;}
    canvas.dataset.frameCount=String(renderedFrames);
    canvas.dataset.shaderErrors=String(shaderError?1:0);
    canvas.dataset.visibleTeeth=String(arch.visibleCount);
    if(changing||interaction||finalViewTransition||following){adaptive.beginInteraction();requestRender();}
    else if(!scrolling){adaptive.endInteraction();lastFrame=0;progressFrame=0;}
  }
  function resize() {
    if(disposed||!renderer)return;
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width||!height)return;
    const changed=width!==logicalWidth||height!==logicalHeight;
    if(!changed&&fittedRig===rig)return;
    if(changed){renderer.setSize(width,height,false);logicalWidth=width;logicalHeight=height;}
    if(!rig)return;
    // The actual sensor is the entire shared stage. Chapter keyframes compose
    // the model beside the HTML type without an inner cropped viewport.
    rig.resize(width,height);
    fittedRig=rig;
    applyState(exploring?inspectionProgress:dentalState.progress,true);
    setProgress(progress);
    requestRender();
  }
  function dispose() {
    if(disposed)return;
    disposed=true;ready=false;listeners.abort();
    if(frame)cancelAnimationFrame(frame);frame=0;clearTimeout(settleTimer);
    releaseRendererLuts(renderer,scene);
    observer?.disconnect();scroll?.dispose();controls?.dispose();view?.dispose();annotations?.dispose();rig?.dispose();adaptive?.dispose();lighting?.dispose();ui.dispose();
    brush?.dispose();plaque?.dispose();caries?.dispose();
    const atlasOwned=arch?.ownsSource(atlas),upperOwned=arch?.ownsSource(upperMolar);
    if(arch)arch.dispose();else disposeObject(hero?.object);
    if(atlas&&!atlasOwned)disposeObject(atlas.object);
    if(upperMolar&&!upperOwned)disposeObject(upperMolar.object);
    renderer?.renderLists.dispose();renderer?.dispose();
    canvas.dataset.ready='false';canvas.dataset.disposed='true';
  }
  const controller={dispose,ready:null,report,setProgress};
  if(qa)window.__dentalExperience=controller;
  retry.addEventListener('click',()=>location.reload(),{signal});
  window.addEventListener('pagehide',(e)=>{if(!e.persisted)dispose();},{signal});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;lastFrame=0;progressFrame=0;adaptive?.endInteraction();}
    else {scroll?.refresh();requestRender();}
  },{signal});
  canvas.addEventListener('webglcontextlost',(e)=>{
    e.preventDefault();contextLost=true;if(frame)cancelAnimationFrame(frame);frame=0;controls&&(controls.enabled=false);
    showError('3D zobrazenie sa prerušilo. Obnovte ho tlačidlom nižšie.',new Error('WebGL context lost'));
  },{signal});

  controller.ready=(async()=>{
    try {
      ({renderer,scene}=createScene(canvas,config,profile));
      renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{shaderError=true;console.error('Dental shader:',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment));};
      observer=new ResizeObserver(resize);observer.observe(canvas);resize();
      const results=await Promise.allSettled([
        loadManifest(config,signal),
        loadModel(config,profile.compact?config.assets.heroCompact:config.assets.heroDesktop,signal,(percent)=>{if(!disposed&&!contextLost)message.textContent=percent===null?'Načítavam zub…':`Načítavam zub… ${percent} %`;}),
        createLighting(scene,renderer,config,profile,signal),
      ]);
      const manifest=results[0].status==='fulfilled'?results[0].value:null;
      if(results[1].status==='fulfilled')hero=results[1].value;
      if(results[2].status==='fulfilled')lighting=results[2].value;
      if(disposed||contextLost){disposeObject(hero?.object);lighting?.dispose();hero=undefined;lighting=undefined;return controller;}
      for(const result of results)if(result.status==='rejected')throw result.reason;
      arch=createArch({manifest,hero,config,renderer,profile,clay});scene.add(arch.object);
      const timeline=createTimeline({landmarks:arch.landmarks,cameraOptions:config.camera});
      rig=createJourneyCamera({timeline,config,sampleOnly:true});
      view=createViewController({camera:rig.camera,config});view.setStoryPose(rig.pose);view.update();
      adaptive=createAdaptiveQuality({renderer,profile,requestRender,config});
      controls=createModelGestures({canvas,view,config,signal,
        onStart(){interaction=true;adaptive.beginInteraction();requestRender();},
        onEnd(){interaction=false;requestRender();},onChange:markManual});
      canvas.addEventListener('keydown',(event)=>{
        if(event.altKey||event.metaKey||event.ctrlKey)return;
        if(event.key==='Escape'){if(exploring){event.preventDefault();toggleExplore();(explore.hidden?document.querySelector('#journey-hero-explore'):explore).focus({preventScroll:true});}else if(view.modified){event.preventDefault();resetView();}return;}
        if(event.key==='Home'){event.preventDefault();resetView();return;}
        if(['+','=','-','_'].includes(event.key)){event.preventDefault();zoom(['+','='].includes(event.key)?.88:1/.88);return;}
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
        event.preventDefault();if(!ready)return;
        view.orbit(event.key==='ArrowLeft'?-config.interaction.keyboardAzimuthStep:event.key==='ArrowRight'?config.interaction.keyboardAzimuthStep:0,
          event.key==='ArrowUp'?config.interaction.keyboardPolarStep:event.key==='ArrowDown'?-config.interaction.keyboardPolarStep:0);markManual();
      },{signal});
      ready=true;canvas.dataset.ready='true';canvas.dataset.profile=profile.name;canvas.dataset.revision=config.revision;
      resize();scroll=createScrollDriver({section,stage,onProgress:setProgress});
      Object.assign(controller,{scene,renderer,rig,controls,view,arch,profile,adaptive});
      requestRender();
      // Give the hero an actual rendered frame before decoding the upcoming
      // atlas. Its compact shared maps are then prefetched without a scroll gate.
      requestAnimationFrame(async()=>{
        if(disposed)return;
        try {
          const results=await Promise.allSettled([
            loadModel(config,profile.compact?config.assets.compact:config.assets.desktop,signal),
            loadModel(config,profile.compact?config.assets.upperCompact:config.assets.upperDesktop,signal),
            loadStoryData(config,config.assetsStory.site,signal),
            loadStoryData(config,config.assetsStory.caries,signal),
            loadCrownAtlas(config,signal),
          ]);
          if(results[0].status==='fulfilled')atlas=results[0].value;
          if(results[1].status==='fulfilled')upperMolar=results[1].value;
          if(disposed||contextLost){disposeObject(atlas?.object);disposeObject(upperMolar?.object);atlas=undefined;upperMolar=undefined;return;}
          for(const result of results)if(result.status==='rejected')throw result.reason;
          arch.attachAtlas(atlas,upperMolar);
          arch.attachCrowns(results[4].value);
          site=results[2].value;
          caries=createCaries({arch,data:results[3].value,config,clay});
          path=createCleaningPath(site);
          brush=createInterdentalBrush({path,compact:profile.compact,options:config.brush});
          plaque=createPlaque({site,path,arch,compact:profile.compact,options:config.plaque});
          scene.add(brush.object,plaque.object);
          annotations=createAnnotations({layer:document.querySelector('#journey-annotations'),canvas,site,arch,path,compact:profile.compact,requestRender});
          for(const name of ['smile','anatomy']){
            const cameraConfig=createStoryCameraConfig(site,config,{finalView:name,compact:profile.compact});
            finalTimelines[name]=createTimeline({landmarks:{...arch.landmarks,...cameraConfig.landmarks},cameraOptions:cameraConfig.camera});
          }
          const previous=rig,expanded=finalTimelines[finalView];
          rig=createJourneyCamera({timeline:finalTimelines.smile,alternateTimeline:finalTimelines.anatomy,config,camera:previous.camera,sampleOnly:true});previous.dispose();
          rig.resize(canvas.clientWidth,canvas.clientHeight);
          applyState(exploring?inspectionProgress:Math.min(storyProgress,.045),true);
          Object.assign(controller,{rig,site,caries,plaque,brush,path,annotations,timeline:expanded});
          await renderer.compileAsync(scene,rig.camera);
          if(disposed||contextLost)return;
          if(shaderError)throw new Error('Dental surface shader failed to compile.');
          storyReady=true;canvas.dataset.assetsReady='true';setProgress(progress);
        }catch(error){
          if(disposed)return;
          atlasError=true;
          if(atlas&&!arch?.ownsSource(atlas))disposeObject(atlas.object);
          if(upperMolar&&!arch?.ownsSource(upperMolar))disposeObject(upperMolar.object);
          showError('Ukážku sa nepodarilo načítať. Skúste to znova.',error,{upcoming:true});
        }
      });
      return controller;
    }catch(error){
      if(disposed)return controller;
      showError(/WebGL|context|Error creating/i.test(error.message)
        ?'WebGL 2 nie je dostupné. Skúste aktuálny prehliadač s hardvérovou akceleráciou.'
        :'3D podklady sa nepodarilo načítať. Skontrolujte pripojenie a skúste to znova.',error);
      releaseRendererLuts(renderer,scene);
      observer?.disconnect();adaptive?.dispose();controls?.dispose();lighting?.dispose();
      if(arch)arch.dispose();else disposeObject(hero?.object);
      renderer?.dispose();return controller;
    }
  })();
  return controller;
}

const experience=createExperience();
if(import.meta.hot)import.meta.hot.dispose(()=>experience.dispose());
