import { MathUtils } from 'three';
import { createPortraitTurn } from './startup-portrait.js';

// Calibration of startup-molar.webp in the original square camera sensor.
// The tight crop has four transparent output pixels of padding on each side.
const portrait = {
  sensor: 2800, zoom: 1.35, cropWidth: 1285, cropOffsetX: -41.5, cropOffsetY: -135.5,
  width: 608, padding: 4,
};

/** Reveal the first completed live frame, then release the chapter controls. */
export function createStartupHandoff(stage, requestRender, onSkip) {
  const document=stage.ownerDocument;
  const body=document.body;
  const window=document.defaultView;
  const loader=stage.querySelector('#journey-startup');
  const tooth=loader?.querySelector('.startup-tooth');
  const view=stage.querySelector('.view-shell');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const portraitTurn=createPortraitTurn(tooth,reducedMotion);
  let fade=null, skip=null, introListeners=null, viewWasInert=false, framing=null;

  function finish() {
    const wasLoading=body.hasAttribute('data-journey-loading');
    const wasCinematic=body.dataset.journeyHandoff==='cinematic';
    const returnFocus=skip&&document.activeElement===skip&&skip.matches(':focus-visible');
    body.removeAttribute('data-journey-loading');
    body.removeAttribute('data-journey-handoff');
    fade?.cancel();fade=null;
    loader?.style.removeProperty('visibility');
    portraitTurn.release();
    if(introListeners){
      introListeners.abort();introListeners=null;
      view?.toggleAttribute('inert',viewWasInert);
      skip.remove();skip=null;
    }
    if(wasCinematic&&!reducedMotion.matches){
      for(const item of stage.querySelectorAll('.site-header, .journey-copy, .journey-dock, .journey-footer')){
        item.animate?.([{opacity:0},{opacity:1}],{duration:220,easing:'ease-out'});
      }
    }
    if(returnFocus)stage.querySelector('#journey-home')?.focus({preventScroll:true});
    if(wasLoading)requestRender();
  }

  function fadeLoader(afterFade,duration) {
    if(reducedMotion.matches||!loader?.animate){afterFade();return;}
    fade=loader.animate([{opacity:1},{opacity:0}],{duration,easing:'ease-out',fill:'forwards'});
    fade.finished.then(afterFade,()=>{});
  }

  function startIntro(){
    if(!body.hasAttribute('data-journey-loading')||body.hasAttribute('data-journey-handoff'))return;
    body.dataset.journeyHandoff='cinematic';
    viewWasInert=Boolean(view?.hasAttribute('inert'));
    view?.setAttribute('inert','');
    introListeners=new AbortController();
    const {signal}=introListeners;
    skip=document.createElement('button');
    skip.id='journey-skip-intro';
    skip.className='outline-button startup-skip';
    skip.type='button';
    skip.textContent='Preskočiť úvod';
    skip.setAttribute('aria-keyshortcuts','Escape');
    stage.append(skip);
    skip.addEventListener('click',onSkip,{signal});
    window.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||event.defaultPrevented)return;
      event.preventDefault();
      onSkip();
    },{signal});
    fadeLoader(()=>{
      loader.style.visibility='hidden';
      loader.setAttribute('aria-hidden','true');
      portraitTurn.release();
    },110);
  }

  function frameTooth(camera,growth){
    const sensor=camera.view;
    if(!sensor?.enabled||growth===1||!tooth||!view)return;
    const {fullWidth:w,fullHeight:h,offsetX,offsetY}=sensor;
    if(!framing||framing.w!==w||framing.h!==h){
      const box=tooth.getBoundingClientRect(),stageBox=view.getBoundingClientRect();
      if(!box.width||!box.height)return;
      const scale=box.width*(1-2*portrait.padding/portrait.width)/portrait.cropWidth;
      framing={w,h,zoom:portrait.zoom*portrait.sensor*scale/h,
        x:w*.5+portrait.cropOffsetX*scale-(box.left-stageBox.left+box.width*.5),
        y:h*.5+portrait.cropOffsetY*scale-(box.top-stageBox.top+box.height*.5)};
    }
    camera.zoom=MathUtils.lerp(framing.zoom,camera.zoom,growth);
    camera.setViewOffset(w,h,MathUtils.lerp(framing.x,offsetX,growth),MathUtils.lerp(framing.y,offsetY,growth),w,h);
  }

  return {
    start(){
      if(!body.hasAttribute('data-journey-loading')||body.hasAttribute('data-journey-handoff'))return;
      body.dataset.journeyHandoff='reveal';
      fadeLoader(finish,140);
    },
    startIntro,frameTooth,finish,
    startPosterTurn:portraitTurn.start,
    takePosterYaw:portraitTurn.freeze,
    get active(){return body.hasAttribute('data-journey-loading');},
  };
}
