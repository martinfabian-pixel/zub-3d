import * as THREE from 'three';
import { experienceConfig } from './config.js';
import { createScene, disposeObject, releaseRendererLuts } from './scene.js';
import { loadManifest, loadModel, loadStoryData, loadCrownAtlas } from './assets.js';
import { createArch } from './arch.js';
import { createLighting } from './lighting.js';
import { createTimeline } from './timeline.js';
import { createJourneyCamera } from './camera.js';
import { createScrollDriver, getJourneyScrollMetrics } from './scroll.js';
import { createScrollReadiness } from './scroll-readiness.js';
import { createNavigationMotion } from './navigation-motion.js';
import { createInterface } from './interface.js';
import { sampleDentalStory, sampleReducedDentalStory } from './dental-story.js';
import { createIntroCameraOptions, createStoryCameraConfig } from './story-camera.js';
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
import { createFullArchBrushing } from './full-arch-brushing.js';
import { createFullArchBrushingControls } from './full-arch-brushing-controls.js';
import { createStartupHandoff } from './startup-handoff.js';
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
  const startupHandoff=createStartupHandoff({stage,canvas});
  const status=document.querySelector('#journey-status');
  const message=document.querySelector('#journey-message');
  const explore=document.querySelector('#journey-explore');
  const retry=document.querySelector('#journey-retry');
  const listeners=new AbortController(), signal=listeners.signal;
  const profile=chooseQuality(config);
  const query=new URLSearchParams(location.search), qa=query.has('qa'), clay=query.get('material')==='clay';
  let renderer,scene,arch,lighting,rig,controls,scroll,adaptive,observer,hero,atlas,upperMolar;
  let site,anatomyPlate,plaque,brush,path,view,annotations,heroAnatomy,fullArchAnatomy;
  let studyReady=false,flightReady=false,storyReady=false;
  const studyLimit=config.presentation.steps.find(step=>step.id==='dentition').start-.001;
  const flightLimit=config.anatomy.crownHandoverRange[0];
  const scrollReadiness=createScrollReadiness(config.presentation.steps.find(step=>step.id==='space').start-.001);
  const navigationTarget=()=>scrollReadiness.pendingTarget??navigationMotion?.target??null;
  applyScrollLimit();
  const dentalState={brushPose:{}};
  sampleDentalStory(0,dentalState);
  let frame=0,renderedFrames=0,lastFrame=0,settleTimer,ready=false,disposed=false,shaderError=false,contextLost=false;
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
  let fullBrushing,brushingRun=null,smileBacking,brushingFraming=0;
  const brushingFocus=new THREE.Vector3();
  let focusedFdi=null,focusOrigin=null,focusReturning=false,focusBlend=0,focusFrame=0,focusSensorApplied=false;
  const heroSpin=createHeroSpin();
  const anatomyMotion=createHeroAnatomyMotion();
  const healthyAnatomy={active:false,plate:false,spread:0,expanded:false,motion:null,labels:false};
  const fullArchFocus=createFullArchFocus();
  const raycaster=new THREE.Raycaster(),pointerNdc=new THREE.Vector2();
  let toothPointer=null;
  canvas.dataset.ready='false'; canvas.dataset.assetsReady='false';
  const ui=createInterface({config,section,stage,signal,navigate,navigationTarget,explore:toggleExplore,reset:resetView,zoom,finalView:selectFinalView});
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
  const brushingControls=createFullArchBrushingControls({stage,signal,onToggle:toggleFullBrushing,onNext:nextBrushingPhase});

  function canBrushFullArch() {
    return storyReady&&dentalState.chapterId==='dentition'&&finalView==='smile'&&arch.crownMix>.99999&&!finalViewTransition;
  }
  function toggleFullBrushing() {
    if(brushingRun){stopFullBrushing();return;}
    if(!canBrushFullArch())return;
    const snapshot=view.capture();
    if(exploring){
      const at=inspectionProgress;
      leaveExplore();ui.scrollTo(at,true);setProgress(at);
    }
    navigationMotion=null;
    if(!fullBrushing){
      fullBrushing=createFullArchBrushing({arch});
      scene.add(fullBrushing.object);
      smileBacking=arch.object.getObjectByName('Discreet enamel-coloured smile contact backing');
    }
    if(!fullBrushing.start())return;
    brushingRun={snapshot,lastFrame:0,demo:null};
    controls.enabled=false;
    requestRender();
  }
  function stopFullBrushing() {
    if(!brushingRun)return;
    fullBrushing.stop();
    view.restore(brushingRun.snapshot,{instant:reducedMotion});
    brushingRun=null;
    controls.enabled=true;
    requestRender();
  }
  function nextBrushingPhase() {
    if(!brushingRun)return;
    if(!fullBrushing.next()){
      // Restore the settled reference before sampling a new demonstration.
      fullBrushing.stop();
      arch.setState(dentalState);
      fullBrushing.start();
    }
    brushingRun.lastFrame=0;
    requestRender();
  }
  function updateFullBrushing(now) {
    if(!brushingRun)return false;
    if(!canBrushFullArch()){stopFullBrushing();return false;}
    const dt=brushingRun.lastFrame?Math.min(.05,(now-brushingRun.lastFrame)*.001):0;
    brushingRun.lastFrame=now;
    const demo=fullBrushing.update(dt,{reducedMotion});
    brushingRun.demo=demo;
    for(const item of arch.teeth.values()){
      const crown=item.crown;
      crown.matrix.elements[13]+=demo.jawOpening*(item.upper?.62:-.38);
      crown.updateMatrixWorld(true);
    }
    brushingFocus.copy(demo.focus).sub(rig.pose.target).multiplyScalar(profile.compact?.32:.43);
    const inner=THREE.MathUtils.smoothstep(Math.abs(demo.viewYaw),1.02,2.3);
    const distance=THREE.MathUtils.lerp(profile.compact?1.04:1.02,profile.compact?1.26:1.12,inner);
    view.restore({yaw:demo.viewYaw,pitch:demo.viewPitch,zoom:Math.log(distance),focus:brushingFocus.toArray()},
      {instant:reducedMotion});
    return !reducedMotion&&!demo.done;
  }

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
    if(!studyReady||manual||healthyAnatomy.active||dentalState.chapterId!=='brush')return;
    cancelNavigation();
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
    manualUI.update({chapterId:dentalState.chapterId,ready:studyReady,active:false});
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
      startupHandoff.finish();
      document.querySelector('#journey-annotations').hidden=true;
    }
    updateUI();
  }
  function updateUI() {
    const complete=storyReady;
    ui.update({progress:exploring?inspectionProgress:storyProgress,ready,complete,exploring,finalView,compact:profile.compact,state:dentalState,reducedMotion});
    if(ready){
      const atBoundary=scrollReadiness.limit<1&&progress>=scrollReadiness.limit-.002;
      status.hidden=!atBoundary;
      if(atBoundary&&!atlasError){
        status.classList.add('is-upcoming');message.textContent='Načítavam ďalšiu časť…';
      }
    }
    canvas.dataset.progress=progress.toFixed(6);
    canvas.dataset.exploring=String(exploring);
    canvas.dataset.mode=exploring?'free':'presentation';
    canvas.dataset.reducedMotion=String(reducedMotion);
    if(!manual)manualUI.update({chapterId:dentalState.sceneProgress>=.51?dentalState.chapterId:'',ready:studyReady,active:false});
  }
  function leaveExplore(){if(!exploring)return;exploring=false;controls.setFree(false);interaction=false;}
  function applyScrollLimit() {
    section.style.setProperty('--journey-ready-limit',String(scrollReadiness.limit));
    section.toggleAttribute('data-scroll-limited',scrollReadiness.limit<1);
  }
  function advanceScrollLimit(limit) {
    // Capture the native position before extending the document. A fling that
    // hit the former end is not a request to visit a later chapter.
    if(scroll&&!manual&&!exploring){
      const observed=scroll.getProgress();
      if(Math.abs(observed-progress)>.00025)setProgress(observed);
    }
    const next=scrollReadiness.advance(limit);
    applyScrollLimit();
    if(next!==null&&!manual&&!exploring)beginNavigation(next);
    updateUI();requestRender();
  }
  function cancelNavigation() {
    navigationMotion=null;
    scrollReadiness.cancel();
  }
  function navigate(next) {
    if(manual){exitManualCleaning(next);return;}
    stopFullBrushing();
    cancelFullArchFocus();
    leaveExplore();
    manualChapter=null;
    beginNavigation(scrollReadiness.plan(next));
    if(view?.modified)view.reset(performance.now(),reducedMotion);
    updateUI();
    requestRender();
  }
  function beginNavigation(next) {
    const {base,travel}=getJourneyScrollMetrics(section,stage);
    navigationMotion=null;
    if(Math.abs(progress-next)*travel<1||reducedMotion||!ready){
      ui.scrollTo(next,true);setProgress(next);
    } else {
      // Drive the native scrollbar in the existing frame loop. Camera, copy,
      // brush and teeth all continue to follow its one story progress.
      navigationMotion={motion:createNavigationMotion(progress,next,performance.now()),base,travel,target:next};
      if(view)applyState(dentalState.progress,true);
    }
  }
  function enterExplore(focus=false) {
    if(!ready||disposed||healthyAnatomy.active||brushingRun)return false;
    if(exploring)return true;
    cancelNavigation();
    exploring=true;inspectionProgress=dentalState.progress;
    controls.setFree(true);
    if(focus)canvas.focus({preventScroll:true});
    updateUI();requestRender();return true;
  }
  function toggleExplore() {
    if(manual){exitManualCleaning();return;}
    if(healthyAnatomy.active||brushingRun)return;
    if(exploring){
      cancelFullArchFocus();
      const resume=inspectionProgress;leaveExplore();manualChapter=null;
      ui.scrollTo(resume,true);setProgress(resume);view.reset(performance.now(),reducedMotion);
    }
    else enterExplore(true);
    requestRender();
  }
  function resetView() {
    if(!ready||healthyAnatomy.active||brushingRun)return;
    cancelFullArchFocus();
    heroSpin.release();
    manualChapter=null;view.reset(performance.now(),reducedMotion);
    requestRender();
  }
  function markManual(){
    manualProgress=progress;manualChapter=dentalState.chapterId;requestRender();
  }
  function zoom(factor) {
    if(!ready||healthyAnatomy.active||brushingRun)return;
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
    const active=Boolean(anatomyPlate)&&dentalState.chapterId==='anatomy';
    if(active!==healthyAnatomy.active){
      healthyAnatomy.active=active;
      healthyAnatomyUI.setVisible(active);
      controls.enabled=!active&&!brushingRun;
      if(active)fitAnatomyPlate();
      else{
        anatomyPlate.setSpread(0,rig.camera);
        Object.assign(healthyAnatomy,{plate:false,spread:0,expanded:false,motion:null,labels:false});
        healthyAnatomyUI.update(false,false,0);
      }
    }
    if(!active)return false;
    const motion=healthyAnatomy.motion;
    if(motion){
      const t=reducedMotion?1:THREE.MathUtils.clamp((now-motion.began)/motion.duration,0,1);
      healthyAnatomy.spread=THREE.MathUtils.lerp(motion.from,motion.target,THREE.MathUtils.smootherstep(t,0,1));
      if(t===1)healthyAnatomy.motion=null;
    }
    // The unopened model always remains the same story mesh. Ease a spread
    // back into that live pose if the visitor scrolls away from chapter 02.
    const envelope=reducedMotion?1:THREE.MathUtils.smoothstep(p,.10,.133)*(1-THREE.MathUtils.smoothstep(p,.185,.22));
    const displaySpread=healthyAnatomy.spread*envelope;
    healthyAnatomy.plate=displaySpread>0;
    const points=anatomyPlate.setSpread(displaySpread,rig.camera);
    const labels=displaySpread===1&&!healthyAnatomy.motion;
    if(labels&&!healthyAnatomy.labels)healthyAnatomyUI.positionLabels(points);
    healthyAnatomy.labels=labels;
    const opacity=reducedMotion?1:THREE.MathUtils.smoothstep(p,.10,.113)*(1-THREE.MathUtils.smoothstep(p,.207,.22));
    healthyAnatomyUI.update(healthyAnatomy.expanded,labels,opacity);
    return Boolean(healthyAnatomy.motion);
  }
  function selectFinalView(next){
    stopFullBrushing();
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
    if(!navigationMotion&&scrollReadiness.pendingTarget!==null&&next<progress-.002)scrollReadiness.cancel();
    const sample=scrollReadiness.sample(next);
    if(sample.blocked&&next-sample.progress>.00025)ui.scrollTo(sample.progress,true);
    progress=sample.progress;reducedMotion=Boolean(motion);
    if(brushingRun&&progress<(reducedMotion?.80:config.anatomy.crownHandoverRange[1]))stopFullBrushing();
    if(focusOrigin&&progress<.94)cancelFullArchFocus();
    storyProgress=THREE.MathUtils.lerp(config.story.startProgress,config.story.endProgress,progress);
    if(exploring){
      applyState(inspectionProgress,false);updateUI();requestRender();return null;
    }
    if(reducedMotion)renderProgress=storyProgress;
    clearTimeout(settleTimer);
    scrolling=true;
    adaptive?.beginInteraction();
    settleTimer=setTimeout(()=>{scrolling=false;if(!interaction){adaptive?.endInteraction();lastFrame=0;}},120);
    requestRender();
    return rig.pose;
  }
  function applyState(p,moveCamera) {
    if(reducedMotion)sampleReducedDentalStory(p,dentalState,scrollReadiness.limit);
    else sampleDentalStory(p,dentalState);
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
      readiness:{limit:scrollReadiness.limit,pendingTarget:scrollReadiness.pendingTarget,study:studyReady,flight:flightReady},
      manualCleaning:manual?{active:true,transition:manual.phase,position:manualCleaning.state.position,
        target:manualCleaning.state.target,phase:manualCleaning.state.phase,cleaningProgress:manualCleaning.state.cleaningProgress,
        travelled:manualCleaning.state.travelled,passes:manualCleaning.state.completedPasses}:null,
      heroSpin:{state:heroSpin.state,angle:heroSpin.angle},
      fullBrushing:brushingRun?.demo?{phase:brushingRun.demo.phase,done:brushingRun.demo.done,
        angleDegrees:brushingRun.demo.angleDegrees,jawOpening:brushingRun.demo.jawOpening}:null,
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
    const heroSpinning=!startupHandoff.active&&heroSpin.update(now,{progress:storyProgress,reducedMotion,interacting:interaction,exploring,modified:view?.modified});
    if(finalViewTransition){
      const t=THREE.MathUtils.clamp((now-finalViewTransition.start)/(config.interaction.returnDurationMs??480),0,1);
      smileWeight=THREE.MathUtils.lerp(finalViewTransition.from,finalViewTransition.to,t*t*(3-2*t));
      if(exploring)applyState(inspectionProgress,true);
      if(t===1)finalViewTransition=null;
    }
    const target=storyProgress;
    let following=false;
    if(!exploring) {
      const dt=progressFrame?Math.min(50,Math.max(0,now-progressFrame)):16.67;
      renderProgress=reducedMotion?target:renderProgress+(target-renderProgress)*(1-Math.exp(-dt/85));
      if(Math.abs(target-renderProgress)<.00002)renderProgress=target;
      following=renderProgress!==target;
      applyState(renderProgress,true);
      if(view?.modified&&manualChapter&&dentalState.chapterId!==manualChapter){
        const {travel}=getJourneyScrollMetrics(section,stage);
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
    const brushingMoving=updateFullBrushing(now);
    brushingControls.update({visible:canBrushFullArch(),demo:brushingRun?.demo});
    const brushingFrameTarget=profile.compact
      ?THREE.MathUtils.smoothstep(Math.abs(brushingRun?.demo?.viewYaw??0),1.02,2.3)
      :0;
    brushingFraming=reducedMotion?brushingFrameTarget:THREE.MathUtils.damp(brushingFraming,brushingFrameTarget,9,fullDt*.001);
    if(Math.abs(brushingFraming-brushingFrameTarget)<.002)brushingFraming=brushingFrameTarget;
    const changing=view?.update(now)??false;
    const healthyAnatomyMoving=updateHealthyAnatomy(now);
    // Shift the sensor's aim into the free centre of the stage while the
    // tooth is isolated; the story rig restores its own framing afterwards.
    const sensor=rig.camera.view;
    if(sensor?.enabled&&(focusBlend>.001||focusSensorApplied||brushingFraming>0)){
      const sx=THREE.MathUtils.lerp(THREE.MathUtils.lerp(rig.pose.screenX??.5,profile.compact?.5:.64,focusBlend),.64,brushingFraming);
      const sy=THREE.MathUtils.lerp(THREE.MathUtils.lerp(rig.pose.screenY??.5,profile.compact?.65:.57,focusBlend),.64,brushingFraming);
      rig.camera.setViewOffset(sensor.fullWidth,sensor.fullHeight,(.5-sx)*sensor.fullWidth,(.5-sy)*sensor.fullHeight,sensor.fullWidth,sensor.fullHeight);
      focusSensorApplied=focusBlend>.001;
    }
    if(!healthyAnatomy.plate){
      arch.updateView(rig.camera);
      annotations?.update({state:dentalState,camera:rig.camera,brush,free:exploring});
    }
    if(smileBacking&&brushingRun?.demo?.jawOpening>.01)smileBacking.visible=false;
    if(lastFrame&&(interaction||changing||scrolling))adaptive.recordFrame(now-lastFrame);
    lastFrame=now;
    const camera=healthyAnatomy.plate?anatomyPlate.camera:rig.camera;
    try {
      renderer.info.reset();renderer.render(scene,camera);renderedFrames++;
      if(shaderError)throw new Error('Dental surface shader failed to compile.');
    }catch(error){showError('3D zobrazenie sa nepodarilo vykresliť.',error);return;}
    const startupWasActive=startupHandoff.active;
    if(renderedFrames===1)startupHandoff.start(now,arch.teeth.get(36).mesh,camera,reducedMotion||progress>.001);
    const startupMoving=startupHandoff.update(now)||startupWasActive;
    canvas.dataset.frameCount=String(renderedFrames);
    canvas.dataset.shaderErrors=String(shaderError?1:0);
    canvas.dataset.visibleTeeth=String(arch.visibleCount);
    if(changing||interaction||finalViewTransition||following||navigationMotion||focusMove.moving||healthyAnatomyMoving||brushingMoving){adaptive.beginInteraction();requestRender();}
    else {
      if(!scrolling)adaptive.endInteraction();
      if(startupMoving||heroSpinning||anatomyState.moving||fullAnatomyMoving||brushingFraming!==brushingFrameTarget||Math.abs(focusTarget-focusBlend)>.002)requestRender();
      else if(!scrolling){lastFrame=0;progressFrame=0;}
    }
  }
  function resize() {
    if(disposed||!renderer)return;
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width||!height)return;
    const changed=width!==logicalWidth||height!==logicalHeight;
    if(!changed&&fittedRig===rig)return;
    if(changed){renderer.setSize(width,height,false);logicalWidth=width;logicalHeight=height;startupHandoff.resize();}
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
    startupHandoff.finish();
    if(frame)cancelAnimationFrame(frame);frame=0;clearTimeout(settleTimer);
    releaseRendererLuts(renderer,scene);
    observer?.disconnect();scroll?.dispose();controls?.dispose();view?.dispose();annotations?.dispose();rig?.dispose();adaptive?.dispose();lighting?.dispose();healthyAnatomyUI.dispose();anatomyControls.dispose();fullAnatomyControls.dispose();brushingControls.dispose();manualUI.dispose();ui.dispose();
    anatomyPlate?.dispose();
    fullBrushing?.dispose();
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
  window.addEventListener('wheel',cancelNavigation,{passive:true,signal});
  window.addEventListener('pointerdown',(event)=>{
    if(!event.target.closest?.('#journey-mobile-next, #journey-mobile-previous, .journey-step, #journey-home, #journey-show-all'))cancelNavigation();
  },{passive:true,signal});
  window.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'&&brushingRun&&!document.querySelector('dialog[open]')){
      event.preventDefault();stopFullBrushing();return;
    }
    if(!event.defaultPrevented&&['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)&&
      !event.target.closest?.('button, select, input, textarea'))cancelNavigation();
  },{signal});
  window.addEventListener('resize',()=>{navigationMotion=null;},{signal});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelNavigation();if(frame)cancelAnimationFrame(frame);frame=0;lastFrame=0;progressFrame=0;anatomyMotion.resetClock();adaptive?.endInteraction();}
    else {scroll?.refresh();requestRender();}
  },{signal});
  canvas.addEventListener('webglcontextlost',(e)=>{
    e.preventDefault();contextLost=true;if(frame)cancelAnimationFrame(frame);frame=0;controls&&(controls.enabled=false);
    showError('3D zobrazenie sa prerušilo. Obnovte ho tlačidlom nižšie.',new Error('WebGL context lost'));
  },{signal});

  function installStoryRig(crownsReady) {
    const landmarks={...arch.landmarks,smile:crownsReady?arch.landmarks.smile:arch.landmarks.full};
    for(const name of ['smile','anatomy']){
      const cameraConfig=createStoryCameraConfig(site,config,{finalView:name,compact:profile.compact});
      finalTimelines[name]=createTimeline({landmarks:{...landmarks,...cameraConfig.landmarks},cameraOptions:cameraConfig.camera});
    }
    const previous=rig;
    rig=createJourneyCamera({timeline:finalTimelines.smile,alternateTimeline:finalTimelines.anatomy,config,camera:previous.camera,sampleOnly:true});
    previous.dispose();
    rig.resize(logicalWidth,logicalHeight);
    fittedRig=rig;
    if(manual)manualCameraPose(manual.cameraProgress);
    else applyState(exploring?inspectionProgress:renderProgress,true);
    Object.assign(controller,{rig,site,plaque,brush,path,annotations,timeline:finalTimelines[finalView]});
  }
  async function loadStoryStages(siteRequest) {
    const alive=()=>!disposed&&!contextLost;
    let crownRequest,crownsTransferred=false;
    try {
      const [neighborData,siteData]=await Promise.allSettled([
        loadModel(config,profile.compact?config.assets.compact:config.assets.desktop,signal),
        siteRequest,
      ]);
      if(neighborData.status==='fulfilled')atlas=neighborData.value;
      if(!alive()){disposeObject(atlas?.object);atlas=undefined;return;}
      if(neighborData.status==='rejected')throw neighborData.reason;
      if(siteData.status==='rejected')throw siteData.reason;
      if(siteData.value.error)throw siteData.value.error;
      site=siteData.value.value;
      arch.attachNeighbors(atlas);
      // Register the teaching film while the neighbors are in their exact
      // seated geometry, before the scroll-driven arrival can move them.
      path=createCleaningPath(site);
      brush=createInterdentalBrush({path,compact:profile.compact,options:config.brush});
      plaque=createPlaque({site,path,arch,compact:profile.compact,options:config.plaque});
      scene.add(brush.object,plaque.object);
      annotations=createAnnotations({layer:document.querySelector('#journey-annotations'),canvas,site,arch,path,compact:profile.compact,requestRender});
      installStoryRig(false);
      studyReady=true;
      advanceScrollLimit(studyLimit);

      // Rooted teeth can fly as soon as the upper molar joins the atlas.
      // The larger crown atlas only gates the final change into a smile.
      crownRequest=loadCrownAtlas(config,signal).then(value=>({value}),error=>({error}));
      upperMolar=await loadModel(config,profile.compact?config.assets.upperCompact:config.assets.upperDesktop,signal);
      if(!alive()){disposeObject(upperMolar.object);upperMolar=undefined;return;}
      arch.attachAtlas(atlas,upperMolar);
      await renderer.compileAsync(arch.object,rig.camera,scene);
      if(!alive())return;
      flightReady=true;
      advanceScrollLimit(flightLimit);

      const crownData=await crownRequest;
      if(crownData.error)throw crownData.error;
      if(!alive())return;
      arch.attachCrowns(crownData.value);
      crownsTransferred=true;
      installStoryRig(true);
      const savedHeroWeight=heroAnatomy.weight;
      if(savedHeroWeight)heroAnatomy.setWeight(0);
      try{fullArchAnatomy=createFullArchAnatomy({arch});}
      finally{if(savedHeroWeight)heroAnatomy.setWeight(savedHeroWeight);}
      let fullCompile;
      try {
        if(savedHeroWeight)heroAnatomy.setWeight(0);
        fullArchAnatomy.setWeight(1);
        fullCompile=renderer.compileAsync(arch.object,rig.camera,scene);
      } finally {
        fullArchAnatomy.setWeight(0);
        if(savedHeroWeight)heroAnatomy.setWeight(savedHeroWeight);
      }
      await fullCompile;
      if(!alive())return;
      await prewarmSmileMaterials({arch,renderer,scene,camera:rig.camera,isAlive:alive});
      if(!alive())return;
      if(shaderError)throw new Error('Dental surface shader failed to compile.');
      storyReady=true;canvas.dataset.assetsReady='true';
      advanceScrollLimit(1);
    } catch(error) {
      if(!alive())return;
      atlasError=true;
      if(atlas&&!arch.ownsSource(atlas)){disposeObject(atlas.object);atlas=undefined;}
      if(upperMolar&&!arch.ownsSource(upperMolar)){disposeObject(upperMolar.object);upperMolar=undefined;}
      showError('Ďalšiu časť sa nepodarilo načítať. Skúste to znova.',error,{upcoming:true});
    } finally {
      if(crownRequest&&!crownsTransferred){
        const {value}=await crownRequest;
        disposeObject(value?.object);
      }
    }
  }

  controller.ready=(async()=>{
    try {
      ({renderer,scene}=createScene(canvas,config,profile));
      renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{shaderError=true;console.error('Dental shader:',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment));};
      observer=new ResizeObserver(resize);observer.observe(canvas);resize();
      const siteRequest=loadStoryData(config,config.assetsStory.site,signal).then(value=>({value}),error=>({error}));
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
      const timeline=createTimeline({landmarks:arch.landmarks,cameraOptions:createIntroCameraOptions(config)});
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
      anatomyPlate=createExplodedAnatomy(scene,arch.teeth.get(36).mesh,config);
      await renderer.compileAsync(anatomyPlate.models,anatomyPlate.camera,scene);
      if(disposed||contextLost)return controller;
      if(shaderError)throw new Error('Dental surface shader failed to compile.');
      ready=true;canvas.dataset.ready='true';canvas.dataset.profile=profile.name;canvas.dataset.revision=config.revision;
      resize();scroll=createScrollDriver({section,stage,onProgress:setProgress});
      Object.assign(controller,{scene,renderer,rig,controls,view,arch,profile,adaptive});
      requestRender();
      void loadStoryStages(siteRequest);
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
