import * as THREE from 'three';
import { experienceConfig } from './config.js';
import { createScene, disposeObject, releaseRendererLuts } from './scene.js';
import { loadManifest, loadModel, loadStoryData, loadCrownAtlas } from './assets.js';
import { createArch } from './arch.js';
import { createLighting } from './lighting.js';
import { createTimeline } from './timeline.js';
import { createJourneyCamera } from './camera.js';
import { createScrollDriver } from './scroll.js';
import { createNavigationMotion } from './navigation-motion.js';
import { createInterface } from './interface.js';
import { sampleDentalStory, sampleReducedDentalStory } from './dental-story.js';
import { createStoryCameraConfig } from './story-camera.js';
import { createCleaningPath, makePathSample } from './cleaning-path.js';
import { createInterdentalBrush } from './interdental-brush.js';
import { createPlaque } from './plaque.js';
import { createViewController } from './view-controller.js';
import { createModelGestures } from './gestures.js';
import { createAnnotations } from './annotations.js';
import { createHealthyAnatomyUI } from './healthy-anatomy-ui.js';
import { createExplodedAnatomy } from './exploded-anatomy.js';
import { createHeroSpin } from './hero-spin.js';
import { createHeroAnatomy } from './hero-anatomy.js';
import { createHeroAnatomyMotion } from './hero-anatomy-motion.js';
import { createHeroAnatomyControls } from './hero-anatomy-controls.js';
import { createFullArchAnatomy } from './full-arch-anatomy.js';
import { createFullArchAnatomyControls } from './full-arch-anatomy-controls.js';
import { createFullArchFocus } from './full-arch-focus.js';
import { prewarmSmileMaterials } from './smile-prewarm.js';
import { createManualCleaning } from './manual-cleaning.js';
import { createManualCleaningUI } from './manual-cleaning-ui.js';
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
  let site,anatomyPlate,plaque,brush,path,view,annotations,heroAnatomy,fullArchAnatomy,storyReady=false;
  const dentalState={brushPose:{}};
  sampleDentalStory(0,dentalState);
  let frame=0,renderedFrames=0,lastFrame=0,settleTimer,deferredTimer,ready=false,disposed=false,shaderError=false,contextLost=false;
  let startDeferredAssets=()=>{};
  let logicalWidth=0,logicalHeight=0,fittedRig=null;
  let progress=0,storyProgress=0,reducedMotion=false,exploring=false,interaction=false,scrolling=false,atlasError=false;
  let renderProgress=0,progressFrame=0;
  let navigationMotion=null;
  const manualCleaning=createManualCleaning(),manualState={brushPose:{}};
  const manualStart=makePathSample(),manualEnd=makePathSample();
  const manualPointA=new THREE.Vector3(),manualPointB=new THREE.Vector3(),manualGripPoint=new THREE.Vector3();
  let manual=null,manualPointer=null,manualClock=0,manualAxis={x:1,y:0,lengthSq:1};
  let inspectionProgress=0,manualProgress=0,manualChapter=null,finalView='smile';
  const finalTimelines={};let smileWeight=1,finalViewTransition=null;
  let fullAnatomyActive=false,fullAnatomyWeight=0,fullAnatomyFrame=0,pendingFinalView=null;
  let focusedFdi=null,focusOrigin=null,focusReturning=false,focusBlend=0,focusFrame=0,focusSensorApplied=false;
  const heroSpin=createHeroSpin();
  const anatomyMotion=createHeroAnatomyMotion();
  const healthyAnatomy={active:false,spread:0,expanded:false,motion:null};
  const fullArchFocus=createFullArchFocus();
  const raycaster=new THREE.Raycaster(),pointerNdc=new THREE.Vector2();
  let toothPointer=null;
  canvas.dataset.ready='false'; canvas.dataset.assetsReady='false';
  const ui=createInterface({config,section,stage,signal,navigate,navigationTarget:()=>navigationMotion?.target??null,explore:toggleExplore,reset:resetView,zoom,finalView:selectFinalView});
  const manualUI=createManualCleaningUI({stage,onStart:startManualCleaning,onExit:exitManualCleaning,
    onReset(){manualCleaning.reset();if(manual)manual.resultAt=0;requestRender();},
    onPointerStart(event){
      if(!manual||manual.phase!=='active'||!manualCleaning.beginDrag())return;
      manualPointer={x:event.clientX,y:event.clientY};requestRender();
    },
    onPointerMove(event){
      if(!manualPointer||!manual||manual.phase!=='active')return;
      const dx=event.clientX-manualPointer.x,dy=event.clientY-manualPointer.y;
      manualPointer.x=event.clientX;manualPointer.y=event.clientY;
      manualCleaning.dragBy((dx*manualAxis.x+dy*manualAxis.y)/manualAxis.lengthSq);requestRender();
    },
    onPointerEnd(){manualPointer=null;manualCleaning.endDrag();requestRender();},
    onKey(key){
      if(!manual||manual.phase!=='active'||!manualCleaning.beginDrag())return;
      const delta=key==='Home'?-1:key==='End'?1:(key==='ArrowRight'||key==='ArrowUp' ? .08 : -.08);
      manualCleaning.dragBy(delta);manualCleaning.endDrag();requestRender();
    }});
  const chapterNumber=config.presentation.steps.findIndex(step=>step.id==='anatomy')+1;
  const healthyAnatomyUI=createHealthyAnatomyUI({stage,signal,chapterNumber,chapterCount:config.presentation.steps.length,onToggle:toggleAnatomySpread});
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
  function manualCameraPose(p) {
    const pose=rig.setProgress(p,{reducedMotion:false,alternateWeight:1-smileWeight});
    view.setStoryPose(pose);
    const radius=Math.max(1.1,pose.position.distanceTo(pose.target)*Math.tan(THREE.MathUtils.degToRad(config.camera.fov/2))*.68);
    lighting?.update(pose.target,radius);
  }
  function startManualCleaning() {
    if(!storyReady||!path||!brush||!plaque||manual||healthyAnatomy.active||dentalState.chapterId!=='brush')return;
    navigationMotion=null;
    const savedView=view.capture(),wasExploring=exploring;
    const original=exploring?inspectionProgress:renderProgress;
    leaveExplore();interaction=false;controls.enabled=false;
    manualCleaning.reset();
    sampleDentalStory(.62,manualState);
    arch.setState(manualState);
    plaque.setState({visible:true,opacity:1,progress:0});
    brush.setPose(manualCleaning.state.pose);canvas.style.opacity='1';
    document.querySelector('#journey-annotations').hidden=true;
    const now=performance.now();
    manual={phase:'entering',resume:original,savedView,wasExploring,cameraFrom:original,cameraTo:.645,
      cameraProgress:original,began:now,resultAt:0,pendingNavigation:null,
      returnPose:{...dentalState.brushPose},returnPlaque:dentalState.cleaningProgress};
    manualClock=0;manualPointer=null;
    view.reset(now,reducedMotion);updateUI();requestRender();
  }
  function exitManualCleaning(next=null) {
    if(!manual)return;
    if(next!==null)manual.pendingNavigation=next;
    if(manual.phase==='returning'||manual.phase==='restoring')return;
    manualPointer=null;manualCleaning.endDrag();
    manual.phase='returning';manual.cameraFrom=manual.cameraProgress;manual.cameraTo=manual.resume;
    manual.began=performance.now();view.reset(manual.began,reducedMotion);requestRender();
  }
  function finishManualCleaning() {
    const saved=manual;
    if(!saved)return;
    manual=null;manualPointer=null;manualClock=0;
    document.querySelector('#journey-annotations').hidden=false;
    controls.enabled=true;controls.setFree(saved.wasExploring);
    exploring=saved.wasExploring;inspectionProgress=saved.resume;
    progress=saved.resume;storyProgress=saved.resume;renderProgress=saved.resume;
    ui.scrollTo(saved.resume,true);applyState(saved.resume,true);
    manualUI.update({chapterId:dentalState.chapterId,ready:storyReady,active:false});
    updateUI();requestRender();
    if(saved.pendingNavigation!==null)navigate(saved.pendingNavigation);
  }
  function updateManualProjection() {
    path.sample(path.tipArcMm(0,0),manualStart);path.sample(path.tipArcMm(1,1),manualEnd);
    manualPointA.copy(manualStart.position).project(rig.camera);
    manualPointB.copy(manualEnd.position).project(rig.camera);
    const width=canvas.clientWidth,height=canvas.clientHeight;
    const ax=(manualPointB.x-manualPointA.x)*width*.5,ay=-(manualPointB.y-manualPointA.y)*height*.5;
    const lengthSq=ax*ax+ay*ay;
    // The prepared side view makes the corridor visible. Keep keyboard input
    // available even if an unusually narrow viewport foreshortens it.
    manualAxis=lengthSq>100?{x:ax,y:ay,lengthSq}:{x:120,y:0,lengthSq:14400};
    manualGripPoint.copy(brush.object.position).addScaledVector(path.directionWorld,-.35).project(rig.camera);
    // Put the handle just beside the projected shaft instead of over the
    // bristle/tooth contact. The actual drag axis remains unchanged.
    const length=Math.sqrt(manualAxis.lengthSq);
    return {x:(manualGripPoint.x+1)*width*.5-manualAxis.y/length*35,
      y:(1-manualGripPoint.y)*height*.5+manualAxis.x/length*35};
  }
  function showError(text,error,{upcoming=false}={}) {
    if(disposed)return;
    status.hidden=false;status.classList.add('error');status.classList.toggle('is-upcoming',upcoming);
    status.setAttribute('role','alert');message.textContent=text;retry.hidden=false;
    canvas.dataset.error=error?.message??text;
    if(!upcoming){
      ready=false;canvas.dataset.ready='false';
      document.body.removeAttribute('data-journey-loading');
      document.querySelector('#journey-annotations').hidden=true;
    }
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
    if(!manual)manualUI.update({chapterId:dentalState.sceneProgress>=.51?dentalState.chapterId:'',ready:storyReady,active:false});
  }
  function leaveExplore(){if(!exploring)return;exploring=false;controls.setFree(false);interaction=false;}
  function navigate(next) {
    if(manual){exitManualCleaning(next);return;}
    cancelFullArchFocus();
    if(next>.035)startDeferredAssets();
    leaveExplore();
    manualChapter=null;
    const rect=section.getBoundingClientRect();
    const travel=Math.max(1,rect.height-stage.getBoundingClientRect().height);
    const base=window.scrollY+rect.top;
    navigationMotion=null;
    if(Math.abs(progress-next)*travel<1||reducedMotion||!ready){
      ui.scrollTo(next,true);setProgress(next);
    } else {
      // Drive the native scrollbar in the existing frame loop. Camera, copy,
      // brush and teeth all continue to follow its one story progress.
      navigationMotion={motion:createNavigationMotion(progress,next,performance.now()),base,travel,target:next};
      if(view)applyState(dentalState.progress,true);
    }
    if(view?.modified)view.reset(performance.now(),reducedMotion);
    updateUI();
    requestRender();
  }
  function enterExplore(focus=false) {
    if(!ready||disposed||healthyAnatomy.active)return false;
    if(exploring)return true;
    navigationMotion=null;
    exploring=true;inspectionProgress=dentalState.progress;
    controls.setFree(true);
    if(focus)canvas.focus({preventScroll:true});
    updateUI();requestRender();return true;
  }
  function toggleExplore() {
    if(manual){exitManualCleaning();return;}
    if(healthyAnatomy.active)return;
    if(exploring){
      cancelFullArchFocus();
      const resume=inspectionProgress;leaveExplore();manualChapter=null;
      ui.scrollTo(resume,true);setProgress(resume);view.reset(performance.now(),reducedMotion);
    }
    else enterExplore(true);
    requestRender();
  }
  function resetView() {
    if(!ready||healthyAnatomy.active)return;
    cancelFullArchFocus();
    heroSpin.release();
    manualChapter=null;view.reset(performance.now(),reducedMotion);
    requestRender();
  }
  function markManual(){
    manualProgress=progress;manualChapter=dentalState.chapterId;requestRender();
  }
  function zoom(factor) {
    if(!ready||healthyAnatomy.active)return;
    if(fullArchFocus.active){fullArchFocus.cancel();focusReturning=false;}
    view.zoomBy(factor);markManual();
  }
  function toggleAnatomySpread() {
    if(!healthyAnatomy.active)return;
    const {spread}=healthyAnatomy;
    const expanded=!healthyAnatomy.expanded;
    const target=Number(expanded);
    healthyAnatomy.expanded=expanded;
    healthyAnatomy.motion={from:spread,target,began:performance.now(),duration:420+520*Math.abs(target-spread)};
    requestRender();
  }
  function fitAnatomyPlate() {
    healthyAnatomyUI.positionLabels(anatomyPlate.layout(logicalWidth,logicalHeight,healthyAnatomyUI.gutters()));
  }
  function updateHealthyAnatomy(now) {
    const p=dentalState.sceneProgress;
    const weight=storyReady
      ? THREE.MathUtils.smoothstep(p,.10,.135)*(1-THREE.MathUtils.smoothstep(p,.205,.236))
      : 0;
    // A short dip switches the shared canvas between the two camera layers.
    // Both directions sample the same scroll progress.
    const active=weight>=.5;
    const opacity=active?THREE.MathUtils.smoothstep(weight,.5,1):1-THREE.MathUtils.smoothstep(weight,0,.5);
    const value=String(opacity);
    if(canvas.style.opacity!==value)canvas.style.opacity=value;
    if(active!==healthyAnatomy.active){
      healthyAnatomy.active=active;
      healthyAnatomyUI.setVisible(active);
      controls.enabled=!active;
      if(active)fitAnatomyPlate();
      else{
        anatomyPlate.setSpread(0);
        Object.assign(healthyAnatomy,{spread:0,expanded:false,motion:null});
        healthyAnatomyUI.update(false,false,0);
      }
    }
    if(!active)return false;
    const motion=healthyAnatomy.motion;
    if(motion){
      const t=reducedMotion?1:THREE.MathUtils.clamp((now-motion.began)/motion.duration,0,1);
      healthyAnatomy.spread=THREE.MathUtils.lerp(motion.from,motion.target,THREE.MathUtils.smootherstep(t,0,1));
      const points=anatomyPlate.setSpread(healthyAnatomy.spread);
      if(t===1){
        healthyAnatomy.motion=null;
        if(healthyAnatomy.expanded)healthyAnatomyUI.positionLabels(points);
      }
    }
    healthyAnatomyUI.update(healthyAnatomy.expanded,healthyAnatomy.expanded&&!healthyAnatomy.motion,opacity);
    return Boolean(healthyAnatomy.motion);
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
    if(manual){reducedMotion=Boolean(motion);return null;}
    if(motion&&navigationMotion){
      next=navigationMotion.target;navigationMotion=null;ui.scrollTo(next,true);
    }
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
    plaque?.setState({visible:dentalState.sceneProgress<.80,opacity:dentalState.plaqueDeposition,progress:dentalState.cleaningProgress});
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
      manualCleaning:manual?{active:true,transition:manual.phase,position:manualCleaning.state.position,
        target:manualCleaning.state.target,phase:manualCleaning.state.phase,cleaningProgress:manualCleaning.state.cleaningProgress,
        travelled:manualCleaning.state.travelled,passes:manualCleaning.state.completedPasses}:null,
      heroSpin:{state:heroSpin.state,angle:heroSpin.angle},
      healthyAnatomy:{active:healthyAnatomy.active,spread:healthyAnatomy.spread,expanded:healthyAnatomy.expanded},
      heroAnatomy:{weight:heroAnatomy?.weight??0},
      fullAnatomy:fullArchAnatomy?.report()??{weight:0,teeth:0},
      focusedTooth:focusedFdi,focusMoving:fullArchFocus.active,focusReturning,focusHasOrigin:Boolean(focusOrigin),
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
      story:{chapterId:dentalState.chapterId,sceneProgress:dentalState.sceneProgress,cleaningProgress:dentalState.cleaningProgress,plaqueDeposition:dentalState.plaqueDeposition,plaqueCoverage:dentalState.plaqueCoverage,brushPose:{...dentalState.brushPose},plaque:plaque?.report(),brush:brush?.report()},
    };
  }
  function renderManual(now) {
    if(!manual)return;
    const dt=manualClock?Math.min(.05,Math.max(0,(now-manualClock)/1000)):1/60;manualClock=now;
    let amount=manual.phase==='active'?1:manual.phase==='restoring'?0:0;
    if(manual.phase==='entering'||manual.phase==='returning'){
      const t=reducedMotion?1:Math.min(1,Math.max(0,(now-manual.began)/850));
      const eased=t*t*(3-2*t);
      manual.cameraProgress=THREE.MathUtils.lerp(manual.cameraFrom,manual.cameraTo,eased);
      amount=manual.phase==='entering'?eased:1-eased;
      if(t===1&&manual.phase==='entering')manual.phase='active';
      else if(t===1&&manual.phase==='returning'){
        manual.phase='restoring';view.restore(manual.savedView,{instant:reducedMotion});
      }
    }
    manualCameraPose(manual.cameraProgress);
    const changing=view.update(now);
    if(manual.phase==='restoring'&&!changing){finishManualCleaning();return;}
    const state=manualCleaning.update(dt);
    if(state.phase==='result'&&!manual.resultAt)manual.resultAt=now;
    const resultVisibility=state.phase==='result'?(reducedMotion?0:Math.max(0,1-(now-manual.resultAt)/350)):1;
    const original=manual.returnPose;
    brush.setPose({visibility:THREE.MathUtils.lerp(original.visibility,state.pose.visibility*resultVisibility,amount),
      alignment:THREE.MathUtils.lerp(original.alignment,state.pose.alignment,amount),
      insertion:THREE.MathUtils.lerp(original.insertion,state.pose.insertion,amount),
      stroke:THREE.MathUtils.lerp(original.stroke,state.pose.stroke,amount),phase:state.pose.phase});
    plaque.setState({visible:true,opacity:1,progress:THREE.MathUtils.lerp(manual.returnPlaque,state.cleaningProgress,amount)});
    const grip=updateManualProjection();
    manualUI.update({chapterId:'brush',ready:true,active:true,phase:state.phase,
      started:state.furthestInsertion>.005||state.position>.005,gripX:grip.x,gripY:grip.y,
      position:state.position,canDrag:manual.phase==='active',angle:Math.atan2(manualAxis.y,manualAxis.x)*180/Math.PI});
    arch.updateView(rig.camera);
    try{renderer.info.reset();renderer.render(scene,rig.camera);renderedFrames++;}
    catch(error){showError('3D zobrazenie sa nepodarilo vykresliť.',error);return;}
    canvas.dataset.frameCount=String(renderedFrames);
    if(manual.phase!=='active'||state.moving||state.dragging||changing||(state.phase==='result'&&resultVisibility>0))requestRender();
    else {manualClock=0;lastFrame=0;}
  }
  function render(now) {
    frame=0;
    if(disposed||document.hidden||!ready){lastFrame=0;return;}
    if(manual){renderManual(now);return;}
    if(navigationMotion){
      const {progress:at,done}=navigationMotion.motion.sample(now);
      window.scrollTo({top:navigationMotion.base+at*navigationMotion.travel,behavior:'instant'});
      setProgress(at);
      if(done)navigationMotion=null;
    }
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
      if(view?.modified&&manualChapter&&dentalState.chapterId!==manualChapter){
        const travel=Math.max(1,section.getBoundingClientRect().height-stage.getBoundingClientRect().height);
        if(Math.abs(progress-manualProgress)*travel>(config.interaction.handoverScrollPx??64)){
          manualChapter=null;view.reset(now,reducedMotion);
        }
      }
      canvas.dataset.stage=dentalState.chapterId;
      canvas.dataset.sceneProgress=dentalState.sceneProgress.toFixed(6);
      updateUI();
    }
    progressFrame=now;
    // ResizeObserver owns stage changes. Reading layout after UI writes in
    // every moving frame forces synchronous layout on mobile browsers.
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
    fullAnatomyControls.update({visible:finale&&finalView==='anatomy'&&(reducedMotion||dentalState.sceneProgress>=.978),enabled:storyReady,active:fullAnatomyActive,focused:focusedFdi!==null,selectedFdi:focusedFdi});
    if(pendingFinalView&&fullAnatomyWeight===0){const next=pendingFinalView;pendingFinalView=null;selectFinalView(next);}
    const fullAnatomyMoving=fullAnatomyWeight!==fullTarget;
    const focusMove=fullArchFocus.update(now);
    if(focusMove.snapshot){
      view.restore(focusMove.snapshot,{instant:reducedMotion});
      if(!focusMove.moving&&focusReturning){focusedFdi=null;focusOrigin=null;focusReturning=false;view.setGuidedZoomMinimum();}
    }
    const changing=view?.update(now)??false;
    const healthyAnatomyMoving=updateHealthyAnatomy(now);
    // Shift the sensor's aim into the free centre of the stage while the
    // tooth is isolated; the story rig restores its own framing afterwards.
    const sensor=rig.camera.view;
    if(sensor?.enabled&&(focusBlend>.001||focusSensorApplied)){
      const sx=THREE.MathUtils.lerp(rig.pose.screenX??.5,profile.compact?.5:.64,focusBlend);
      const sy=THREE.MathUtils.lerp(rig.pose.screenY??.5,profile.compact?.65:.57,focusBlend);
      rig.camera.setViewOffset(sensor.fullWidth,sensor.fullHeight,(.5-sx)*sensor.fullWidth,(.5-sy)*sensor.fullHeight,sensor.fullWidth,sensor.fullHeight);
      focusSensorApplied=focusBlend>.001;
    }
    if(!healthyAnatomy.active){
      arch.updateView(rig.camera);
      annotations?.update({state:dentalState,camera:rig.camera,brush,free:exploring});
    }
    if(lastFrame&&(interaction||changing||scrolling))adaptive.recordFrame(now-lastFrame);
    lastFrame=now;
    try {
      const camera=healthyAnatomy.active?anatomyPlate.camera:rig.camera;
      renderer.info.reset();renderer.render(scene,camera);renderedFrames++;
      if(shaderError)throw new Error('Dental surface shader failed to compile.');
    }catch(error){showError('3D zobrazenie sa nepodarilo vykresliť.',error);return;}
    if(renderedFrames===1)document.body.removeAttribute('data-journey-loading');
    canvas.dataset.frameCount=String(renderedFrames);
    canvas.dataset.shaderErrors=String(shaderError?1:0);
    canvas.dataset.visibleTeeth=String(arch.visibleCount);
    if(changing||interaction||finalViewTransition||following||navigationMotion||focusMove.moving||healthyAnatomyMoving){adaptive.beginInteraction();requestRender();}
    else {
      if(!scrolling)adaptive.endInteraction();
      if(heroSpinning||anatomyState.moving||fullAnatomyMoving||Math.abs(focusTarget-focusBlend)>.002)requestRender();
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
    if(manual){manualCameraPose(manual.cameraProgress);requestRender();return;}
    applyState(exploring?inspectionProgress:dentalState.progress,true);
    if(healthyAnatomy.active)fitAnatomyPlate();
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
    observer?.disconnect();scroll?.dispose();controls?.dispose();view?.dispose();annotations?.dispose();rig?.dispose();adaptive?.dispose();lighting?.dispose();healthyAnatomyUI.dispose();anatomyControls.dispose();fullAnatomyControls.dispose();manualUI.dispose();ui.dispose();
    anatomyPlate?.dispose();
    fullArchAnatomy?.dispose();
    heroAnatomy?.dispose();
    brush?.dispose();plaque?.dispose();
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
    if(!event.isPrimary||dentalState.chapterId!=='dentition'||!fullAnatomyActive){toothPointer=null;return;}
    if(event.pointerType==='mouse'&&event.button!==0)return;
    toothPointer={id:event.pointerId,x:event.clientX,y:event.clientY};
  },{signal});
  canvas.addEventListener('pointercancel',()=>{toothPointer=null;},{signal});
  canvas.addEventListener('pointerup',event=>{
    const start=toothPointer;toothPointer=null;
    if(!start||start.id!==event.pointerId||Math.hypot(event.clientX-start.x,event.clientY-start.y)>9||!storyReady||
      dentalState.chapterId!=='dentition'||!fullAnatomyActive||fullAnatomyWeight<=.95)return;
    const box=canvas.getBoundingClientRect();
    pointerNdc.set((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2);
    raycaster.setFromCamera(pointerNdc,rig.camera);
    const candidates=[...arch.teeth.values()].map(item=>item.mesh).filter(mesh=>mesh?.visible);
    const hit=raycaster.intersectObjects(candidates,false)[0];
    if(hit?.object.userData.fdi)focusTooth(hit.object.userData.fdi);
  },{signal});
  window.addEventListener('pagehide',(e)=>{if(!e.persisted)dispose();},{signal});
  // Any new user gesture takes precedence over an in-flight button journey.
  window.addEventListener('wheel',()=>{navigationMotion=null;},{passive:true,signal});
  window.addEventListener('pointerdown',(event)=>{
    if(!event.target.closest?.('#journey-mobile-next, #journey-mobile-previous, .journey-step, #journey-home, #journey-show-all'))navigationMotion=null;
  },{passive:true,signal});
  window.addEventListener('keydown',(event)=>{
    if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))navigationMotion=null;
  },{signal});
  window.addEventListener('resize',()=>{navigationMotion=null;},{signal});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){navigationMotion=null;if(frame)cancelAnimationFrame(frame);frame=0;lastFrame=0;progressFrame=0;anatomyMotion.resetClock();adaptive?.endInteraction();}
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
        onStart(){
          if(fullArchFocus.active){fullArchFocus.cancel();focusReturning=false;}
          interaction=true;adaptive.beginInteraction();requestRender();
        },
        onEnd(){interaction=false;requestRender();},onChange:markManual});
      canvas.addEventListener('keydown',(event)=>{
        if(manual||!controls.enabled)return;
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
            loadCrownAtlas(config,signal),
          ]);
          if(results[0].status==='fulfilled')atlas=results[0].value;
          if(results[1].status==='fulfilled')upperMolar=results[1].value;
          if(disposed||contextLost){disposeObject(atlas?.object);disposeObject(upperMolar?.object);atlas=undefined;upperMolar=undefined;return;}
          for(const result of results)if(result.status==='rejected')throw result.reason;
          arch.attachAtlas(atlas,upperMolar);
          arch.attachCrowns(results[3].value);
          site=results[2].value;
          // The visitor may already be inspecting the hero when its atlas
          // arrives. Capture neutral materials for the full arch without
          // showing a transient frame or changing the user's selected view.
          const previousHeroWeight=heroAnatomy.weight;
          if(previousHeroWeight)heroAnatomy.setWeight(0);
          try { fullArchAnatomy=createFullArchAnatomy({arch}); }
          finally { if(previousHeroWeight)heroAnatomy.setWeight(previousHeroWeight); }
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
          Object.assign(controller,{rig,site,plaque,brush,path,annotations,timeline:expanded});
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
          // The opaque crown program differs from the initially hidden,
          // transparent one. Compile it before the scroll-driven handover.
          await prewarmSmileMaterials({arch,renderer,scene,camera:rig.camera,isAlive:()=>!disposed&&!contextLost});
          if(disposed||contextLost)return;
          await renderer.compileAsync(scene,rig.camera);
          if(disposed||contextLost)return;
          anatomyPlate=createExplodedAnatomy(scene,arch.teeth.get(36).mesh,config);
          await renderer.compileAsync(anatomyPlate.models,anatomyPlate.camera,scene);
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
