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
import { createCariesDetail } from './caries-detail.js';
import { createCariesMicrobes } from './caries-microbes.js';
import { createCavityJourney } from './cavity-journey.js';
import { createHeroSpin } from './hero-spin.js';
import { createHeroAnatomy } from './hero-anatomy.js';
import { createHeroAnatomyMotion } from './hero-anatomy-motion.js';
import { createHeroAnatomyControls } from './hero-anatomy-controls.js';
import { createFullArchAnatomy } from './full-arch-anatomy.js';
import { createFullArchAnatomyControls } from './full-arch-anatomy-controls.js';
import { createFullArchFocus } from './full-arch-focus.js';
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
  let site,caries,plaque,brush,path,view,annotations,microbes,heroAnatomy,fullArchAnatomy,storyReady=false;
  const dentalState={brushPose:{}};
  sampleDentalStory(0,dentalState);
  let frame=0,renderedFrames=0,lastFrame=0,settleTimer,deferredTimer,ready=false,disposed=false,shaderError=false,contextLost=false;
  let startDeferredAssets=()=>{};
  let logicalWidth=0,logicalHeight=0,fittedRig=null;
  let progress=0,storyProgress=0,reducedMotion=false,exploring=false,interaction=false,scrolling=false,atlasError=false;
  let renderProgress=0,progressFrame=0;
  let inspectionProgress=0,manualProgress=0,manualChapter=null,finalView='smile';
  const finalTimelines={};let smileWeight=1,finalViewTransition=null;
  let fullAnatomyActive=false,fullAnatomyWeight=0,fullAnatomyFrame=0,pendingFinalView=null;
  let focusedFdi=null,focusOrigin=null,focusReturning=false,focusBlend=0,focusFrame=0,focusSensorApplied=false;
  const heroSpin=createHeroSpin();
  const anatomyMotion=createHeroAnatomyMotion();
  const cavityJourney=createCavityJourney();
  const fullArchFocus=createFullArchFocus();
  const raycaster=new THREE.Raycaster(),pointerNdc=new THREE.Vector2();
  let cavityPointer=null,detailPending=false,detailSnapshot=null,detailEnteredExplore=false,microbeStart=0,microbeReveal=0;
  canvas.dataset.ready='false'; canvas.dataset.assetsReady='false';
  const ui=createInterface({config,section,stage,signal,navigate,explore:toggleExplore,reset:resetView,zoom,finalView:selectFinalView});
  const detail=createCariesDetail({stage,onRequest:openCariesDetail,onClose:closeCariesDetail});
  const anatomyControls=createHeroAnatomyControls({stage,onToggle(active){anatomyMotion.setActive(active);requestRender();}});
  const fullAnatomyControls=createFullArchAnatomyControls({stage,onToggle(active){
    if(!active)cancelFullArchFocus();
    fullAnatomyActive=active;pendingFinalView=null;
    if(active&&finalView!=='anatomy')selectFinalView('anatomy');
    requestRender();
  },onSelect:focusTooth,onReturn:returnToArch});

  function focusTooth(fdi) {
    if(!storyReady||!fullAnatomyActive||fullAnatomyWeight<.95||dentalState.chapterId!=='dentition')return;
    const mesh=arch.teeth.get(Number(fdi))?.mesh;
    // In the isolated view other teeth are intentionally hidden; the
    // accessible selector must still be able to choose any of them.
    if(!mesh||(!mesh.visible&&!focusOrigin))return;
    mesh.visible=true;
    const current=view.capture(), destination=fullArchFocus.destination(mesh,rig,rig.camera,current);
    if(!destination)return;
    if(!focusOrigin)focusOrigin=current;
    focusedFdi=Number(fdi);focusReturning=false;
    view.setGuidedZoomMinimum(.1);
    fullArchFocus.begin(current,destination.snapshot,{instant:reducedMotion});
    requestRender();
  }
  function returnToArch() {
    if(!focusOrigin)return;
    focusReturning=true;
    fullArchFocus.begin(view.capture(),focusOrigin,{instant:reducedMotion});
    requestRender();
  }
  function cancelFullArchFocus() {
    if(!focusOrigin)return;
    fullArchFocus.cancel();
    view?.setGuidedZoomMinimum();
    view?.restore(focusOrigin,{instant:reducedMotion});
    focusedFdi=null;focusOrigin=null;focusReturning=false;focusBlend=0;
    for(const item of arch?.teeth.values()??[])if(item.mesh)item.mesh.visible=item.reveal>.00001;
    requestRender();
  }

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
    detail.update({chapterId:dentalState.chapterId,lesionProgress:dentalState.lesionDisplay,enabled:storyReady});
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
    cancelFullArchFocus();
    if(next>.035)startDeferredAssets();
    if(detail.isOpen)detail.close();
    cancelPendingDetail();
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
    if(detail.isOpen){detail.close();return;}
    if(detailPending){cancelPendingDetail();updateUI();requestRender();return;}
    if(exploring){
      cancelFullArchFocus();
      const resume=inspectionProgress;leaveExplore();manualChapter=null;
      ui.scrollTo(resume,true);setProgress(resume);view.reset(performance.now(),reducedMotion);
    }
    else enterExplore(true);
    requestRender();
  }
  function resetView() {
    if(!ready)return;
    cancelFullArchFocus();
    if(detail.isOpen)detail.close();
    cancelPendingDetail();
    heroSpin.release();
    manualChapter=null;view.reset(performance.now(),reducedMotion);
    requestRender();
  }
  function markManual(){manualProgress=progress;manualChapter=dentalState.chapterId;requestRender();}
  function zoom(factor) {
    if(!ready)return;cancelPendingDetail();
    if(fullArchFocus.active){fullArchFocus.cancel();focusReturning=false;}
    view.zoomBy(factor);markManual();
  }
  function cancelPendingDetail() {
    if(!detailPending)return;
    cavityJourney.cancel();
    detailPending=false;detail.setBusy(false);
    canvas.style.pointerEvents='';
    if(detailEnteredExplore)leaveExplore();
    view.restore(detailSnapshot);
    detailSnapshot=null;detailEnteredExplore=false;
  }
  function openCariesDetail() {
    if(!storyReady||detailPending||detail.isOpen||dentalState.chapterId!=='caries'||dentalState.lesionDisplay<=.5)return;
    detailSnapshot=view.capture();
    detailEnteredExplore=!exploring;
    if(detailEnteredExplore)enterExplore();
    detail.setBusy(true);
    detailPending=true;
    canvas.style.pointerEvents='none';
    cavityJourney.begin(detailSnapshot,{factor:.55,instant:reducedMotion});
    requestRender();
  }
  function closeCariesDetail() {
    cavityJourney.cancel();microbeStart=0;microbeReveal=0;
    detailPending=false;detail.setBusy(false);
    if(detailEnteredExplore){
      const resume=inspectionProgress;
      leaveExplore();ui.scrollTo(resume,true);setProgress(resume);
    }
    view.restore(detailSnapshot);
    detailSnapshot=null;detailEnteredExplore=false;
    updateUI();requestRender();
  }
  function selectFinalView(next){
    if(next!=='anatomy')cancelFullArchFocus();
    if(next==='smile'&&fullAnatomyWeight>.002){
      fullAnatomyActive=false;pendingFinalView='smile';requestRender();return;
    }
    if(!storyReady||!finalTimelines[next]||next===finalView)return;
    if(next==='smile')fullAnatomyActive=false;
    pendingFinalView=null;
    finalView=next;
    const now=performance.now(),to=next==='smile'?1:0;
    if(reducedMotion){smileWeight=to;finalViewTransition=null;}else finalViewTransition={from:smileWeight,to,start:now};
    applyState(exploring?inspectionProgress:dentalState.progress,true);view.reset(now,reducedMotion);manualChapter=null;
    Object.assign(controller,{rig,timeline:finalTimelines[next]});updateUI();requestRender();
  }
  function setProgress(next,{reducedMotion:motion=reducedMotion}={}) {
    if(disposed||!rig)return null;
    progress=THREE.MathUtils.clamp(next,0,1);reducedMotion=Boolean(motion);
    if(focusOrigin&&progress<.94)cancelFullArchFocus();
    if(progress>.035)startDeferredAssets();
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
    caries?.setProgress(dentalState.lesionDisplay);
    plaque?.setState({visible:dentalState.sceneProgress<.80,opacity:dentalState.plaqueDeposition,progress:dentalState.cleaningProgress,lesionProgress:dentalState.lesionDisplay});
    const opacity=String(dentalState.exampleOpacity);
    if(canvas.style.opacity!==opacity)canvas.style.opacity=opacity;
    brush?.setPose(dentalState.brushPose);
    if(!moveCamera)return null;
    const pose=rig.setProgress(dentalState.sceneProgress,{reducedMotion:false,alternateWeight:1-smileWeight});
    heroSpin.apply(pose);
    view?.setStoryPose(pose);
    const radius=Math.max(1.1,pose.position.distanceTo(pose.target)*Math.tan(THREE.MathUtils.degToRad(config.camera.fov/2))*.68);
    lighting?.update(pose.target,radius);
    return pose;
  }
  function report() {
    const teeth=arch?.report()??[];
    return {
      progress,storyProgress,renderProgress,sceneProgress:Number(canvas.dataset.sceneProgress),stage:canvas.dataset.stage,
      heroSpin:{state:heroSpin.state,angle:heroSpin.angle},detailOpen:detail.isOpen,detailPending,
      heroAnatomy:{weight:heroAnatomy?.weight??0},
      fullAnatomy:fullArchAnatomy?.report()??{weight:0,teeth:0},
      focusedTooth:focusedFdi,focusMoving:fullArchFocus.active,focusReturning,focusHasOrigin:Boolean(focusOrigin),
      microbes:{visible:Boolean(microbes?.object.visible),reveal:microbeReveal},
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
      story:{chapterId:dentalState.chapterId,sceneProgress:dentalState.sceneProgress,lesionProgress:dentalState.lesionProgress,lesionDisplay:dentalState.lesionDisplay,exampleOpacity:dentalState.exampleOpacity,cleaningProgress:dentalState.cleaningProgress,plaqueDeposition:dentalState.plaqueDeposition,plaqueCoverage:dentalState.plaqueCoverage,brushPose:{...dentalState.brushPose},caries:caries?.report(),plaque:plaque?.report(),brush:brush?.report()},
    };
  }
  function render(now) {
    frame=0;
    if(disposed||document.hidden||!ready){lastFrame=0;return;}
    const heroSpinning=heroSpin.update(now,{progress:storyProgress,reducedMotion,interacting:interaction,exploring,modified:view?.modified});
    if(heroSpin.state==='done'||(heroSpin.state==='paused'&&!interaction&&!exploring))startDeferredAssets();
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
    const anatomyState=anatomyMotion.update(now,{
      hero:dentalState.chapterId==='hero',reducedMotion,interacting:interaction||exploring||Boolean(view?.modified),
    });
    heroAnatomy?.setWeight(anatomyState.weight);
    const finale=dentalState.chapterId==='dentition';
    if(!finale){fullAnatomyActive=false;pendingFinalView=null;fullAnatomyWeight=0;}
    const fullTarget=finale&&fullAnatomyActive&&finalView==='anatomy'&&!finalViewTransition?1:0;
    const fullDt=fullAnatomyFrame?Math.min(50,Math.max(0,now-fullAnatomyFrame)):16.67;
    fullAnatomyFrame=now;
    fullAnatomyWeight=reducedMotion?fullTarget:fullAnatomyWeight+(fullTarget-fullAnatomyWeight)*(1-Math.exp(-fullDt/130));
    if(Math.abs(fullTarget-fullAnatomyWeight)<.002)fullAnatomyWeight=fullTarget;
    fullArchAnatomy?.setWeight(fullAnatomyWeight);
    // In an explicitly selected illustration, gently isolate the chosen tooth
    // without moving or editing any geometry. The full arch returns on exit.
    const focusTarget=finale&&focusedFdi!==null&&!focusReturning?1:0;
    const focusDt=focusFrame?Math.min(50,Math.max(0,now-focusFrame)):16.67;focusFrame=now;
    focusBlend=reducedMotion?focusTarget:focusBlend+(focusTarget-focusBlend)*(1-Math.exp(-focusDt/160));
    if(Math.abs(focusTarget-focusBlend)<.002)focusBlend=focusTarget;
    if(fullAnatomyWeight>.95&&focusedFdi!==null){
      for(const [fdi,item] of arch.teeth){
        if(fdi===focusedFdi||!item.mesh)continue;
        item.mesh.visible=focusBlend<.998&&item.reveal>.00001;
        item.mesh.material.opacity*=1-focusBlend;
      }
    }
    anatomyControls.update({chapterId:dentalState.chapterId,enabled:ready,active:anatomyState.active,weight:anatomyState.weight,archWeight:fullAnatomyWeight});
    fullAnatomyControls.update({visible:finale&&(reducedMotion||dentalState.sceneProgress>=.978),enabled:storyReady,active:fullAnatomyActive,focused:focusedFdi!==null,selectedFdi:focusedFdi});
    if(pendingFinalView&&fullAnatomyWeight===0){const next=pendingFinalView;pendingFinalView=null;selectFinalView(next);}
    const fullAnatomyMoving=fullAnatomyWeight!==fullTarget;
    const move=cavityJourney.update(now);
    if(move.snapshot)view.restore(move.snapshot);
    const focusMove=fullArchFocus.update(now);
    if(focusMove.snapshot){
      view.restore(focusMove.snapshot,{instant:reducedMotion});
      if(!focusMove.moving&&focusReturning){focusedFdi=null;focusOrigin=null;focusReturning=false;view.setGuidedZoomMinimum();}
    }
    const changing=view?.update(now)??false;
    // Shift the sensor's aim into the free centre of the stage while the
    // tooth is isolated; the story rig restores its own framing afterwards.
    const sensor=rig.camera.view;
    if(sensor?.enabled&&(focusBlend>.001||focusSensorApplied)){
      const sx=THREE.MathUtils.lerp(rig.pose.screenX??.5,profile.compact?.5:.64,focusBlend);
      const sy=THREE.MathUtils.lerp(rig.pose.screenY??.5,profile.compact?.65:.57,focusBlend);
      rig.camera.setViewOffset(sensor.fullWidth,sensor.fullHeight,(.5-sx)*sensor.fullWidth,(.5-sy)*sensor.fullHeight,sensor.fullWidth,sensor.fullHeight);
      focusSensorApplied=focusBlend>.001;
    }
    if(detailPending&&!cavityJourney.active&&!changing){
      detailPending=false;canvas.style.pointerEvents='';detail.show();microbeStart=now;
    }
    microbeReveal=detail.isOpen?(reducedMotion?1:Math.min(1,Math.max(.001,(now-microbeStart)/400))):0;
    const microbesMoving=microbes?.update({time:now/1000,reveal:microbeReveal,reducedMotion})??false;
    arch.updateView(rig.camera);
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
    if(changing||interaction||finalViewTransition||following||move.moving||focusMove.moving){adaptive.beginInteraction();requestRender();}
    else {
      if(!scrolling)adaptive.endInteraction();
      if(heroSpinning||microbesMoving||anatomyState.moving||fullAnatomyMoving||Math.abs(focusTarget-focusBlend)>.002||(microbeReveal>0&&microbeReveal<1))requestRender();
      else if(!scrolling){lastFrame=0;progressFrame=0;}
    }
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
    if(focusOrigin&&focusedFdi!==null&&!focusReturning){
      const mesh=arch.teeth.get(focusedFdi)?.mesh, current=view.capture();
      const destination=fullArchFocus.destination(mesh,rig,rig.camera,current);
      if(destination)fullArchFocus.begin(current,destination.snapshot,{instant:reducedMotion});
    }
    setProgress(progress);
    requestRender();
  }
  function dispose() {
    if(disposed)return;
    disposed=true;ready=false;listeners.abort();
    if(frame)cancelAnimationFrame(frame);frame=0;clearTimeout(settleTimer);clearTimeout(deferredTimer);
    releaseRendererLuts(renderer,scene);
    observer?.disconnect();scroll?.dispose();controls?.dispose();view?.dispose();annotations?.dispose();rig?.dispose();adaptive?.dispose();lighting?.dispose();detail.dispose();anatomyControls.dispose();fullAnatomyControls.dispose();ui.dispose();
    fullArchAnatomy?.dispose();
    heroAnatomy?.dispose();
    microbes?.dispose();brush?.dispose();plaque?.dispose();caries?.dispose();
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
  canvas.addEventListener('pointerdown',event=>{
    if(!event.isPrimary){cavityPointer=null;return;}
    if(event.pointerType==='mouse'&&event.button!==0)return;
    cavityPointer={id:event.pointerId,x:event.clientX,y:event.clientY};
  },{signal});
  canvas.addEventListener('pointercancel',()=>{cavityPointer=null;},{signal});
  canvas.addEventListener('pointerup',event=>{
    const start=cavityPointer;cavityPointer=null;
    if(!start||start.id!==event.pointerId||Math.hypot(event.clientX-start.x,event.clientY-start.y)>9||!storyReady||detailPending||detail.isOpen)return;
    const box=canvas.getBoundingClientRect();
    pointerNdc.set((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2);
    raycaster.setFromCamera(pointerNdc,rig.camera);
    if(dentalState.chapterId==='dentition'&&fullAnatomyActive&&fullAnatomyWeight>.95){
      const candidates=[...arch.teeth.values()].map(item=>item.mesh).filter(mesh=>mesh?.visible);
      const hit=raycaster.intersectObjects(candidates,false)[0];
      if(hit?.object.userData.fdi)focusTooth(hit.object.userData.fdi);
      return;
    }
    if(dentalState.chapterId!=='caries'||dentalState.lesionDisplay<=.5)return;
    const candidates=[36,37].map(id=>arch.teeth.get(id)?.mesh).filter(mesh=>mesh?.visible);
    const hit=raycaster.intersectObjects(candidates,false)[0];
    if(hit?.object===arch.teeth.get(36).mesh && hit.point.distanceTo(new THREE.Vector3().fromArray(site.lesion.centerWorldCm))<.22)detail.request();
  },{signal});
  window.addEventListener('pagehide',(e)=>{if(!e.persisted)dispose();},{signal});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;lastFrame=0;progressFrame=0;anatomyMotion.resetClock();adaptive?.endInteraction();}
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
      heroAnatomy=createHeroAnatomy({arch});
      const timeline=createTimeline({landmarks:arch.landmarks,cameraOptions:config.camera});
      rig=createJourneyCamera({timeline,config,sampleOnly:true});
      view=createViewController({camera:rig.camera,config});view.setStoryPose(rig.pose);view.update();
      adaptive=createAdaptiveQuality({renderer,profile,requestRender,config});
      controls=createModelGestures({canvas,view,config,signal,
        onStart(){if(fullArchFocus.active){fullArchFocus.cancel();focusReturning=false;}interaction=true;adaptive.beginInteraction();requestRender();},
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
      // Compile both hero variants before the first animated frame. Otherwise
      // the first translucent frame can block the main thread during the orbit.
      const warmTarget=new THREE.WebGLRenderTarget(1,1);
      const previousTarget=renderer.getRenderTarget();
      try {
        // Compile against the canvas output settings; render targets may use
        // a different colour space and therefore a different shader variant.
        renderer.setRenderTarget(null);
        heroAnatomy.setWeight(1);
        await renderer.compileAsync(scene,rig.camera);
        if(disposed||contextLost)return controller;
        renderer.setRenderTarget(warmTarget);
        renderer.render(scene,rig.camera);
        renderer.setRenderTarget(null);
        heroAnatomy.setWeight(0);
        await renderer.compileAsync(scene,rig.camera);
        if(disposed||contextLost)return controller;
        renderer.setRenderTarget(warmTarget);
        renderer.render(scene,rig.camera);
      } finally {
        renderer.setRenderTarget(previousTarget);
        warmTarget.dispose();
      }
      if(disposed||contextLost)return controller;
      if(shaderError)throw new Error('Dental surface shader failed to compile.');
      ready=true;canvas.dataset.ready='true';canvas.dataset.profile=profile.name;canvas.dataset.revision=config.revision;
      resize();scroll=createScrollDriver({section,stage,onProgress:setProgress});
      Object.assign(controller,{scene,renderer,rig,controls,view,arch,profile,adaptive});
      requestRender();
      // Decoding the complete atlas competes with the introductory orbit on
      // mobile. Start after the orbit, or immediately when the visitor moves on.
      let deferredStarted=false;
      startDeferredAssets=async()=>{
        if(disposed||deferredStarted)return;
        deferredStarted=true;clearTimeout(deferredTimer);
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
          // The visitor may already be inspecting the hero when its atlas
          // arrives. Capture neutral materials for the full arch without
          // showing a transient frame or changing the user's selected view.
          const previousHeroWeight=heroAnatomy.weight;
          if(previousHeroWeight)heroAnatomy.setWeight(0);
          try { fullArchAnatomy=createFullArchAnatomy({arch}); }
          finally { if(previousHeroWeight)heroAnatomy.setWeight(previousHeroWeight); }
          microbes=createCariesMicrobes({arch,site});
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
          // Initiate translucent variants synchronously, then restore the
          // actual view before yielding: no offscreen state can flash on the
          // canvas while the compiler completes in the background.
          const savedHeroWeight=heroAnatomy.weight;
          let fullCompile;
          try {
            if(savedHeroWeight)heroAnatomy.setWeight(0);
            fullArchAnatomy.setWeight(1);
            fullCompile=renderer.compileAsync(scene,rig.camera);
          } finally {
            fullArchAnatomy.setWeight(0);
            if(savedHeroWeight)heroAnatomy.setWeight(savedHeroWeight);
          }
          await fullCompile;
          if(disposed||contextLost)return;
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
      };
      if(progress>.035||reducedMotion)startDeferredAssets();
      else deferredTimer=setTimeout(startDeferredAssets,20000);
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
