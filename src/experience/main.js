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
import { clinicViews, createClinicShare, readClinicView } from './clinical-views.js';
import { sampleDentalStory, sampleOpeningDentalStory, sampleReducedDentalStory } from './dental-story.js';
import { STORY_TIMING } from './story-config.js';
import { createIntroCameraOptions, createOpeningCameraOptions, createStoryCameraConfig } from './story-camera.js';
import { createCleaningPath, makePathSample } from './cleaning-path.js';
import { createInterdentalBrush } from './interdental-brush.js';
import { createPlaque } from './plaque.js';
import { createViewController } from './view-controller.js';
import { createModelGestures } from './gestures.js';
import { createAnnotations } from './annotations.js';
import { createHealthyAnatomyUI } from './healthy-anatomy-ui.js';
import { createStoryAnatomy } from './story-anatomy.js';
import { createHeroAnatomy } from './hero-anatomy.js';
import { createHeroAnatomyMotion } from './hero-anatomy-motion.js';
import { createHeroAnatomyControls } from './hero-anatomy-controls.js';
import { createFullArchAnatomy } from './full-arch-anatomy.js';
import { createFullArchAnatomyControls } from './full-arch-anatomy-controls.js';
import { atlasCoverage, createFullArchFocus } from './full-arch-focus.js';
import { createDentalMapUI } from './dental-map-ui.js';
import { createFullArchBrushing } from './full-arch-brushing.js';
import { createFullArchBrushingControls } from './full-arch-brushing-controls.js';
import { createStartupHandoff } from './startup-handoff.js';
import { createOpeningFlight } from './opening-flight.js';
import { prewarmSmileMaterials } from './smile-prewarm.js';
import { createManualCleaning, sampleManualResultBrush } from './manual-cleaning.js';
import { createManualCleaningUI } from './manual-cleaning-ui.js';
import { createCleaningWindow } from './cleaning-window.js';
import { chooseQuality, createAdaptiveQuality } from '../prototype/quality.js';
import './stage.css';

export function createExperience(configuration=experienceConfig) {
  const config={...configuration,assetBaseURL:new URL(document.body.dataset.assetBase??'./',document.baseURI).href};
  const canvas=document.querySelector('#journey-canvas');
  const section=document.querySelector('#dental-journey');
  const stage=document.querySelector('#journey-stage');
  const startupHandoff=createStartupHandoff(stage,requestRender,skipOpening);
  const status=document.querySelector('#journey-status');
  const message=document.querySelector('#journey-message');
  const explore=document.querySelector('#journey-explore');
  const retry=document.querySelector('#journey-retry');
  const listeners=new AbortController(), signal=listeners.signal;
  const profile=chooseQuality(config);
  const query=new URLSearchParams(location.search), qa=query.has('qa'), clay=query.get('material')==='clay';
  const clinicView=readClinicView(query);
  let pendingClinicView=clinicView;
  let linkedTooth=clinicView===clinicViews.map ? query.get('zub') : null;
  let renderer,scene,arch,lighting,rig,controls,scroll,adaptive,observer,hero,atlas,upperMolar;
  let site,plaque,brush,path,view,annotations,heroAnatomy,fullArchAnatomy,mapUI;
  let studyReady=false,flightReady=false,crownsReady=false,storyReady=false;
  const studyLimit=config.presentation.steps.find(step=>step.id==='space').start-.001;
  const scrollReadiness=createScrollReadiness(0);
  const navigationTarget=()=>focusOrigin?.next??scrollReadiness.pendingTarget??navigationMotion?.target??null;
  const historyEntry=performance.getEntriesByType('navigation')[0]?.type;
  const resumeKey='zub-story-2-atlas-first:'+location.pathname+(clinicView?'?pohlad='+clinicView:'');
  let savedProgress=history.state?.zubStory2AtlasProgress;
  if(historyEntry==='reload'){
    try{const previous=Number.parseFloat(sessionStorage.getItem(resumeKey));if(Number.isFinite(previous))savedProgress=previous;}catch{}
  }
  let resumeProgress=!clinicView&&(historyEntry==='reload'||historyEntry==='back_forward')&&Number.isFinite(savedProgress)
    ? THREE.MathUtils.clamp(savedProgress,0,1) : null;
  const playOpening=!clinicView&&historyEntry!=='back_forward'&&(resumeProgress??0)<.002;
  if(playOpening)startupHandoff.startPosterTurn();
  history.scrollRestoration='manual';
  const dentalState={brushPose:{}};
  const openingState={brushPose:{}},openingOffset=new THREE.Vector3();
  sampleDentalStory(0,dentalState);
  let frame=0,renderedFrames=0,lastFrame=0,settleTimer,ready=false,disposed=false,shaderError=false,contextLost=false;
  let logicalWidth=0,logicalHeight=0,fittedRig=null;
  let progress=0,storyProgress=0,reducedMotion=false,exploring=false,interaction=false,scrolling=false,atlasError=false;
  let renderProgress=0,progressFrame=0;
  let openingComplete=false,openingSkipped=false,openingShown=false,openingShot=null,openingTimeline,openingFlight;
  applyScrollLimit();
  let navigationMotion=null, openCleaningOnArrival=false;
  const manualCleaning=createManualCleaning(),manualState={brushPose:{}},manualResultPose={};
  const manualStart=makePathSample(),manualEnd=makePathSample();
  const manualPointA=new THREE.Vector3(),manualPointB=new THREE.Vector3(),manualGripPoint=new THREE.Vector3();
  let manual=null,manualPointer=null,manualClock=0,manualAxis={x:1,y:0,lengthSq:1};
  let cleaningWindow,windowEnabled=false,windowChoice=null;
  let inspectionProgress=0,manualProgress=0,manualChapter=null,finalView='smile';
  const finalTimelines={};let smileWeight=1,finalViewTransition=null;
  let interiorRequested=false,interiorFdi=null,fullAnatomyWeight=0,fullAnatomyFrame=0,pendingFinalView=null;
  let fullBrushing,brushingRun=null,smileBacking,brushingFraming=0;
  const brushingFocus=new THREE.Vector3();
  let focusOrigin=null,focusLeavesStory=false,restoreMapPicker=false;
  const anatomyMotion=createHeroAnatomyMotion();
  const storyAnatomy=createStoryAnatomy();
  let anatomyState={active:false,layer:'whole',preset:'whole',amount:0,cut:0,highlight:null,moving:false,manual:false};
  const fullArchFocus=createFullArchFocus();
  const raycaster=new THREE.Raycaster(),pointerNdc=new THREE.Vector2();
  const detailDirection=new THREE.Vector3(),detailCenter=new THREE.Vector3();
  const neutralView={yaw:0,pitch:0,zoom:0,focus:[0,0,0]};
  canvas.dataset.ready='false'; canvas.dataset.assetsReady='false';
  const ui=createInterface({config,section,stage,signal,navigate,navigationTarget,repeatCleaning,
    explore:toggleExplore,reset:resetView,zoom,finalView:selectFinalView});
  const showClinicShare=createClinicShare(stage,config.assetBaseURL,signal);
  const manualUI=createManualCleaningUI({stage,onStart:startManualCleaning,onExit:exitManualCleaning,
    onWindowToggle(){if(windowAvailable()){windowChoice=!windowEnabled;updateUI();requestRender();}},
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
  const healthyAnatomyUI=createHealthyAnatomyUI({stage,signal,chapterNumber,chapterCount:config.presentation.steps.length,
    onSelect(layer){storyAnatomy.select(layer);requestRender();},
    onScrub(amount){storyAnatomy.scrub(amount);requestRender();},
    onFollow(){storyAnatomy.follow();requestRender();}});
  const anatomyControls=createHeroAnatomyControls({stage,onToggle(active){anatomyMotion.setActive(active);requestRender();}});
  const fullAnatomyControls=createFullArchAnatomyControls({stage,onToggle(active){
    if(!fullArchFocus.engaged||fullArchFocus.returning)return;
    interiorRequested=active;
    requestRender();
  },onSelect:focusTooth,onDetailChange:tooth=>ui.setAtlasTooth(tooth),onReturn:()=>{
    restoreMapPicker=fullArchFocus.fromMap;
    returnToArch();
  },onContinue:continueFromAtlas});
  const brushingControls=createFullArchBrushingControls({stage,signal,onToggle:toggleFullBrushing,onNext:nextBrushingPhase});

  function canBrushFullArch() {
    return crownsReady&&dentalState.chapterId==='dentition'&&finalView==='smile'&&atlasCoverage(dentalState.sceneProgress)===1&&
      arch.crownMix>.99999&&!finalViewTransition;
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

  function canUseAtlas() {
    return crownsReady&&!finalViewTransition&&!pendingFinalView&&!focusLeavesStory&&
      (fullArchFocus.fromMap||(dentalState.chapterId==='dentition'&&finalView==='anatomy'&&atlasCoverage(dentalState.sceneProgress)===1));
  }
  function canInspectStoryLayer(){return ready&&!manual&&!startupHandoff.active&&fullArchAnatomy&&anatomyState.active;}
  function inspectStoryLayer(layer){
    if(!layer||!canInspectStoryLayer())return;
    storyAnatomy.inspect(layer);
    requestRender();
  }
  function selectionMode(){return mapUI?.active?'map':canInspectStoryLayer()?'layer':canUseAtlas()?'atlas':null;}
  function pickInCanvas(event,mode){
    if(mode!==selectionMode())return;
    const box=canvas.getBoundingClientRect();
    pointerNdc.set((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2);
    raycaster.setFromCamera(pointerNdc,rig.camera);
    if(mode==='map'){
      mapUI.pick(raycaster,event);
      return;
    }
    if(mode==='layer'){
      inspectStoryLayer(fullArchAnatomy.pickStoryLayer(raycaster));
      return;
    }
    const candidates=[...arch.teeth.values()].map(item=>item.mesh).filter(mesh=>mesh?.visible);
    const hit=raycaster.intersectObjects(candidates,false)[0];
    if(hit?.object.userData.fdi)focusTooth(hit.object.userData.fdi);
  }
  function atlasFraming() {
    const compact=logicalWidth<=700&&logicalWidth<logicalHeight*1.5;
    const framing={compact,short:compact&&logicalHeight<680};
    const detail=compact&&stage.querySelector('.full-arch-anatomy-control[data-from-map]:not([hidden])');
    if(detail){
      const stageTop=canvas.getBoundingClientRect().top;
      framing.mapSpace={
        height:logicalHeight,top:detail.getBoundingClientRect().bottom-stageTop+14,
        bottom:stage.querySelector('.journey-dock').getBoundingClientRect().top-stageTop-16,
      };
    }
    return framing;
  }
  function captureAtlasPose() {
    const {camera}=rig, sensor=camera.view;
    return {position:camera.position.clone(),target:view.target.clone(),
      screenX:sensor?.enabled ? .5-sensor.offsetX/sensor.fullWidth : .5,
      screenY:sensor?.enabled ? .5-sensor.offsetY/sensor.fullHeight : .5,opticalZoom:camera.zoom};
  }
  function focusTooth(fdi,{map=false}={}) {
    const available=map?mapUI.active:canUseAtlas();
    if(!available)return;
    const firstFocus=!focusOrigin;
    const from=captureAtlasPose();
    // Lay out the new tooth's reading slot before fitting its roots. All three
    // topics reserve their space together, so switching tabs never moves the lens.
    const id=Number(fdi);
    if((map||fullArchFocus.fromMap)&&arch.teeth.get(id)?.mesh){
      fullAnatomyControls.update({visible:true,enabled:true,fromMap:true,focused:true,selectedFdi:id,
        active:fullArchFocus.selected===id&&interiorRequested});
    }
    if(!fullArchFocus.select(id,{arch,rig,framing:atlasFraming(),from,now:performance.now(),instant:reducedMotion,map}))return;
    if(fullArchFocus.fromMap)mapUI.remember(fullArchFocus.selected);
    updateClinicShare();
    restoreMapPicker=false;
    cancelNavigation();
    if(firstFocus){
      focusOrigin={view:view.captureDisplayed(),progress:renderProgress,next:null};
      view.restore(neutralView,{instant:true});
    }
    interiorRequested=false;
    manualChapter=null;
    requestRender();
  }
  function continueFromAtlas(){navigate(STORY_TIMING.anatomy.enamel[0]);}
  function beyondFocusedOverview(at) {
    if(!fullArchFocus.fromMap)return at>STORY_TIMING.atlas[1];
    const start=reducedMotion?STORY_TIMING.map.lower[0]:STORY_TIMING.map.hold[0];
    return at<start||at>=STORY_TIMING.map.close[0];
  }
  function atlasOverviewPose(){return focusLeavesStory?rig.pose:view.poseWithOffsets(rig.pose,focusOrigin.view);}
  function returnToArch({story=false}={}) {
    if(!focusOrigin)return;
    const retarget=story&&!focusLeavesStory;
    focusLeavesStory||=story;
    if(story)restoreMapPicker=false;
    interiorRequested=false;
    if(fullArchFocus.returnToArch(captureAtlasPose(),atlasOverviewPose(),performance.now(),reducedMotion,{retarget})){
      view.restore(neutralView,{instant:true});
    }
    requestRender();
  }
  function finishAtlasFocus() {
    const {view:previousView,next}=focusOrigin;
    fullArchFocus.clear();
    updateClinicShare();
    view.setStoryPose(rig.pose);
    view.restore(focusLeavesStory?neutralView:previousView,{instant:true});
    manualChapter=!focusLeavesStory&&view.modified?dentalState.chapterId:null;
    manualProgress=progress;
    interiorRequested=false;
    focusOrigin=null;focusLeavesStory=false;
    if(next!==null)navigate(next);
    requestRender();
  }

  function requestRender() {if(!disposed&&ready&&!document.hidden&&!frame)frame=requestAnimationFrame(render);}
  function skipOpening(){
    openingSkipped=true;
    requestRender();
  }
  function manualCameraPose(p) {
    const pose=rig.setProgress(p,{reducedMotion:false,alternateWeight:1-smileWeight});
    view.setStoryPose(pose);
    const radius=Math.max(1.1,pose.position.distanceTo(pose.target)*Math.tan(THREE.MathUtils.degToRad(config.camera.fov/2))*.68);
    lighting?.update(pose.target,radius);
  }
  function startManualCleaning({instant=false,fresh=false}={}) {
    if(!studyReady||manual||dentalState.chapterId!=='brush'||dentalState.sceneProgress>=STORY_TIMING.result[0])return;
    mapUI.update({active:false});
    // An in-story handoff keeps the same view of the working tip. A shared
    // manual demonstration starts with the whole tooth before the first tap.
    windowChoice=instant||fresh?false:windowEnabled;
    windowEnabled=windowChoice;
    cancelNavigation();
    const savedView=view.capture(),wasExploring=exploring;
    const original=exploring?inspectionProgress:renderProgress;
    leaveExplore();interaction=false;controls.enabled=false;
    manualCleaning.reset();
    sampleDentalStory(STORY_TIMING.manualAt,manualState);
    arch.setState(manualState);
    plaque.setState({visible:true,opacity:1,progress:0});
    brush.setPose(manualCleaning.state.pose);canvas.style.opacity='1';
    document.querySelector('#journey-annotations').hidden=true;
    const now=performance.now();
    manual={phase:instant?'active':'entering',resume:original,savedView,wasExploring,cameraFrom:original,cameraTo:STORY_TIMING.manualCamera,
      cameraProgress:instant?STORY_TIMING.manualCamera:original,began:now,resultAt:0,pendingNavigation:null,
      returnPose:{...dentalState.brushPose},returnPlaque:dentalState.cleaningProgress};
    manualClock=0;manualPointer=null;
    view.reset(now,reducedMotion||instant);updateUI();requestRender();
  }
  function exitManualCleaning(next=null) {
    if(!manual)return;
    if(next!==null)manual.pendingNavigation=next;
    if(manual.phase==='returning'||manual.phase==='restoring')return;
    if(manualCleaning.state.phase==='result'){
      manual.resume=STORY_TIMING.resultAt;
      sampleDentalStory(manual.resume,manualState);
      manual.returnPose={...manualState.brushPose};manual.returnPlaque=manualState.cleaningProgress;
      manual.wasExploring=false;manual.savedView=neutralView;
    }
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
    manualGripPoint.copy(brush.object.position).addScaledVector(path.directionWorld,-.83).project(rig.camera);
    // Put the handle just beside the projected shaft instead of over the
    // bristle/tooth contact. The actual drag axis remains unchanged.
    const length=Math.sqrt(manualAxis.lengthSq);
    const shaftX=(manualGripPoint.x+1)*width*.5-manualAxis.y/length*54;
    let shaftY=(1-manualGripPoint.y)*height*.5+manualAxis.x/length*54;
    const x=THREE.MathUtils.clamp(shaftX,42,width-42);
    // If the handle leaves the screen, slide its grip along the projected
    // shaft to the visible edge. Clamping x alone can put it over the lesson.
    if(Math.abs(manualAxis.x)>.25*length)shaftY+=(x-shaftX)*manualAxis.y/manualAxis.x;
    return {x,y:shaftY};
  }
  function showError(text,error,{upcoming=false}={}) {
    if(disposed)return;
    status.hidden=false;status.classList.add('error');status.classList.toggle('is-upcoming',upcoming);
    status.setAttribute('role','alert');message.textContent=text;retry.hidden=false;
    canvas.dataset.error=error?.message??text;
    if(!upcoming){
      ready=false;canvas.dataset.ready='false';
      if(!crownsReady)canvas.style.visibility='hidden';
      startupHandoff.finish();
      releaseOpeningWork?.();
      document.querySelector('#journey-annotations').hidden=true;
    }
    updateUI();
  }
  function windowAvailable(){
    return Boolean(cleaningWindow&&(manual||(dentalState.chapterId==='brush'&&dentalState.sceneProgress<STORY_TIMING.return[0])));
  }
  function updateCleaningWindow(now){
    return cleaningWindow?.update(rig.camera,windowEnabled,now,
      reducedMotion||dentalState.chapterId!=='brush'||dentalState.sceneProgress>STORY_TIMING.return[1]);
  }
  function updateClinicShare() {
    const sharingCleaning=manual||(dentalState.chapterId==='brush'&&dentalState.sceneProgress<STORY_TIMING.return[0]);
    showClinicShare(sharingCleaning?clinicViews.cleaning:dentalState.chapterId==='anatomy'?clinicViews.pulp:
      dentalState.chapterId==='map'?clinicViews.map:null,fullArchFocus.fromMap?fullArchFocus.selected:null);
  }
  function updateUI() {
    const complete=crownsReady;
    if(!windowAvailable()){windowChoice=null;windowEnabled=false;}
    else windowEnabled=windowChoice??!manual;
    ui.update({progress:exploring?inspectionProgress:storyProgress,ready,complete,exploring,finalView,compact:profile.compact,
      atlasFocused:Boolean(focusOrigin),state:dentalState,reducedMotion});
    updateClinicShare();
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
    if(!manual){
      const p=dentalState.sceneProgress;
      manualUI.update({chapterId:p>=STORY_TIMING.manualReady&&p<STORY_TIMING.result[0]?dentalState.chapterId:'',ready:studyReady,active:false,
        windowAvailable:windowAvailable(),windowEnabled});
    }
  }
  function leaveExplore(){if(!exploring)return;exploring=false;controls.setFree(false);interaction=false;}
  function applyScrollLimit() {
    const limit=scrollReadiness.limit;
    section.style.setProperty('--journey-ready-limit',String(limit));
    section.toggleAttribute('data-scroll-limited',limit<1);
  }
  function advanceScrollLimit(limit) {
    // Capture the native position before extending the document. A fling that
    // hit the former end is not a request to visit a later chapter.
    if(scroll&&!manual&&!exploring&&openingComplete){
      const observed=scroll.getProgress();
      if(Math.abs(observed-progress)>.00025)setProgress(observed);
    }
    const next=scrollReadiness.advance(limit);
    applyScrollLimit();
    if(next!==null&&!manual&&!exploring){
      if(resumeProgress===null)beginNavigation(next);
      else restoreStoryPosition(next);
    }
    updateUI();requestRender();
  }
  function cancelNavigation() {
    navigationMotion=null;
    openCleaningOnArrival=false;
    resumeProgress=null;
    scrollReadiness.cancel();
    if(focusOrigin)focusOrigin.next=null;
  }
  function restoreStoryPosition(next){
    ui.scrollTo(next,true);setProgress(next);
    renderProgress=storyProgress;
    if(next===resumeProgress)resumeProgress=null;
  }
  function saveStoryPosition(){
    try{sessionStorage.setItem(resumeKey,String(resumeProgress??progress));}catch{}
  }
  function repeatCleaning() {
    if(manual){
      manualCleaning.reset();manual.resultAt=0;requestRender();
      return;
    }
    navigate(STORY_TIMING.manualReady);
  }
  function navigate(next) {
    if(manual){exitManualCleaning(next);return;}
    resumeProgress=null;
    openCleaningOnArrival=next===STORY_TIMING.manualReady;
    storyAnatomy.follow();
    stopFullBrushing();
    leaveExplore();
    manualChapter=null;
    if(focusOrigin){
      focusOrigin.next=next;
      returnToArch({story:beyondFocusedOverview(next)});
      updateUI();
      return;
    }
    beginNavigation(scrollReadiness.plan(next));
    if(!focusOrigin&&view?.modified)view.reset(performance.now(),reducedMotion);
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
    if(!ready||disposed||brushingRun)return false;
    if(exploring)return true;
    cancelNavigation();
    exploring=true;inspectionProgress=dentalState.progress;
    controls.setFree(true);
    if(focus)canvas.focus({preventScroll:true});
    updateUI();requestRender();return true;
  }
  function toggleExplore() {
    if(manual){exitManualCleaning();return;}
    if(brushingRun)return;
    if(exploring){
      if(focusOrigin){leaveExplore();updateUI();requestRender();return;}
      const resume=inspectionProgress;leaveExplore();manualChapter=null;
      ui.scrollTo(resume,true);setProgress(resume);
      view.reset(performance.now(),reducedMotion);
    }
    else enterExplore(true);
    requestRender();
  }
  function resetView() {
    if(!ready||brushingRun)return;
    manualChapter=null;view.reset(performance.now(),reducedMotion);
    requestRender();
  }
  function markManual(){
    manualProgress=progress;manualChapter=dentalState.chapterId;requestRender();
  }
  function zoom(factor) {
    if(!ready||brushingRun)return;
    view.zoomBy(factor);markManual();
  }
  function selectFinalView(next){
    stopFullBrushing();
    if(!crownsReady||!finalTimelines[next]||dentalState.chapterId!=='dentition')return;
    if(next===finalView){pendingFinalView=null;return;}
    if(next==='smile'&&(focusOrigin||fullAnatomyWeight>0)){
      pendingFinalView='smile';returnToArch();requestRender();return;
    }
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
    if(playOpening&&!openingComplete){
      reducedMotion=Boolean(motion);
      requestRender();
      return rig.pose;
    }
    if(motion&&navigationMotion){
      next=navigationMotion.target;navigationMotion=null;ui.scrollTo(next,true);
    }
    if(!navigationMotion&&scrollReadiness.pendingTarget!==null&&next<progress-.002)scrollReadiness.cancel();
    const sample=scrollReadiness.sample(next);
    if(sample.blocked&&next-sample.progress>.00025)ui.scrollTo(sample.progress,true);
    progress=sample.progress;reducedMotion=Boolean(motion);
    if(brushingRun&&(progress<STORY_TIMING.atlas[0]||progress>STORY_TIMING.atlas[1]))stopFullBrushing();
    if(focusOrigin&&!focusLeavesStory&&beyondFocusedOverview(progress)){
      leaveExplore();
      returnToArch({story:true});
    }
    storyProgress=THREE.MathUtils.lerp(config.story.startProgress,config.story.endProgress,progress);
    if(exploring){
      applyState(inspectionProgress,false);updateUI();requestRender();return null;
    }
    if(reducedMotion&&!focusOrigin)renderProgress=storyProgress;
    clearTimeout(settleTimer);
    scrolling=true;
    // Initial chapter restoration and clinic links render a still. Keep the
    // full-resolution buffer for that first view, as for the opening molar.
    if(!startupHandoff.active)adaptive?.beginInteraction();
    settleTimer=setTimeout(()=>{
      scrolling=false;saveStoryPosition();
      if(!interaction){adaptive?.endInteraction();lastFrame=0;}
    },120);
    requestRender();
    return rig.pose;
  }
  function applyState(p,moveCamera) {
    if(reducedMotion)sampleReducedDentalStory(p,dentalState,scrollReadiness.limit);
    else sampleDentalStory(p,dentalState);
    if(fullArchFocus.engaged||brushingRun)dentalState.locate36=0;
    arch.setFinalView?.(finalView,smileWeight);
    arch.setState(dentalState,fullArchFocus.engaged?fullArchFocus.opacity:null,fullArchFocus.mapDetail,mapUI?.selected);
    plaque?.setState({visible:dentalState.plaqueVisibility>0,opacity:dentalState.plaqueDeposition*dentalState.plaqueVisibility,progress:dentalState.cleaningProgress});
    brush?.setPose(dentalState.brushPose);
    if(!moveCamera)return null;
    const pose=rig.setProgress(dentalState.sceneProgress,{reducedMotion:false,alternateWeight:1-smileWeight});
    applyCameraPose(pose);
    return pose;
  }
  function applyCameraPose(pose) {
    view?.setStoryPose(pose);
    const radius=Math.max(1.1,pose.position.distanceTo(pose.target)*Math.tan(THREE.MathUtils.degToRad(config.camera.fov/2))*.68);
    lighting?.update(pose.target,radius,arch.crownMix);
  }
  function report() {
    const teeth=arch?.report()??[];
    return {
      progress,storyProgress,renderProgress,sceneProgress:Number(canvas.dataset.sceneProgress),stage:canvas.dataset.stage,
      readiness:{limit:scrollReadiness.limit,pendingTarget:scrollReadiness.pendingTarget,study:studyReady,flight:flightReady,crowns:crownsReady},
      cleaningWindow:{enabled:windowEnabled,amount:cleaningWindow?.amount??0},
      opening:openingShot?{...openingShot}:null,
      manualCleaning:manual?{active:true,transition:manual.phase,position:manualCleaning.state.position,
        target:manualCleaning.state.target,phase:manualCleaning.state.phase,cleaningProgress:manualCleaning.state.cleaningProgress,
        travelled:manualCleaning.state.travelled,passes:manualCleaning.state.completedPasses}:null,
      fullBrushing:brushingRun?.demo?{phase:brushingRun.demo.phase,done:brushingRun.demo.done,
        angleDegrees:brushingRun.demo.angleDegrees,jawOpening:brushingRun.demo.jawOpening}:null,
      healthyAnatomy:{...anatomyState},
      heroAnatomy:{weight:heroAnatomy?.weight??0},
      fullAnatomy:fullArchAnatomy?.report()??{weight:0,teeth:0},
      focusedTooth:fullArchFocus.selected,focusMoving:fullArchFocus.moving,focusReturning:fullArchFocus.returning,focusHasOrigin:Boolean(focusOrigin),
      focusFromMap:fullArchFocus.fromMap,
      ready,assetsReady:storyReady,anatomyReady:arch?.assetsReady??false,disposed,exploring,mode:exploring?'free':'presentation',finalView,closureCm:arch?.closureCm,crownMix:arch?.crownMix,reducedMotion,view:view?.report(),
      composition:rig?{focus:[rig.pose.screenX,rig.pose.screenY],opticalZoom:rig.pose.opticalZoom,fullSensor:[rig.camera.view?.fullWidth,rig.camera.view?.fullHeight]}:null,
      typography:ui.report(),annotations:annotations?.report(),map:mapUI?.report(),
      profile:profile.name,frames:renderedFrames,teeth,
      visibleTeeth:teeth.filter((t)=>t.loaded&&t.reveal>.00001).map((t)=>t.fdi),
      fullyVisibleTeeth:teeth.filter((t)=>t.loaded&&t.reveal>.99999).map((t)=>t.fdi),
      camera:rig?.camera.position.toArray(),target:view?.target.toArray(),storyTarget:rig?.target.toArray(),
      drawCalls:renderer?.info.render.calls,renderTriangles:renderer?.info.render.triangles,
      pixelRatio:renderer?.getPixelRatio(),gpuGeometries:renderer?.info.memory.geometries,gpuTextures:renderer?.info.memory.textures,
      shaderErrors:shaderError||renderer?.info.programs?.some((p)=>p.diagnostics?.runnable===false)?1:0,
      environment:lighting?.label,heroBytes:hero?.bytes,atlasBytes:atlas?.bytes,upperMolarBytes:upperMolar?.bytes,
      story:{chapterId:dentalState.chapterId,sceneProgress:dentalState.sceneProgress,
        locate36:dentalState.locate36,toothExtraction:dentalState.toothExtraction,
        mapLower:dentalState.mapLower,mapUpper:dentalState.mapUpper,mapSite:dentalState.mapSite,
        brushStoryPhase:dentalState.chapterId!=='brush'?null:dentalState.sceneProgress>=STORY_TIMING.result[0]?'result':'cleaning',
        finalSmile:dentalState.finalSmile,cleaningProgress:dentalState.cleaningProgress,plaqueDeposition:dentalState.plaqueDeposition,
        plaqueCoverage:dentalState.plaqueCoverage,brushPose:{...dentalState.brushPose},plaque:plaque?.report(),brush:brush?.report()},
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
    const pose=state.phase==='result'?sampleManualResultBrush(state.pose,now-manual.resultAt,reducedMotion,manualResultPose):state.pose;
    const original=manual.returnPose;
    brush.setPose({visibility:THREE.MathUtils.lerp(original.visibility,pose.visibility,amount),
      alignment:THREE.MathUtils.lerp(original.alignment,pose.alignment,amount),
      insertion:THREE.MathUtils.lerp(original.insertion,pose.insertion,amount),
      stroke:THREE.MathUtils.lerp(original.stroke,pose.stroke,amount),phase:pose.phase});
    plaque.setState({visible:true,opacity:1,progress:THREE.MathUtils.lerp(manual.returnPlaque,state.cleaningProgress,amount)});
    const grip=updateManualProjection();
    manualUI.update({chapterId:'brush',ready:true,active:true,phase:state.phase,windowAvailable:true,windowEnabled,
      started:state.furthestInsertion>.005||state.position>.005,gripX:grip.x,gripY:grip.y,
      position:state.position,canDrag:manual.phase==='active',angle:Math.atan2(manualAxis.y,manualAxis.x)*180/Math.PI});
    arch.updateView(rig.camera);
    const windowMoving=updateCleaningWindow(now);
    try{renderer.info.reset();renderer.render(scene,rig.camera);renderedFrames++;}
    catch(error){showError('3D zobrazenie sa nepodarilo vykresliť.',error);return;}
    canvas.dataset.frameCount=String(renderedFrames);
    if(manual.phase!=='active'||state.moving||state.dragging||changing||windowMoving||(state.phase==='result'&&pose.visibility>0))requestRender();
    else {manualClock=0;lastFrame=0;}
  }
  function drawScene(){
    try {
      renderer.info.reset();renderer.render(scene,rig.camera);renderedFrames++;
      if(shaderError)throw new Error('Dental surface shader failed to compile.');
    }catch(error){showError('3D zobrazenie sa nepodarilo vykresliť.',error);return false;}
    canvas.dataset.frameCount=String(renderedFrames);
    canvas.dataset.shaderErrors=String(shaderError?1:0);
    canvas.dataset.visibleTeeth=String(arch.visibleCount);
    return true;
  }
  function renderOpening(now,shot){
    // The close-up starts at Retina resolution. Use the same adaptive
    // budget as a touch gesture while the entire mobile arch is moving.
    if(profile.compact&&shot.phase==='flight'){
      adaptive.beginInteraction();
      if(lastFrame)adaptive.recordFrame(now-lastFrame);
      lastFrame=now;
    }
    sampleOpeningDentalStory(shot.progress,openingState);
    arch.setState(openingState);
    const pose=rig.setProgress(shot.progress,{reducedMotion:false,alternateWeight:0,timeline:openingTimeline});
    if(shot.yaw){
      openingOffset.subVectors(pose.position,pose.target).applyAxisAngle(rig.camera.up,shot.yaw);
      pose.position.copy(pose.target).add(openingOffset);
    }
    applyCameraPose(pose);
    view.update(now);
    // Centre the lone tooth under the loading portrait, then ease back to
    // the authored framing before the rest of the arch flies into place.
    const sensor=rig.camera.view, flightEnd=STORY_TIMING.flight[1];
    const centered=THREE.MathUtils.smoothstep(shot.progress,flightEnd-.028,flightEnd);
    if(sensor?.enabled&&centered>0){
      const {fullWidth,fullHeight,offsetX,offsetY}=sensor;
      rig.camera.setViewOffset(fullWidth,fullHeight,offsetX*(1-centered),offsetY*(1-centered),fullWidth,fullHeight);
    }
    startupHandoff.frameTooth(rig.camera,shot.growth);
    arch.updateView(rig.camera);
    canvas.dataset.sceneProgress=shot.progress.toFixed(6);
    if(!drawScene())return;
    if(!openingShown){
      openingShown=true;
      startupHandoff.startIntro();
    }
    requestRender();
  }
  function render(now) {
    frame=0;
    if(disposed||document.hidden||!ready){lastFrame=0;return;}
    if(manual){renderManual(now);return;}
    if(!openingComplete){
      if(playOpening&&!reducedMotion&&(!openingSkipped||!crownsReady)){
        openingFlight??=createOpeningFlight(startupHandoff.takePosterYaw());
        openingShot=openingFlight.sample(now,crownsReady);
        if(!openingShot.done){renderOpening(now,openingShot);return;}
      }
      if(!crownsReady)return;
      openingShot=null;openingComplete=true;
      publishStoryReadiness();
    }
    // Hold the loading cover until the requested model and camera are ready.
    // No cinematic or intermediate chapter is exposed on a clinic link.
    if(pendingClinicView){
      const finale=pendingClinicView===clinicViews.smile;
      const map=pendingClinicView===clinicViews.map;
      const cleaning=pendingClinicView===clinicViews.cleaning;
      if(!openingComplete||((cleaning||finale||map)&&!studyReady))return;
      pendingClinicView=null;
      if(finale||map){
        restoreStoryPosition(map?STORY_TIMING.map.at:STORY_TIMING.finalHold[1]);
      }else if(cleaning){
        restoreStoryPosition(STORY_TIMING.manualReady);
        applyState(renderProgress,true);
        canvas.dataset.stage=dentalState.chapterId;
        canvas.dataset.sceneProgress=dentalState.sceneProgress.toFixed(6);
        startManualCleaning({instant:true});
        renderManual(now);
        startupHandoff.start();
        return;
      }else{
        restoreStoryPosition(config.presentation.steps.find(step=>step.id==='anatomy').at);
        applyState(renderProgress,true);
        storyAnatomy.update({progress:dentalState.sceneProgress,now,reducedMotion});
        storyAnatomy.select('pulp',now);
        storyAnatomy.inspect('pulp');
      }
    }
    if(navigationMotion){
      const {progress:at,done}=navigationMotion.motion.sample(now);
      window.scrollTo({top:navigationMotion.base+at*navigationMotion.travel,behavior:'instant'});
      setProgress(at);
      if(done)navigationMotion=null;
    }
    if(finalViewTransition){
      const t=THREE.MathUtils.clamp((now-finalViewTransition.start)/(config.interaction.returnDurationMs??480),0,1);
      smileWeight=THREE.MathUtils.lerp(finalViewTransition.from,finalViewTransition.to,t*t*(3-2*t));
      if(exploring)applyState(inspectionProgress,true);
      if(t===1)finalViewTransition=null;
    }
    const atlasWasEngaged=fullArchFocus.engaged;
    fullArchFocus.advance(now);
    const atlasReturned=fullArchFocus.returning&&!fullArchFocus.moving;
    // Complete the visible return to the atlas before a newer scroll target
    // can take the camera to the teaching tooth or a later chapter.
    const target=focusOrigin?.progress??storyProgress;
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
      if(openCleaningOnArrival&&studyReady&&!focusOrigin&&!navigationMotion&&
          Math.abs(renderProgress-STORY_TIMING.manualReady)<.0003){
        startManualCleaning({fresh:true});
        if(manual){renderManual(now);return;}
      }
    }
    else if(atlasWasEngaged||mapUI?.active)applyState(inspectionProgress,true);
    progressFrame=now;
    // ResizeObserver owns stage changes. Reading layout after UI writes in
    // every moving frame forces synchronous layout on mobile browsers.
    const heroReady=dentalState.chapterId==='hero'&&dentalState.sceneProgress>=STORY_TIMING.heroHold[0];
    const heroAnatomyState=anatomyMotion.update(now,{
      hero:heroReady,preview:false,
      reducedMotion,interacting:interaction||exploring||Boolean(view?.modified),
    });
    heroAnatomy?.setWeight(heroAnatomyState.weight);
    const finale=dentalState.chapterId==='dentition';
    if(!finale)pendingFinalView=null;
    const selected=fullArchFocus.selected;
    const interiorTarget=interiorRequested&&!fullArchFocus.returning&&!fullArchFocus.moving?selected:null;
    if(interiorTarget!==null&&interiorFdi===null){
      const mesh=arch.teeth.get(interiorTarget).mesh;
      mesh.geometry.boundingBox.getCenter(detailCenter);
      mesh.worldToLocal(detailDirection.copy(rig.camera.position)).sub(detailCenter).normalize();
      interiorFdi=interiorTarget;
    }
    const fullTarget=interiorFdi!==null&&interiorFdi===interiorTarget?1:0;
    const fullDt=fullAnatomyFrame?Math.min(50,Math.max(0,now-fullAnatomyFrame)):16.67;
    fullAnatomyFrame=now;
    const atlasWeight=fullArchFocus.fromMap?1:atlasCoverage(dentalState.sceneProgress);
    fullAnatomyWeight=reducedMotion||(!finale&&!fullArchFocus.fromMap)?fullTarget:THREE.MathUtils.damp(fullAnatomyWeight,fullTarget,11,fullDt*.001);
    if(Math.abs(fullTarget-fullAnatomyWeight)<.004)fullAnatomyWeight=fullTarget;
    if(fullAnatomyWeight===0&&fullTarget===0)interiorFdi=null;
    anatomyState=storyAnatomy.update({progress:dentalState.sceneProgress,now,reducedMotion});
    fullArchAnatomy?.setLocated(dentalState.locate36);
    if(anatomyState.active&&fullArchAnatomy){
      fullArchAnatomy.setStoryLayer(anatomyState);
    }else{
      fullArchAnatomy?.setDetail(interiorFdi,fullAnatomyWeight*atlasWeight,detailDirection);
    }
    healthyAnatomyUI.update(anatomyState);
    anatomyControls.update({chapterId:dentalState.chapterId,enabled:ready&&heroReady,active:heroAnatomyState.active,weight:heroAnatomyState.weight,archWeight:fullAnatomyWeight});
    fullAnatomyControls.update({visible:fullArchFocus.fromMap||(finale&&finalView==='anatomy'&&atlasWeight===1),fromMap:fullArchFocus.fromMap,
      enabled:canUseAtlas(),active:interiorRequested,focused:selected!==null,selectedFdi:selected,returning:fullArchFocus.returning});
    if(pendingFinalView&&!focusOrigin&&fullAnatomyWeight===0){const next=pendingFinalView;pendingFinalView=null;selectFinalView(next);}
    const fullAnatomyMoving=fullAnatomyWeight!==fullTarget||(interiorTarget!==null&&interiorTarget!==interiorFdi);
    const atlasPose=fullArchFocus.apply(rig.pose,dentalState.sceneProgress);
    if(atlasPose){
      view.setStoryPose(atlasPose);
      const radius=Math.max(1.1,atlasPose.position.distanceTo(atlasPose.target)*Math.tan(THREE.MathUtils.degToRad(config.camera.fov/2))*.68);
      lighting?.update(atlasPose.target,radius);
    }
    const brushingMoving=updateFullBrushing(now);
    brushingControls.update({visible:canBrushFullArch(),demo:brushingRun?.demo});
    const brushingFrameTarget=profile.compact
      ?THREE.MathUtils.smoothstep(Math.abs(brushingRun?.demo?.viewYaw??0),1.02,2.3)
      :0;
    brushingFraming=reducedMotion?brushingFrameTarget:THREE.MathUtils.damp(brushingFraming,brushingFrameTarget,9,fullDt*.001);
    if(Math.abs(brushingFraming-brushingFrameTarget)<.002)brushingFraming=brushingFrameTarget;
    const changing=view?.update(now)??false;
    // Shift the sensor's aim into the free centre of the stage while the
    // tooth is isolated; the story rig restores its own framing afterwards.
    const sensor=rig.camera.view;
    if(sensor?.enabled&&(atlasPose||brushingFraming>0)){
      const sx=THREE.MathUtils.lerp(atlasPose?.screenX??rig.pose.screenX??.5,.64,brushingFraming);
      const sy=THREE.MathUtils.lerp(atlasPose?.screenY??rig.pose.screenY??.5,.64,brushingFraming);
      if(atlasPose)rig.camera.zoom=atlasPose.opticalZoom??rig.camera.zoom;
      rig.camera.setViewOffset(sensor.fullWidth,sensor.fullHeight,(.5-sx)*sensor.fullWidth,(.5-sy)*sensor.fullHeight,sensor.fullWidth,sensor.fullHeight);
    }
    arch.updateView(rig.camera);
    const windowMoving=updateCleaningWindow(now);
    mapUI.update({active:!fullArchFocus.fromMap&&dentalState.chapterId==='map'&&dentalState.mapUpper===1,
      inMapChapter:dentalState.chapterId==='map',
      camera:rig.camera,width:logicalWidth,height:logicalHeight});
    if(restoreMapPicker&&mapUI.active){mapUI.focusPicker();restoreMapPicker=false;}
    if(linkedTooth && mapUI.active) {
      const fdi=Number(linkedTooth);
      linkedTooth=null;
      if(arch.teeth.has(fdi))focusTooth(fdi,{map:true});
    }
    annotations?.update({state:dentalState,camera:rig.camera,brush,anatomy:anatomyState});
    if(smileBacking&&brushingRun?.demo?.jawOpening>.01)smileBacking.visible=false;
    if(lastFrame&&(interaction||changing||scrolling||fullArchFocus.moving))adaptive.recordFrame(now-lastFrame);
    lastFrame=now;
    if(!drawScene())return;
    if(atlasReturned&&fullAnatomyWeight===0)finishAtlasFocus();
    // The first numbered frame is the seated smile, or a restored chapter.
    if(crownsReady&&startupHandoff.active){
      if(openingShown)startupHandoff.finish();
      else startupHandoff.start();
      releaseOpeningWork?.();
    }
    if(changing||interaction||finalViewTransition||following||navigationMotion||fullArchFocus.moving||anatomyState.moving||brushingMoving){adaptive.beginInteraction();requestRender();}
    else {
      if(!scrolling)adaptive.endInteraction();
      if(heroAnatomyState.moving||fullAnatomyMoving||windowMoving||brushingFraming!==brushingFrameTarget)requestRender();
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
    if(playOpening&&!openingComplete){requestRender();return;}
    if(manual){manualCameraPose(manual.cameraProgress);requestRender();return;}
    applyState(exploring?inspectionProgress:dentalState.progress,true);
    if(focusOrigin)fullArchFocus.refit(rig,atlasFraming(),performance.now(),reducedMotion,
      fullArchFocus.returning?atlasOverviewPose():null);
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
    fullBrushing?.dispose();
    mapUI?.dispose();
    cleaningWindow?.dispose();
    fullArchAnatomy?.dispose();
    heroAnatomy?.dispose();
    brush?.dispose();plaque?.dispose();
    const atlasOwned=arch?.ownsSource(atlas),upperOwned=arch?.ownsSource(upperMolar);
    if(arch)arch.dispose();else disposeObject(hero?.object);
    if(atlas&&!atlasOwned)disposeObject(atlas.object);
    if(upperMolar&&!upperOwned)disposeObject(upperMolar.object);
    atlas=undefined;upperMolar=undefined;
    renderer?.renderLists.dispose();renderer?.dispose();
    canvas.dataset.ready='false';canvas.dataset.disposed='true';
  }
  const controller={dispose,ready:null,report,setProgress};
  if(qa)window.__dentalExperience=controller;
  retry.addEventListener('click',()=>location.reload(),{signal});
  window.addEventListener('pagehide',(e)=>{
    if(ready){
      saveStoryPosition();
      try{history.replaceState({...history.state,zubStory2AtlasProgress:resumeProgress??progress},'');}catch{}
    }
    if(!e.persisted)dispose();
  },{signal});
  // Any new user gesture takes precedence over an in-flight button journey.
  window.addEventListener('wheel',cancelNavigation,{passive:true,signal});
  window.addEventListener('pointerdown',(event)=>{
    if(!event.target.closest?.('#journey-mobile-next, #journey-mobile-previous, .journey-step, #journey-home, #journey-show-all'))cancelNavigation();
  },{passive:true,signal});
  window.addEventListener('keydown',(event)=>{
    if(!event.defaultPrevented&&event.key==='Escape'&&focusOrigin&&!document.querySelector('dialog[open]')){
      event.preventDefault();returnToArch();return;
    }
    if(event.key==='Escape'&&brushingRun&&!document.querySelector('dialog[open]')){
      event.preventDefault();stopFullBrushing();return;
    }
    if(!event.defaultPrevented&&['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)&&
      !event.target.closest?.('button, select, input, textarea'))cancelNavigation();
  },{signal});
  window.addEventListener('resize',()=>{navigationMotion=null;},{signal});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelNavigation();if(frame)cancelAnimationFrame(frame);frame=0;lastFrame=0;progressFrame=0;openingFlight?.pause();anatomyMotion.resetClock();adaptive?.endInteraction();}
    else {scroll?.refresh();requestRender();}
  },{signal});
  canvas.addEventListener('webglcontextlost',(e)=>{
    e.preventDefault();contextLost=true;if(frame)cancelAnimationFrame(frame);frame=0;controls&&(controls.enabled=false);
    showError('3D zobrazenie sa prerušilo. Obnovte ho tlačidlom nižšie.',new Error('WebGL context lost'));
  },{signal});

  function installStoryRig() {
    const landmarks={...arch.landmarks,smile:crownsReady?arch.landmarks.smile:arch.landmarks.full};
    for(const name of ['smile','anatomy']){
      const cameraConfig=createStoryCameraConfig(site,config,{finalView:name,compact:profile.compact,crownsReady});
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
  function publishStoryReadiness(){
    storyReady=crownsReady&&studyReady&&openingComplete;
    canvas.dataset.assetsReady=String(storyReady);
    advanceScrollLimit(!crownsReady||!openingComplete?0:!studyReady?studyLimit:1);
  }
  let releaseOpeningWork;
  async function loadStoryStages(siteRequest) {
    const alive=()=>!disposed&&!contextLost;
    const settled=promise=>promise.then(value=>({value}),error=>({error}));
    // Yield each batch to the existing renderer. Run work after its paint,
    // including when the renderer's RAF was queued later than this callback.
    const afterPaint=()=>new Promise(resolve=>{
      if(!alive()){resolve();return;}
      let timer;
      const raf=requestAnimationFrame(()=>{timer=setTimeout(done,0);});
      function done(){
        cancelAnimationFrame(raf);clearTimeout(timer);
        signal.removeEventListener('abort',done);
        resolve();
      }
      signal.addEventListener('abort',done,{once:true});
    });
    const atlasRequest=settled(loadModel(config,profile.compact?config.assets.compact:config.assets.desktop,signal));
    const upperRequest=settled(loadModel(config,profile.compact?config.assets.upperCompact:config.assets.upperDesktop,signal));
    const crownRequest=settled(loadCrownAtlas(config,signal));
    let crownsTransferred=false;
    try {
      const [lowerData,upperData]=await Promise.all([atlasRequest,upperRequest]);
      atlas=lowerData.value;upperMolar=upperData.value;
      if(!alive())return;
      if(lowerData.error||upperData.error)throw lowerData.error??upperData.error;
      await arch.attachAtlas(atlas,upperMolar,afterPaint);
      if(!alive())return;
      await renderer.compileAsync(arch.object,rig.camera,scene);
      if(!alive())return;
      flightReady=true;installStoryRig();publishStoryReadiness();

      const crownData=await crownRequest;
      if(crownData.error)throw crownData.error;
      if(!alive())return;
      crownsTransferred=true;
      await arch.attachCrowns(crownData.value,afterPaint);
      if(!alive())return;
      fullArchAnatomy=createFullArchAnatomy({arch});
      await prewarmSmileMaterials({arch,renderer,scene,camera:rig.camera});
      if(!alive())return;
      if(shaderError)throw new Error('Dental surface shader failed to compile.');
      crownsReady=true;
      if(playOpening&&!openingComplete){
        // Only the smile landmark changes when the final crowns arrive.
        openingTimeline=createTimeline({landmarks:arch.landmarks,cameraOptions:createOpeningCameraOptions(config,{compact:profile.compact})});
      }
      installStoryRig();publishStoryReadiness();
      if(playOpening&&!openingComplete&&!reducedMotion){
        // Registration, section textures and picking data are not used by
        // the flying teeth. Do this work after the seated smile is drawn.
        await new Promise(resolve=>{
          releaseOpeningWork=resolve;
          signal.addEventListener('abort',resolve,{once:true});
        });
        signal.removeEventListener('abort',releaseOpeningWork);
        releaseOpeningWork=undefined;
      }
      if(!alive())return;
      await afterPaint();
      if(!alive())return;
      heroAnatomy=createHeroAnatomy({arch});
      // The clinical links can need these models on their very first frame.
      const {value,error}=await siteRequest;
      if(!alive())return;
      if(error)throw error;
      path=createCleaningPath(value);
      brush=createInterdentalBrush({path,compact:profile.compact,options:config.brush});
      await afterPaint();
      if(!alive())return;
      plaque=createPlaque({site:value,path,arch,compact:profile.compact,options:config.plaque});
      cleaningWindow=createCleaningWindow(arch.teeth.get(37),path);
      void cleaningWindow.prewarm(renderer,rig.camera,scene).catch(error=>console.warn('Cleaning window warm-up:',error));
      annotations.setTeachingSite(value);
      scene.add(brush.object,plaque.object);
      site=value;studyReady=true;
      installStoryRig();publishStoryReadiness();
      const mayWarmLesson=async()=>{
        await afterPaint();
        return alive()&&!manual&&!interaction&&!scrolling&&!navigationMotion&&!fullArchFocus.engaged&&!brushingRun;
      };
      void fullArchAnatomy.prewarmStory(renderer,scene,rig.camera,mayWarmLesson).catch(error=>console.warn('Dental layers warm-up:',error));
    } catch(error) {
      if(!alive())return;
      atlasError=true;
      showError(crownsReady?'Ďalšiu časť sa nepodarilo načítať. Skúste to znova.'
        :'3D chrup sa nepodarilo načítať. Skúste to znova.',error,{upcoming:crownsReady&&!pendingClinicView});
    } finally {
      if(atlas&&!arch?.ownsSource(atlas)){disposeObject(atlas.object);atlas=undefined;}
      if(upperMolar&&!arch?.ownsSource(upperMolar)){disposeObject(upperMolar.object);upperMolar=undefined;}
      if(!crownsTransferred){
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
      mapUI=createDentalMapUI({stage,canvas,arch,requestRender,onSelect:fdi=>focusTooth(fdi,{map:true})});
      annotations=createAnnotations({layer:document.querySelector('#journey-annotations'),canvas,arch,compact:profile.compact,requestRender,
        onAnatomySelect:inspectStoryLayer,getAnatomyAnchors:(camera,layer)=>fullArchAnatomy?.getStoryLayerAnchors(camera,layer)??[]});
      const timeline=createTimeline({landmarks:arch.landmarks,cameraOptions:createIntroCameraOptions(config)});
      if(playOpening){
        // The lone tooth and its authored seat are ready before the arch downloads.
        openingTimeline=createTimeline({landmarks:{...arch.landmarks,smile:arch.landmarks.full},
          cameraOptions:createOpeningCameraOptions(config,{compact:profile.compact})});
      }
      rig=createJourneyCamera({timeline,config,sampleOnly:true});
      view=createViewController({camera:rig.camera,config});view.setStoryPose(rig.pose);view.update();
      adaptive=createAdaptiveQuality({renderer,profile,requestRender,config});
      controls=createModelGestures({canvas,view,config,signal,getTapMode:selectionMode,onTap:pickInCanvas,
        onStart(){
          interaction=true;adaptive.beginInteraction();requestRender();
        },
        onEnd(){interaction=false;requestRender();},onChange:markManual});
      canvas.addEventListener('keydown',(event)=>{
        if(startupHandoff.active||manual||!controls.enabled)return;
        if(event.altKey||event.metaKey||event.ctrlKey)return;
        if(event.key==='Escape'){
          if(focusOrigin){event.preventDefault();returnToArch();}
          else if(exploring){event.preventDefault();toggleExplore();(explore.hidden?document.querySelector('#journey-hero-explore'):explore).focus({preventScroll:true});}
          else if(view.modified){event.preventDefault();resetView();}
          return;
        }
        if(event.key==='Home'){event.preventDefault();resetView();return;}
        if(['+','=','-','_'].includes(event.key)){event.preventDefault();zoom(['+','='].includes(event.key)?.88:1/.88);return;}
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
        event.preventDefault();if(!ready)return;
        view.orbit(event.key==='ArrowLeft'?-config.interaction.keyboardAzimuthStep:event.key==='ArrowRight'?config.interaction.keyboardAzimuthStep:0,
          event.key==='ArrowUp'?config.interaction.keyboardPolarStep:event.key==='ArrowDown'?-config.interaction.keyboardPolarStep:0);markManual();
      },{signal});
      // Only the lit exterior is needed for the first real canvas frame.
      await renderer.compileAsync(scene,rig.camera);
      if(disposed||contextLost)return controller;
      if(shaderError)throw new Error('Dental surface shader failed to compile.');
      ready=true;canvas.dataset.ready='true';canvas.dataset.profile=profile.name;canvas.dataset.revision=config.revision;
      resize();scroll=createScrollDriver({section,stage,onProgress:setProgress});
      Object.assign(controller,{scene,renderer,rig,controls,view,arch,profile,adaptive,mapUI});
      if(resumeProgress!==null)restoreStoryPosition(scrollReadiness.plan(resumeProgress));
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
