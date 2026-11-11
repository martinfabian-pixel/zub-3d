import { MathUtils, Matrix4, Vector3 } from 'three';

// Alpha bounds of the first and last cells of startup-tooth.webp.
const sprite={size:128,centerX:60,centerY:55.5,height:103,steps:30};

/** Reveal the 3D canvas first, then release the chapter controls. */
export function createStartupHandoff(stage, requestRender, onSkip) {
  const document=stage.ownerDocument;
  const body=document.body;
  const window=document.defaultView;
  const loader=stage.querySelector('#journey-startup');
  const tooth=loader?.querySelector('.startup-tooth');
  const view=stage.querySelector('.view-shell');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const projection=new Matrix4(),vertex=new Vector3();
  let fade=null, alignment=null, framing=null, skip=null, introListeners=null, viewWasInert=false;

  function measureFraming(mesh,camera,sensor){
    const position=mesh?.geometry?.getAttribute('position');
    const spriteRect=tooth?.getBoundingClientRect();
    if(!position||!spriteRect?.height||!view)return null;
    const {fullWidth:width,fullHeight:height,offsetX,offsetY}=sensor;
    const viewRect=view.getBoundingClientRect();
    mesh.updateWorldMatrix(true,false);
    projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(mesh.matrixWorld);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let i=0;i<position.count;i++){
      vertex.fromBufferAttribute(position,i).applyMatrix4(projection);
      minX=Math.min(minX,vertex.x);maxX=Math.max(maxX,vertex.x);
      minY=Math.min(minY,vertex.y);maxY=Math.max(maxY,vertex.y);
    }
    const modelHeight=(maxY-minY)*height*.5;
    if(!Number.isFinite(modelHeight)||modelHeight<=0)return null;
    const scale=Math.min(1,spriteRect.height*sprite.height/sprite.size/modelHeight);
    const modelX=(minX+maxX)*width*.25+offsetX;
    const modelY=-(minY+maxY)*height*.25+offsetY;
    const spriteX=spriteRect.left-viewRect.left+spriteRect.width*sprite.centerX/sprite.size;
    const spriteY=spriteRect.top-viewRect.top+spriteRect.height*sprite.centerY/sprite.size;
    return {scale,x:width*.5+modelX*scale-spriteX,y:height*.5+modelY*scale-spriteY};
  }

  function clearAlignment(){
    alignment?.cancel();alignment=null;
    tooth?.style.removeProperty('animation');
    tooth?.style.removeProperty('background-position-x');
  }

  function finish() {
    const wasLoading=body.hasAttribute('data-journey-loading');
    const wasCinematic=body.dataset.journeyHandoff==='cinematic';
    const returnFocus=skip&&document.activeElement===skip&&skip.matches(':focus-visible');
    body.removeAttribute('data-journey-loading');
    body.removeAttribute('data-journey-handoff');
    fade?.cancel();fade=null;
    clearAlignment();framing=null;
    loader?.style.removeProperty('visibility');
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

  function fadeLoader(afterFade,duration=260) {
    if(reducedMotion.matches||!loader?.animate){afterFade();return;}
    fade=loader.animate([{opacity:1},{opacity:0}],{duration,easing:'ease-out',fill:'forwards'});
    fade.finished.then(afterFade,()=>{});
  }

  function revealIntro(){
    body.dataset.journeyHandoff='cinematic';
    clearAlignment();
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
    skip.addEventListener('click',()=>onSkip?.(),{signal});
    window.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||event.defaultPrevented)return;
      event.preventDefault();
      onSkip?.();
    },{signal});
    fadeLoader(()=>{if(loader)loader.style.visibility='hidden';},110);
    requestRender();
  }

  return {
    start(){
      if(!body.hasAttribute('data-journey-loading')||body.hasAttribute('data-journey-handoff'))return;
      body.dataset.journeyHandoff='reveal';
      fadeLoader(finish);
    },
    startIntro(){
      if(alignment||!body.hasAttribute('data-journey-loading')||body.hasAttribute('data-journey-handoff'))return;
      if(!tooth?.animate)return revealIntro();
      const progress=parseFloat(window.getComputedStyle(tooth).backgroundPositionX)/100||0;
      const frame=Math.round(MathUtils.clamp(progress,0,1)*sprite.steps);
      if(frame===0||frame===sprite.steps)return revealIntro();
      // Finish the current sprite revolution at the pose used by the live mesh.
      const remaining=sprite.steps-frame;
      const from=`${frame/sprite.steps*100}%`;
      tooth.style.backgroundPositionX=from;
      tooth.style.animation='none';
      alignment=tooth.animate([{backgroundPositionX:from},{backgroundPositionX:'100%'}],{
        duration:Math.min(220,remaining*16),easing:`steps(${remaining}, end)`,fill:'forwards',
      });
      alignment.finished.then(revealIntro,()=>{});
    },
    frameTooth(mesh,camera,growth){
      const sensor=camera.view;
      if(!sensor?.enabled||growth===1)return;
      framing??=measureFraming(mesh,camera,sensor);
      if(!framing)return;
      const {fullWidth,fullHeight,offsetX,offsetY}=sensor;
      camera.zoom*=MathUtils.lerp(framing.scale,1,growth);
      camera.setViewOffset(fullWidth,fullHeight,MathUtils.lerp(framing.x,offsetX,growth),
        MathUtils.lerp(framing.y,offsetY,growth),fullWidth,fullHeight);
    },
    resize(){framing=null;},
    finish,
    get aligning(){return alignment!==null;},
    get active(){return body.hasAttribute('data-journey-loading');},
  };
}
